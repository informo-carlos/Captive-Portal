// swan-api — sidecar HTTP que gerencia conexões IPsec do strongSwan.
//
// Roda no MESMO network namespace que o container `strongswan` (via
// network_mode: "service:strongswan" no docker-compose).
//
// Usa swanctl CLI (system process) pra gerenciar connections.
// Mantém um swanctl.conf gerado dinamicamente com base nas conexões
// adicionadas via API. Cada conexão é um peer (tenant).
//
// Auth: Authorization: Bearer <SWAN_API_KEY>
//
// Endpoints:
//   GET    /health                 (sem auth)
//   POST   /peers                  body: {peer_id, peer_ip, psk, remote_id?}
//   GET    /peers
//   GET    /peers/:peer_id         status do CHILD_SA (handshake/bytes)
//   DELETE /peers/:peer_id
//
// peer_id é o identificador único do peer (geralmente o tenant_id do banco,
// ou um nome curto). É usado como connection name no swanctl.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	swanctlConfDir = "/etc/swanctl/conf.d"
)

var (
	apiKey     string
	confMu     sync.Mutex // protege escrita em swanctl.conf de cada peer
	peerNameRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
)

// ── helpers ─────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

// peerSummary é o shape retornado pelos endpoints GET.
type peerSummary struct {
	PeerID            string `json:"peer_id"`
	PeerIP            string `json:"peer_ip"`
	RemoteID          string `json:"remote_id,omitempty"`
	State             string `json:"state"` // "established" | "connecting" | "down"
	LastHandshakeUnix int64  `json:"last_handshake_unix"`
	RxBytes           int64  `json:"rx_bytes"`
	TxBytes           int64  `json:"tx_bytes"`
	RemoteHost        string `json:"remote_host,omitempty"`
}

// runSwanctl chama o binário swanctl com argumentos.
func runSwanctl(args ...string) (string, error) {
	cmd := exec.Command("swanctl", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("swanctl %v: %w (output: %s)", args, err, string(out))
	}
	return string(out), nil
}

// peerConfPath retorna o caminho do arquivo de config do peer.
func peerConfPath(peerID string) string {
	return filepath.Join(swanctlConfDir, peerID+".conf")
}

// writePeerConf grava o arquivo de config do peer no formato swanctl.
func writePeerConf(peerID, peerIP, psk, remoteID string) error {
	if !peerNameRe.MatchString(peerID) {
		return errors.New("invalid peer_id (must match [A-Za-z0-9_-]{1,64})")
	}
	if remoteID == "" {
		remoteID = "%any"
	}
	// Local IP do túnel: sempre 198.18.0.1 (VPS)
	const vpsTunnelIP = "198.18.0.1"

	conf := fmt.Sprintf(`# managed by swan-api — do not edit by hand

connections {
    %[1]s {
        version = 2
        proposals = aes256-sha256-modp2048,aes128-sha256-modp2048,default
        local_addrs = %%any
        remote_addrs = %%any
        send_certreq = no

        local {
            auth = psk
            id = %[2]s
        }

        remote {
            auth = psk
            id = %[3]s
        }

        children {
            %[1]s {
                local_ts = %[2]s/32
                remote_ts = %[4]s/32
                start_action = none
                close_action = none
                esp_proposals = aes256-sha256,aes128-sha256,default
                rekey_time = 1h
                life_time = 8h
            }
        }

        version = 2
        mobike = yes
        encap = yes
        dpd_delay = 30s
    }
}

secrets {
    ike-%[1]s {
        id-1 = %[2]s
        id-2 = %[3]s
        secret = %[5]s
    }
}
`, peerID, vpsTunnelIP, remoteID, peerIP, psk)

	confMu.Lock()
	defer confMu.Unlock()
	if err := os.MkdirAll(swanctlConfDir, 0o755); err != nil {
		return fmt.Errorf("mkdir conf.d: %w", err)
	}
	return os.WriteFile(peerConfPath(peerID), []byte(conf), 0o600)
}

