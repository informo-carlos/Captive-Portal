// wg-api — sidecar HTTP que gerencia peers do wg0 no container wireguard.
//
// Roda no MESMO network namespace que o container `wireguard` (via
// network_mode: "service:wireguard" no docker-compose), então `wgctrl`
// enxerga a interface wg0.
//
// Auth: Authorization: Bearer <WG_API_KEY>
//
// Endpoints:
//   GET    /health                   (sem auth)
//   POST   /peers                    body: {public_key, preshared_key, allowed_ips}
//   GET    /peers
//   GET    /peers/:public_key
//   DELETE /peers/:public_key
//
// Spec: docs/wireguard-vpn-architecture.md

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

var (
	wgClient    *wgctrl.Client
	wgInterface = "wg0"
	apiKey      string
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
	PublicKey         string `json:"public_key"`
	AllowedIPs        string `json:"allowed_ips"`
	Endpoint          string `json:"endpoint,omitempty"`
	LastHandshakeUnix int64  `json:"last_handshake_unix"`
	RxBytes           int64  `json:"rx_bytes"`
	TxBytes           int64  `json:"tx_bytes"`
}

func toSummary(p wgtypes.Peer) peerSummary {
	allowed := ""
	if len(p.AllowedIPs) > 0 {
		allowed = p.AllowedIPs[0].String()
	}
	endpoint := ""
	if p.Endpoint != nil {
		endpoint = p.Endpoint.String()
	}
	var hs int64
	if !p.LastHandshakeTime.IsZero() {
		hs = p.LastHandshakeTime.Unix()
	}
	return peerSummary{
		PublicKey:         p.PublicKey.String(),
		AllowedIPs:        allowed,
		Endpoint:          endpoint,
		LastHandshakeUnix: hs,
		RxBytes:           p.ReceiveBytes,
		TxBytes:           p.TransmitBytes,
	}
}

func decodePublicKeyFromPath(path string) (wgtypes.Key, string, error) {
	// path: /peers/<key>
	raw := strings.TrimPrefix(path, "/peers/")
	if raw == "" {
		return wgtypes.Key{}, "", errors.New("empty public key")
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return wgtypes.Key{}, "", fmt.Errorf("invalid url-encoding: %w", err)
	}
	// alguns clientes mandam base64url — converte pra base64 padrão
	decoded = strings.ReplaceAll(decoded, "-", "+")
	decoded = strings.ReplaceAll(decoded, "_", "/")
	if !strings.HasSuffix(decoded, "=") {
		// padding
		switch len(decoded) % 4 {
		case 2:
			decoded += "=="
		case 3:
			decoded += "="
		}
	}
	k, err := wgtypes.ParseKey(decoded)
	if err != nil {
		return wgtypes.Key{}, decoded, err
	}
	return k, decoded, nil
}

// ── handlers ────────────────────────────────────────────────────────────────

func handleHealth(w http.ResponseWriter, r *http.Request) {
	dev, err := wgClient.Device(wgInterface)
	if err != nil {
		writeJSON(w, 503, map[string]any{
			"status":    "degraded",
			"interface": wgInterface,
			"error":     err.Error(),
		})
		return
	}
	writeJSON(w, 200, map[string]any{
		"status":      "ok",
		"interface":   wgInterface,
		"peers_count": len(dev.Peers),
	})
}

func handleListPeers(w http.ResponseWriter, r *http.Request) {
	dev, err := wgClient.Device(wgInterface)
	if err != nil {
		writeError(w, 500, "wg_device_error")
		log.Printf("device error: %v", err)
		return
	}
	out := make([]peerSummary, 0, len(dev.Peers))
	for _, p := range dev.Peers {
		out = append(out, toSummary(p))
	}
	writeJSON(w, 200, out)
}

