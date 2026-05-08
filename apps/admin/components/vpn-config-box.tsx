'use client'

import { MaskedKey } from './masked-key'
import { downloadVpnConfig } from '../lib/api'
import { ApiRequestError } from '../lib/api'
import { useNotifications } from '../lib/notification-context'

interface VpnConfigBoxProps {
  config: {
    peerIp: string
    endpoint: string
    allowedIps: string
    persistentKeepalive: number
    presharedKey: string
    vpsPublicKey: string
  }
  tenantId: string
  tenantName: string
}

const SONICWALL_SETUP_URL =
  'https://github.com/informo-carlos/Captive-Portal/blob/main/docs/wireguard-sonicwall-setup.md'

export function VpnConfigBox({ config, tenantId, tenantName }: VpnConfigBoxProps) {
  const { add: notify } = useNotifications()

  const handleDownload = async () => {
    try {
      const blob = await downloadVpnConfig(tenantId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wireguard-${tenantName.toLowerCase().replace(/\s+/g, '-')}.conf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? err.message
          : 'Falha ao baixar configuração.'
      notify({
        type: 'system',
        action: 'vpn_download',
        status: 'failed',
        message: msg,
      })
    }
  }

  return (
    <div className="rounded-lg border border-t-default bg-t-input p-5 space-y-4">
      <p className="text-xs font-medium text-t-secondary">
        Cole esta config na interface WireGuard do SonicOS:
      </p>

      <div className="space-y-2 text-sm font-mono">
        <ConfigRow label="Address" value={config.peerIp} />
        <ConfigRow
          label="Listen Port"
          value="(deixe em branco — modo client)"
          muted
        />
        <ConfigRow label="Endpoint" value={config.endpoint} />
        <ConfigRow label="Allowed IPs" value={config.allowedIps} />
        <ConfigRow
          label="Persistent KA"
          value={`${config.persistentKeepalive} segundos`}
        />
      </div>

      <div className="space-y-3 border-t border-t-default pt-3">
        <MaskedKey
          label="Pre-shared Key"
          value={config.presharedKey}
          revealable
          copyable
        />
        <MaskedKey
          label="VPS Public Key"
          value={config.vpsPublicKey}
          revealable
          copyable
        />
      </div>

      <div className="flex items-center gap-3 border-t border-t-default pt-3">
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg border border-t-input px-3 py-1.5 text-xs font-medium text-t-secondary hover:bg-t-hover transition-colors"
        >
          📥 Baixar .conf
        </button>
        <a
          href={SONICWALL_SETUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-edge-cyan/30 px-3 py-1.5 text-xs font-medium text-edge-cyan hover:bg-edge-cyan/5 transition-colors"
        >
          🔗 Setup no SonicWall →
        </a>
      </div>
    </div>
  )
}

function ConfigRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-32 shrink-0 text-t-label text-[11px] uppercase tracking-wider font-sans">
        {label}:
      </span>
      <span className={muted ? 'text-t-placeholder' : 'text-t-secondary'}>
        {value}
      </span>
    </div>
  )
}
