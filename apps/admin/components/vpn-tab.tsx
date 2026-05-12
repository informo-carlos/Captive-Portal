'use client'

import { useState } from 'react'
import { useVpnStatus } from '../hooks/use-vpn-status'
import { VpnStatusBadge } from './vpn-status-badge'
import { VpnConfigBox } from './vpn-config-box'
import { MaskedKey } from './masked-key'
import {
  enableVpn,
  submitVpnPeerConfig,
  testVpnLhm,
  regenerateVpnPsk,
  disableVpn,
  ApiRequestError,
  type VpnEnableResponse,
  type VpnTestLhmResponse,
} from '../lib/api'
import { useNotifications } from '../lib/notification-context'

interface VpnTabProps {
  tenantId: string
  tenantName?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatHandshake(seconds: number): string {
  if (seconds < 60) return `há ${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `há ${mins}min`
  return `há ${Math.floor(mins / 60)}h`
}

// ─── Sub-componentes internos ─────────────────────────────────────────────────

function SectionHeader({ title, badge }: { title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-t-default pb-3 mb-4">
      <h3 className="text-sm font-semibold text-t-secondary">{title}</h3>
      {badge}
    </div>
  )
}

function ActionButton({
  onClick,
  loading,
  disabled,
  variant = 'default',
  children,
}: {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'default' | 'primary' | 'danger' | 'warning'
  children: React.ReactNode
}) {
  const variantClass = {
    default: 'border border-t-input text-t-secondary hover:bg-t-hover',
    primary: 'bg-edge-cyan text-edge-dark hover:bg-edge-cyan/90 font-semibold',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'border border-amber-500/30 text-amber-400 hover:bg-amber-500/10',
  }[variant]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 ${variantClass}`}
    >
      {loading ? 'Aguarde...' : children}
    </button>
  )
}

// ─── Estado: disabled ─────────────────────────────────────────────────────────

function StateDisabled({
  onEnable,
  loading,
}: {
  onEnable: () => void
  loading: boolean
}) {
  return (
    <div className="space-y-6 py-2">
      <SectionHeader title="VPN IPsec" />
      <div className="space-y-4 text-sm text-t-muted leading-relaxed">
        <p>
          A VPN cria um túnel seguro entre nossa VPS e o SonicWall do cliente,
          permitindo o backend liberar acesso via LHM API.
        </p>
        <div>
          <p className="font-medium text-t-secondary mb-2">Pré-requisitos:</p>
          <ul className="space-y-1 pl-4 list-disc list-outside text-t-label">
            <li>SonicOS 7.0 ou superior</li>
            <li>Acesso admin ao SonicWall</li>
            <li>~10 minutos de configuração no firewall</li>
          </ul>
        </div>
        <div>
          <a
            href="https://github.com/informo-carlos/Captive-Portal/blob/main/docs/ipsec-sonicwall-setup.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-edge-cyan hover:underline text-sm"
          >
            Documentação: Setup no SonicWall →
          </a>
        </div>
      </div>
      <div className="flex justify-center pt-2">
        <ActionButton onClick={onEnable} loading={loading} variant="primary">
          Habilitar VPN →
        </ActionButton>
      </div>
    </div>
  )
}

// ─── Estado: pending ──────────────────────────────────────────────────────────