func handleAddPeer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PublicKey    string `json:"public_key"`
		PresharedKey string `json:"preshared_key"`
		AllowedIPs   string `json:"allowed_ips"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid_json")
		return
	}

	pub, err := wgtypes.ParseKey(body.PublicKey)
	if err != nil {
		writeError(w, 400, "invalid_public_key")
		return
	}
	psk, err := wgtypes.ParseKey(body.PresharedKey)
	if err != nil {
		writeError(w, 400, "invalid_psk")
		return
	}
	_, ipnet, err := net.ParseCIDR(body.AllowedIPs)
	if err != nil {
		writeError(w, 400, "invalid_allowed_ips")
		return
	}

	dev, err := wgClient.Device(wgInterface)
	if err != nil {
		writeError(w, 500, "wg_device_error")
		log.Printf("device error: %v", err)
		return
	}
	for _, p := range dev.Peers {
		if p.PublicKey == pub {
			writeError(w, 409, "peer_already_exists")
			return
		}
	}

	cfg := wgtypes.Config{
		Peers: []wgtypes.PeerConfig{{
			PublicKey:    pub,
			PresharedKey: &psk,
			AllowedIPs:   []net.IPNet{*ipnet},
		}},
	}
	if err := wgClient.ConfigureDevice(wgInterface, cfg); err != nil {
		writeError(w, 500, "wg_configure_error")
		log.Printf("configure error: %v", err)
		return
	}

	log.Printf("peer added: %s allowed=%s", pub.String(), ipnet.String())
	writeJSON(w, 201, map[string]string{
		"public_key":  pub.String(),
		"allowed_ips": ipnet.String(),
	})
}

func handleGetPeer(w http.ResponseWriter, r *http.Request) {
	pub, _, err := decodePublicKeyFromPath(r.URL.Path)
	if err != nil {
		writeError(w, 400, "invalid_public_key")
		return
	}
	dev, err := wgClient.Device(wgInterface)
	if err != nil {
		writeError(w, 500, "wg_device_error")
		return
	}
	for _, p := range dev.Peers {
		if p.PublicKey == pub {
			writeJSON(w, 200, toSummary(p))
			return
		}
	}
	writeError(w, 404, "peer_not_found")
}

func handleDeletePeer(w http.ResponseWriter, r *http.Request) {
	pub, _, err := decodePublicKeyFromPath(r.URL.Path)
	if err != nil {
		writeError(w, 400, "invalid_public_key")
		return
	}
	dev, err := wgClient.Device(wgInterface)
	if err != nil {
		writeError(w, 500, "wg_device_error")
		return
	}
	found := false
	for _, p := range dev.Peers {
		if p.PublicKey == pub {
			found = true
			break
		}
	}
	if !found {
		writeError(w, 404, "peer_not_found")
		return
	}
	cfg := wgtypes.Config{
		Peers: []wgtypes.PeerConfig{{
			PublicKey: pub,
			Remove:    true,
		}},
	}
	if err := wgClient.ConfigureDevice(wgInterface, cfg); err != nil {
		writeError(w, 500, "wg_configure_error")
		log.Printf("configure error: %v", err)
		return
	}
	log.Printf("peer removed: %s", pub.String())
	w.WriteHeader(204)
}

// ── routing & middleware ────────────────────────────────────────────────────

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// /health não exige auth (Docker healthcheck)
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

// loggingMiddleware imprime JSON estruturado por request.
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
	apiKey = os.Getenv("WG_API_KEY")
	if apiKey == "" {
		log.Fatal("WG_API_KEY env var required")
	}
	if v := os.Getenv("WG_INTERFACE"); v != "" {
		wgInterface = v
	}
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":9999"
	}

	c, err := wgctrl.New()
	if err != nil {
		log.Fatalf("wgctrl.New: %v", err)
	}
	wgClient = c
	defer wgClient.Close()

	log.Printf("wg-api starting on %s, interface=%s", addr, wgInterface)
	srv := &http.Server{
		Addr:              addr,
		Handler:           router(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}