// loadPeerConf chama swanctl --load-conns + --load-creds pra aplicar.
func loadPeerConf() error {
	if _, err := runSwanctl("--load-creds"); err != nil {
		return err
	}
	if _, err := runSwanctl("--load-conns"); err != nil {
		return err
	}
	return nil
}

// ── handlers ────────────────────────────────────────────────────────────────

func handleHealth(w http.ResponseWriter, r *http.Request) {
	// swanctl --stats pra confirmar daemon respondendo
	out, err := runSwanctl("--stats")
	if err != nil {
		writeJSON(w, 503, map[string]any{
			"status": "degraded",
			"error":  err.Error(),
		})
		return
	}
	// Extrai uptime + workers (best-effort)
	writeJSON(w, 200, map[string]any{
		"status":    "ok",
		"daemon":    "strongswan",
		"stats_raw": out,
	})
}

func handleListPeers(w http.ResponseWriter, r *http.Request) {
	files, err := filepath.Glob(filepath.Join(swanctlConfDir, "*.conf"))
	if err != nil {
		writeError(w, 500, "list_conf_error")
		return
	}
	out := make([]peerSummary, 0, len(files))
	for _, f := range files {
		base := strings.TrimSuffix(filepath.Base(f), ".conf")
		s, _ := getPeerStatus(base)
		out = append(out, s)
	}
	writeJSON(w, 200, out)
}

