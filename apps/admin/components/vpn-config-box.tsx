'use client'

import { MaskedKey } from './masked-key'
import { downloadVpnConfig } from '../lib/api'
import { ApiRequestError } from '../lib/api'
import { useNotifications } from '../lib/notification-context'

interface VpnConfigBoxProps {
  config: {
    peerIp: string
    vpsPublicIp: string
    vpsTunnelIp: string
    ikeProposals: string
    presharedKey: string
  }
  tenantId: string
  tenantName: string
}

const SONICWALL_SETUP_URL =
  'https://github.com/informo-carlos/Captive-Portal/blob/main/docs/ipsec-sonicwall-setup.md'

export function VpnConfigBox({ config, tenantId, tenantName }: VpnConfigBoxProps) {
  const { add: notify } = useNotifications()

  const handleDownload = async () => {
    try {
      const blob = await downloadVpnConfig(tenantId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ipsec-${tenantName.toLowerCase().replace(/\s+/g, '-')}.txt`
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
        Configure um Tunnel-Interface IPsec (IKEv2) no SonicOS com estes valores:
      </p>

      <div className="space-y-2 text-sm font-mono">
        <ConfigRow label="Remote Gateway" value={config.vpsPublicIp} />
        <ConfigRow label="IKE Version" value="IKEv2" />
        <ConfigRow label="Auth Method" value="Preshared Secret" />
        <ConfigRow label="Peer IKE ID" value={config.vpsTunnelIp} />
        <ConfigRow label="Local Network" value={`${config.peerIp}/32`} />
        <ConfigRow label="Remote Network" value={`${config.vpsTunnelIp}/32`} />
        <ConfigRow label="IKE Proposals" value={config.ikeProposals} muted />
      </div>

      <div className="space-y-3 border-t border-t-default pt-3">
        <MaskedKey
          label="Pre-shared Secret"
          value={config.presharedKey}
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
          📥 Baixar config (.txt)
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