function StatePending({
  enableData,
  tenantId,
  tenantName,
  onRemoteIdSubmit,
  onCancelVpn,
  submitting,
}: {
  enableData: VpnEnableResponse
  tenantId: string
  tenantName: string
  onRemoteIdSubmit: (remoteId: string) => Promise<void>
  onCancelVpn: () => Promise<void>
  submitting: boolean
}) {
  const [remoteId, setRemoteId] = useState('')

  return (
    <div className="space-y-5 py-2">
      <SectionHeader
        title="VPN IPsec"
        badge={<VpnStatusBadge status="pending" />}
      />

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
        <span className="shrink-0">⚠</span>
        <span>VPN provisionada na VPS. Configure agora o SonicWall (Tunnel-Interface IPsec / IKEv2 / PSK):</span>
      </div>

      {/* Passo 1 */}
      <div className="rounded-lg border border-t-default bg-t-card/50 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-t-label">
          1. Configure o Tunnel-Interface IPsec no SonicOS com os valores abaixo
        </p>
        <VpnConfigBox
          config={{
            peerIp: enableData.vpn_peer_ip,
            vpsPublicIp: enableData.vps_public_ip,
            vpsTunnelIp: enableData.vps_tunnel_ip,
            ikeProposals: enableData.ike_proposals,
            presharedKey: enableData.preshared_key,
          }}
          tenantId={tenantId}
          tenantName={tenantName}
        />
      </div>

      {/* Passo 2 — opcional */}
      <div className="rounded-lg border border-t-default bg-t-card/50 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-t-label">
          2. (Opcional) Restringir Remote IKE ID
        </p>
        <p className="text-xs text-t-muted leading-relaxed">
          Por padrão, qualquer Remote IKE ID é aceito desde que a PSK bata. Se quiser
          restringir só ao IP/FQDN específico do firewall do cliente, informe aqui.
        </p>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-t-label mb-1">
            Remote IKE ID (opcional)
          </label>
          <input
            type="text"
            value={remoteId}
            onChange={(e) => setRemoteId(e.target.value)}
            className="w-full rounded-lg border border-t-input bg-t-input px-3 py-2 text-sm font-mono text-t-primary placeholder:text-t-placeholder focus:outline-none focus:ring-1 focus:ring-edge-cyan/40"
            placeholder="ex: 203.0.113.5  ou  firewall.cliente.com.br  (deixe vazio = aceitar qualquer)"
            aria-label="Remote IKE ID opcional"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <ActionButton onClick={onCancelVpn} loading={submitting} variant="warning">
            Cancelar VPN
          </ActionButton>
          <ActionButton
            onClick={() => onRemoteIdSubmit(remoteId.trim())}
            loading={submitting}
            variant="primary"
          >
            {remoteId.trim() ? 'Aplicar e Aguardar Handshake →' : 'Aguardar Handshake (sem restrição) →'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

// ─── Estado: awaiting_handshake ───────────────────────────────────────────────

function StateAwaitingHandshake({
  onRefresh,
  onDisable,
  lastChecked,
}: {
  onRefresh: () => void
  onDisable?: () => void
  lastChecked: Date | null
}) {
  return (
    <div className="space-y-5 py-2">
      <SectionHeader
        title="VPN IPsec"
        badge={<VpnStatusBadge status="awaiting_handshake" />}
      />
      <div className="flex items-center gap-3 text-sm text-t-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent shrink-0" />
        <span>VPN provisionada na VPS. Aguardando primeira conexão do SonicWall.</span>
      </div>
      <div className="rounded-lg border border-t-default bg-t-input p-4 space-y-2 text-xs text-t-label">
        <p className="font-medium text-t-secondary mb-2">Verifique no SonicOS que:</p>
        <p>✓ O Tunnel-Interface IPsec está configurado e habilitado (Enable = ON)</p>
        <p>✓ Pré-Shared Secret bate com o que foi gerado aqui (re-habilite a VPN se perdeu)</p>
        <p>✓ Remote Gateway = 45.7.53.80, Peer IKE ID = 198.18.0.1, IKEv2</p>
        <p>✓ Saída UDP 500 e 4500 (NAT-T) liberada na zona WAN</p>
      </div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300/90">
        <strong>Perdeu a PSK ou config?</strong> Clica em &quot;Desabilitar VPN&quot; lá
        embaixo e depois &quot;Habilitar VPN&quot; de novo — uma nova PSK + config será
        gerada e mostrada na tela.
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {lastChecked && (
          <span className="text-xs text-t-placeholder">
            Última verificação: {lastChecked.toLocaleTimeString('pt-BR')}
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-t-input px-3 py-1.5 text-xs font-medium text-t-secondary hover:bg-t-hover transition-colors"
        >
          🔄 Verificar agora
        </button>
        {onDisable && (
          <button
            type="button"
            onClick={onDisable}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors ml-auto"
          >
            ↺ Desabilitar VPN (recomeçar)
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Estado: connected ────────────────────────────────────────────────────────

function StateConnected({
  vpnPeerIp,
  endpointObserved,
  lastHandshakeSecondsAgo,
  transferRxBytes,
  transferTxBytes,
  lhmMgmtLanUrl,
  onTestLhm,
  onRegeneratePsk,
  onDisable,
  loadingAction,
}: {
  vpnPeerIp?: string
  endpointObserved?: string
  lastHandshakeSecondsAgo?: number
  transferRxBytes?: number
  transferTxBytes?: number
  lhmMgmtLanUrl?: string
  onTestLhm: () => void
  onRegeneratePsk: () => void
  onDisable: () => void
  loadingAction: string | null
}) {
  return (
    <div className="space-y-5 py-2">
      <SectionHeader
        title="VPN IPsec"
        badge={
          <VpnStatusBadge
            status="connected"
            lastHandshakeSecondsAgo={lastHandshakeSecondsAgo}
          />
        }
      />
      <div className="overflow-hidden rounded-lg border border-t-default">
        <table className="w-full text-sm">
          <tbody>
            <TRow label="Peer IP" value={vpnPeerIp ?? '—'} mono />
            <TRow
              label="Endpoint do cliente"
              value={endpointObserved ?? '—'}
              mono
              hint="(atualizado automaticamente)"
            />
            <TRow
              label="Último handshake"
              value={
                lastHandshakeSecondsAgo !== undefined
                  ? formatHandshake(lastHandshakeSecondsAgo)
                  : '—'
              }
            />
            <TRow
              label="Bytes RX (cliente→nós)"
              value={transferRxBytes !== undefined ? formatBytes(transferRxBytes) : '—'}
            />
            <TRow
              label="Bytes TX (nós→cliente)"
              value={transferTxBytes !== undefined ? formatBytes(transferTxBytes) : '—'}
            />
            <TRow label="LHM Mgmt URL" value={lhmMgmtLanUrl ?? '—'} mono />
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          onClick={onTestLhm}
          loading={loadingAction === 'test-lhm'}
          variant="default"
        >
          🔧 Testar POST LHM
        </ActionButton>
        <ActionButton
          onClick={onRegeneratePsk}
          loading={loadingAction === 'regenerate-psk'}
          variant="warning"
        >
          ↻ Regenerar PSK
        </ActionButton>
        <ActionButton
          onClick={onDisable}
          loading={loadingAction === 'disable'}
          variant="danger"
        >
          ⚠ Desabilitar VPN
        </ActionButton>
      </div>
    </div>
  )
}

function TRow({
  label,
  value,
  mono = false,
  hint,
}: {
  label: string
  value: string
  mono?: boolean
  hint?: string
}) {
  return (
    <tr className="border-b border-t-default last:border-b-0">
      <td className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-t-label w-48 bg-t-input/30">
        {label}
      </td>
      <td className={`px-4 py-2.5 text-t-secondary ${mono ? 'font-mono' : ''}`}>
        {value}
        {hint && (
          <span className="ml-2 text-[10px] text-t-placeholder">{hint}</span>
        )}
      </td>
    </tr>
  )
}

// ─── Estado: disconnected ─────────────────────────────────────────────────────

function StateDisconnected({
  lastHandshakeSecondsAgo,
}: {
  lastHandshakeSecondsAgo?: number
}) {
  const timeLabel =
    lastHandshakeSecondsAgo !== undefined
      ? `há ${Math.floor(lastHandshakeSecondsAgo / 60)} minutos`
      : ''

  return (
    <div className="space-y-5 py-2">
      <SectionHeader
        title="VPN IPsec"
        badge={
          <VpnStatusBadge
            status="disconnected"
            lastHandshakeSecondsAgo={lastHandshakeSecondsAgo}
          />
        }
      />
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400 space-y-2">
        <p>
          🟡 Sem handshake{timeLabel ? ` ${timeLabel}` : ''}. O SonicWall pode
          estar offline ou com problema de rede.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10 transition-colors"
          >
            🔍 Diagnosticar
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10 transition-colors"
          >
            📋 Ver logs
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Estado: error ────────────────────────────────────────────────────────────

function StateError({
  message,
  onRetry,
  onDisable,
}: {
  message?: string
  onRetry: () => void
  onDisable: () => void
}) {
  return (
    <div className="space-y-5 py-2">
      <SectionHeader
        title="VPN IPsec"
        badge={<VpnStatusBadge status="error" />}
      />
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 space-y-3">
        <p>🔴 Erro: {message ?? 'Falha desconhecida na VPN.'}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10 transition-colors"
          >
            🔍 Detalhes
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10 transition-colors"
          >
            ↻ Tentar novamente
          </button>
          <button
            type="button"
            onClick={onDisable}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10 transition-colors"
          >
            ⚠ Desabilitar e refazer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de confirmação reutilizável ────────────────────────────────────────

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  variant = 'danger',
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
  variant?: 'danger' | 'warning'
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-t-overlay backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-t-input bg-t-card p-6 shadow-xl">
        <h3 className="text-base font-semibold text-t-primary">{title}</h3>
        <p className="mt-2 text-sm text-t-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-t-input px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Testar POST LHM ────────────────────────────────────────────────────

function TestLhmModal({
  result,
  onClose,
}: {
  result: VpnTestLhmResponse
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-t-overlay backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-t-input bg-t-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-t-primary">
            Resultado — Testar POST LHM
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-t-label hover:text-t-secondary transition-colors"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-t-label">
              Alcançável:
            </span>
            <span
              className={`text-sm font-semibold ${result.reachable ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {result.reachable ? '✓ Sim' : '✗ Não'}
            </span>
          </div>

          {result.reachable && result.http_status && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-t-label">
                HTTP Status:
              </span>
              <span className="text-sm font-mono text-t-secondary">{result.http_status}</span>
            </div>
          )}

          {result.duration_ms !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-t-label">
                Duração:
              </span>
              <span className="text-sm text-t-secondary">{result.duration_ms}ms</span>
            </div>
          )}

          {result.error && (
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-t-label shrink-0">
                Erro:
              </span>
              <span className="text-sm font-mono text-red-400 break-all">{result.error}</span>
            </div>
          )}

          {result.response_body && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-t-label">
                Resposta:
              </span>
              <pre className="mt-1 rounded-lg border border-t-default bg-t-input p-3 text-xs font-mono text-t-secondary overflow-auto max-h-40 whitespace-pre-wrap break-all">
                {result.response_body}
              </pre>
            </div>
          )}

          {result.reachable && (
            <p className="text-xs text-t-placeholder">
              Resposta esperada: erro de sessId inválida. Isso confirma que a VPN funciona corretamente.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-edge-dark hover:bg-edge-cyan/90 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Regenerar PSK ──────────────────────────────────────────────────────

function RegeneratePskModal({
  newPsk,
  onClose,
}: {
  newPsk: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-t-overlay backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-t-input bg-t-card p-6 shadow-xl">
        <h3 className="text-base font-semibold text-t-primary mb-2">
          Nova PSK gerada
        </h3>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 mb-4 text-xs text-amber-400">
          ⚠ Esta chave aparece <strong>uma única vez</strong>. Copie agora e cole no SonicWall.
          O peer será reconectado automaticamente.
        </div>
        <MaskedKey label="Nova PSK" value={newPsk} revealable copyable />
        <p className="mt-3 text-xs text-t-placeholder">
          No SonicOS: Network → IPsec VPN → Tunnel-Interface → editar → atualizar Pre-shared Secret → Apply.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-edge-cyan px-4 py-2 text-sm font-semibold text-edge-dark hover:bg-edge-cyan/90 transition-colors"
          >
            Entendi — fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function VpnTab({ tenantId, tenantName = 'tenant' }: VpnTabProps) {
  const { add: notify } = useNotifications()
  const { status: vpnStatus, refresh } = useVpnStatus(tenantId, true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  // Dados guardados após /enable — necessários pra mostrar config no estado pending
  const [enableData, setEnableData] = useState<VpnEnableResponse | null>(null)

  // Loading states
  const [enablingVpn, setEnablingVpn] = useState(false)
  const [submittingKey, setSubmittingKey] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Modais
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [testLhmResult, setTestLhmResult] = useState<VpnTestLhmResponse | null>(null)
  const [newPsk, setNewPsk] = useState<string | null>(null)

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleEnable = async () => {
    setEnablingVpn(true)
    try {
      const res = await enableVpn(tenantId)
      setEnableData(res)
      refresh()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Falha ao habilitar VPN.'
      notify({ type: 'system', action: 'vpn_enable', status: 'failed', message: msg })
    } finally {
      setEnablingVpn(false)
    }
  }

  const handleRemoteIdSubmit = async (remoteId: string) => {
    setSubmittingKey(true)
    try {
      await submitVpnPeerConfig(tenantId, remoteId || undefined)
      notify({
        type: 'system',
        action: 'vpn_peer_config_submitted',
        status: 'completed',
        message: remoteId
          ? `Remote ID "${remoteId}" aplicado. Aguardando primeiro handshake.`
          : 'Aguardando primeiro handshake (sem restrição de Remote ID).',
      })
      // Limpa enableData pra UI sair de StatePending e mostrar
      // StateAwaitingHandshake (sem mais expor PSK em tela).
      setEnableData(null)
      refresh()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Falha ao aplicar config.'
      notify({ type: 'system', action: 'vpn_peer_config', status: 'failed', message: msg })
    } finally {
      setSubmittingKey(false)
    }
  }

  const handleCancelVpn = async () => {
    setSubmittingKey(true)
    try {
      await disableVpn(tenantId)
      setEnableData(null)
      refresh()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Falha ao cancelar VPN.'
      notify({ type: 'system', action: 'vpn_cancel', status: 'failed', message: msg })
    } finally {
      setSubmittingKey(false)
    }
  }

  const handleDisable = async () => {
    setLoadingAction('disable')
    try {
      await disableVpn(tenantId)
      setConfirmDisable(false)
      setEnableData(null)
      notify({
        type: 'tenant',
        action: 'vpn_disabled',
        status: 'completed',
        message: 'VPN desabilitada com sucesso.',
        detail: tenantName,
      })
      refresh()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Falha ao desabilitar VPN.'
      notify({ type: 'system', action: 'vpn_disable', status: 'failed', message: msg })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleTestLhm = async () => {
    setLoadingAction('test-lhm')
    try {
      const result = await testVpnLhm(tenantId)
      setTestLhmResult(result)
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Falha ao testar LHM.'
      notify({ type: 'system', action: 'vpn_test_lhm', status: 'failed', message: msg })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleRegeneratePsk = async () => {
    setLoadingAction('regenerate-psk')
    try {
      const result = await regenerateVpnPsk(tenantId)
      setNewPsk(result.preshared_key)
      refresh()
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Falha ao regenerar PSK.'
      notify({ type: 'system', action: 'vpn_regen_psk', status: 'failed', message: msg })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleManualRefresh = () => {
    setLastChecked(new Date())
    refresh()
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  const currentStatus = vpnStatus?.vpn_status ?? 'disabled'

  // Mostra StatePending (com config IPsec visível) sempre que enableData existir
  // — backend pode retornar 'awaiting_handshake' direto após /enable (peer já
  // registrado no swan-api), mas a config + PSK ainda precisa ser mostrada
  // pro admin pelo menos uma vez. Só sai dessa tela quando admin clica
  // "Aguardar Handshake" (que limpa enableData) ou desabilita.
  const isPending =
    enableData !== null &&
    (currentStatus === 'pending' || currentStatus === 'awaiting_handshake' || currentStatus === 'disabled')

  return (
    <div className="min-h-[200px]">
      {/* Loading inicial */}
      {!vpnStatus && currentStatus === 'disabled' && !enableData && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-edge-cyan border-t-transparent" />
        </div>
      )}

      {/* disabled */}
      {currentStatus === 'disabled' && !enableData && vpnStatus !== null && (
        <StateDisabled onEnable={handleEnable} loading={enablingVpn} />
      )}

      {/* pending */}
      {isPending && enableData && (
        <StatePending
          enableData={enableData}
          tenantId={tenantId}
          tenantName={tenantName}
          onRemoteIdSubmit={handleRemoteIdSubmit}
          onCancelVpn={handleCancelVpn}
          submitting={submittingKey}
        />
      )}

      {/* awaiting_handshake */}
      {currentStatus === 'awaiting_handshake' && (
        <StateAwaitingHandshake
          onRefresh={handleManualRefresh}
          onDisable={() => setConfirmDisable(true)}
          lastChecked={lastChecked}
        />
      )}

      {/* connected */}
      {currentStatus === 'connected' && (
        <StateConnected
          vpnPeerIp={vpnStatus?.vpn_peer_ip}
          endpointObserved={vpnStatus?.endpoint_observed}
          lastHandshakeSecondsAgo={vpnStatus?.last_handshake_seconds_ago}
          transferRxBytes={vpnStatus?.transfer_rx_bytes}
          transferTxBytes={vpnStatus?.transfer_tx_bytes}
          lhmMgmtLanUrl={vpnStatus?.lhm_mgmt_lan_url}
          onTestLhm={handleTestLhm}
          onRegeneratePsk={handleRegeneratePsk}
          onDisable={() => setConfirmDisable(true)}
          loadingAction={loadingAction}
        />
      )}

      {/* disconnected */}
      {currentStatus === 'disconnected' && (
        <StateDisconnected
          lastHandshakeSecondsAgo={vpnStatus?.last_handshake_seconds_ago}
        />
      )}

      {/* error */}
      {currentStatus === 'error' && (
        <StateError
          message={vpnStatus?.error_message}
          onRetry={refresh}
          onDisable={() => setConfirmDisable(true)}
        />
      )}

      {/* ── Modais ── */}

      {confirmDisable && (
        <ConfirmModal
          title="Desabilitar VPN IPsec"
          message="Vai cortar acesso à internet dos guests do cliente até reconfigurar. Tem certeza?"
          confirmLabel="Sim, desabilitar VPN"
          onConfirm={handleDisable}
          onCancel={() => setConfirmDisable(false)}
          loading={loadingAction === 'disable'}
          variant="danger"
        />
      )}

      {testLhmResult && (
        <TestLhmModal
          result={testLhmResult}
          onClose={() => setTestLhmResult(null)}
        />
      )}

      {newPsk && (
        <RegeneratePskModal
          newPsk={newPsk}
          onClose={() => setNewPsk(null)}
        />
      )}
    </div>
  )
}