func handleAddPeer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PeerID   string `json:"peer_id"`
		PeerIP   string `json:"peer_ip"`
		PSK      string `json:"psk"`
		RemoteID string `json:"remote_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid_json")
		return
	}
	if body.PeerID == "" || body.PeerIP == "" || body.PSK == "" {
		writeError(w, 400, "missing_required_fields")
		return
	}
	if !peerNameRe.MatchString(body.PeerID) {
		writeError(w, 400, "invalid_peer_id")
		return
	}

	if err := writePeerConf(body.PeerID, body.PeerIP, body.PSK, body.RemoteID); err != nil {
		writeError(w, 400, "write_conf_failed")
		log.Printf("write conf error: %v", err)
		return
	}
	if err := loadPeerConf(); err != nil {
		writeError(w, 500, "swanctl_load_failed")
		log.Printf("load conf error: %v", err)
		return
	}
	log.Printf("peer added: %s (peer_ip=%s, remote_id=%s)", body.PeerID, body.PeerIP, body.RemoteID)
	writeJSON(w, 201, map[string]string{
		"peer_id":   body.PeerID,
		"peer_ip":   body.PeerIP,
		"remote_id": body.RemoteID,
	})
}

func handleGetPeer(w http.ResponseWriter, r *http.Request) {
	peerID := strings.TrimPrefix(r.URL.Path, "/peers/")
	if peerID == "" || !peerNameRe.MatchString(peerID) {
		writeError(w, 400, "invalid_peer_id")
		return
	}
	if _, err := os.Stat(peerConfPath(peerID)); os.IsNotExist(err) {
		writeError(w, 404, "peer_not_found")
		return
	}
	s, err := getPeerStatus(peerID)
	if err != nil {
		writeError(w, 500, "status_error")
		log.Printf("status error: %v", err)
		return
	}
	writeJSON(w, 200, s)
}

func handleDeletePeer(w http.ResponseWriter, r *http.Request) {
	peerID := strings.TrimPrefix(r.URL.Path, "/peers/")
	if peerID == "" || !peerNameRe.MatchString(peerID) {
		writeError(w, 400, "invalid_peer_id")
		return
	}
	confPath := peerConfPath(peerID)
	if _, err := os.Stat(confPath); os.IsNotExist(err) {
		writeError(w, 404, "peer_not_found")
		return
	}
	// Termina SAs ativas e remove conexão
	_, _ = runSwanctl("--terminate", "--ike", peerID)
	_, _ = runSwanctl("--unload-conn", peerID)
	confMu.Lock()
	if err := os.Remove(confPath); err != nil {
		confMu.Unlock()
		writeError(w, 500, "remove_conf_failed")
		log.Printf("remove conf error: %v", err)
		return
	}
	confMu.Unlock()
	_ = loadPeerConf()
	log.Printf("peer removed: %s", peerID)
	w.WriteHeader(204)
}

// ── status parsing ──────────────────────────────────────────────────────────

// getPeerStatus chama `swanctl --list-sas --ike <peer_id>` e parsa.
func getPeerStatus(peerID string) (peerSummary, error) {
	conf, _ := os.ReadFile(peerConfPath(peerID))
	confStr := string(conf)
	peerIP := extractPeerIP(confStr)
	remoteID := extractRemoteID(confStr)
	s := peerSummary{
		PeerID:   peerID,
		PeerIP:   peerIP,
		RemoteID: remoteID,
		State:    "down",
	}

	out, err := runSwanctl("--list-sas", "--ike", peerID, "--raw")
	if err != nil {
		return s, nil // sem SA = down (não é erro fatal)
	}
	if strings.Contains(out, "ESTABLISHED") {
		s.State = "established"
	} else if strings.Contains(out, "CONNECTING") {
		s.State = "connecting"
	}

	// last handshake / bytes — parsing best-effort do output raw
	if m := regexp.MustCompile(`established\s+(\d+)s\s+ago`).FindStringSubmatch(out); len(m) > 1 {
		secs, _ := strconv.ParseInt(m[1], 10, 64)
		s.LastHandshakeUnix = time.Now().Unix() - secs
	}
	if m := regexp.MustCompile(`bytes_i\s*=\s*(\d+)`).FindStringSubmatch(out); len(m) > 1 {
		s.RxBytes, _ = strconv.ParseInt(m[1], 10, 64)
	}
	if m := regexp.MustCompile(`bytes_o\s*=\s*(\d+)`).FindStringSubmatch(out); len(m) > 1 {
		s.TxBytes, _ = strconv.ParseInt(m[1], 10, 64)
	}
	if m := regexp.MustCompile(`remote-host\s*=\s*([0-9.]+)`).FindStringSubmatch(out); len(m) > 1 {
		s.RemoteHost = m[1]
	}
	return s, nil
}

func extractPeerIP(conf string) string {
	if m := regexp.MustCompile(`remote_ts\s*=\s*([0-9.]+)/32`).FindStringSubmatch(conf); len(m) > 1 {
		return m[1]
	}
	return ""
}

func extractRemoteID(conf string) string {
	// pega o `id` dentro do bloco `remote { auth = psk\n id = ... }`
	re := regexp.MustCompile(`remote\s*\{[^}]*\bid\s*=\s*([^\s\n}]+)`)
	if m := re.FindStringSubmatch(conf); len(m) > 1 && m[1] != "%any" {
		return m[1]
	}
	return ""
}

// ── routing & middleware ────────────────────────────────────────────────────

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		got := r.Header.Get("Authorization")
		want := "Bearer " + apiKey
		if got == "" || got != want {
			writeError(w, 401, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		log.Printf(`{"method":"%s","path":"%s","status":%d,"duration_ms":%d}`,
			r.Method, r.URL.Path, rec.status, time.Since(start).Milliseconds())
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func router() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/peers", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleListPeers(w, r)
		case http.MethodPost:
			handleAddPeer(w, r)
		default:
			writeError(w, 405, "method_not_allowed")
		}
	})
	mux.HandleFunc("/peers/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetPeer(w, r)
		case http.MethodDelete:
			handleDeletePeer(w, r)
		default:
			writeError(w, 405, "method_not_allowed")
		}
	})
	return loggingMiddleware(authMiddleware(mux))
}

// ── main ────────────────────────────────────────────────────────────────────

func main() {
	apiKey = os.Getenv("SWAN_API_KEY")
	if apiKey == "" {
		log.Fatal("SWAN_API_KEY env var required")
	}
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":9999"
	}
	if err := os.MkdirAll(swanctlConfDir, 0o755); err != nil {
		log.Fatalf("mkdir conf.d: %v", err)
	}
	log.Printf("swan-api starting on %s, conf.d=%s", addr, swanctlConfDir)
	srv := &http.Server{
		Addr:              addr,
		Handler:           router(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}
