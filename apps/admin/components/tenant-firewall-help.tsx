'use client'

import { useState } from 'react'

type Vendor = 'mikrotik' | 'unifi' | 'sonicwall' | 'pfsense'

interface Props {
  /** IP/host público da VPS onde o container do tenant roda. Usado nos snippets. */
  vpsHost?: string
  /** Porta UDP Auth alocada pelo provisioner (range 18120-18219). */
  radiusAuthPort?: number
  /** Porta UDP Accounting alocada pelo provisioner (normalmente auth+1). */
  radiusAcctPort?: number
  /** Porta UDP do CoA no NAS (configurada no tenant, default 3799). */
  coaPort?: number
}

const VENDORS: { key: Vendor; label: string }[] = [
  { key: 'mikrotik', label: 'Mikrotik' },
  { key: 'unifi', label: 'Unifi' },
  { key: 'sonicwall', label: 'SonicWall' },
  { key: 'pfsense', label: 'pfSense' },
]

function buildSnippet(vendor: Vendor, ctx: Props): string {
  const vps = ctx.vpsHost ?? '<VPS_IP>'
  const authPort = ctx.radiusAuthPort ?? '<PORTA_AUTH>'
  const acctPort = ctx.radiusAcctPort ?? '<PORTA_ACCT>'
  const coa = ctx.coaPort ?? 3799

  switch (vendor) {
    case 'mikrotik':
      return `# ══════════════════════════════════════════════════════════════
# Mikrotik RouterOS — configuração RADIUS + CoA
# ══════════════════════════════════════════════════════════════

# 1. Adicionar o servidor RADIUS
/radius add \\
    service=hotspot,login \\
    address=${vps} \\
    secret="<SHARED_SECRET>" \\
    authentication-port=${authPort} \\
    accounting-port=${acctPort} \\
    timeout=5s

# 2. Habilitar CoA (RFC 5176) — o portal desconecta sessões remotamente
/radius incoming set accept=yes port=${coa}

# 3. Configurar o hotspot profile para usar RADIUS
/ip hotspot profile set [find name=default] \\
    use-radius=yes \\
    radius-default-domain="" \\
    radius-accounting=yes \\
    radius-interim-update=5m

# 4. Walled garden — permitir acesso ao portal sem autenticação
/ip hotspot walled-garden add dst-host=portal.seu-dominio.com action=allow

# 5. (opcional) MAC authentication — mandar o MAC como User-Name
/ip hotspot profile set [find name=default] \\
    mac-auth-mode=mac-as-username-and-password
`

    case 'unifi':
      return `# ══════════════════════════════════════════════════════════════
# Unifi Network Application — RADIUS Profile
# ══════════════════════════════════════════════════════════════

# Settings → Profiles → RADIUS → Create new RADIUS profile

Name: Captive Portal RADIUS

[ Authentication ]
  RADIUS Auth Server 1:
    IP / Hostname:       ${vps}
    Port:                ${authPort}
    Password (secret):   <SHARED_SECRET>

[ Accounting ]
  Enable accounting:     ✓
  RADIUS Accounting Server 1:
    IP / Hostname:       ${vps}
    Port:                ${acctPort}
    Password (secret):   <SHARED_SECRET>
  Interim update interval: 300 seconds

[ Advanced ]
  Enable CoA (Change of Authorization): ✓
  CoA Port: ${coa}

# ───────────────────────────────────────────────
# Associar ao SSID do guest:
#   Settings → Wireless Networks → <SSID guest>
#   → Edit → Advanced Options → RADIUS MAC Authentication: ON
#   → escolher o profile "Captive Portal RADIUS"
#   → MAC format: aabbccddeeff (sem separador, minúsculas)
`

    case 'sonicwall':
      return `# ══════════════════════════════════════════════════════════════
# SonicWall (SonicOS 6.5/7) — RADIUS auth pra guest
# ══════════════════════════════════════════════════════════════

# 1. Manage → Users → Settings
#    Authentication method for login: RADIUS

# 2. Manage → Users → RADIUS → Add RADIUS Server
    Host/IP:            ${vps}
    Auth port:          ${authPort}
    Accounting port:    ${acctPort}
    Shared Secret:      <SHARED_SECRET>
    Retries:            2
    Timeout:            5

# 3. Network → Zones → <WLAN/Guest zone>
#    Enable Guest Services: ✓
#    Guest authentication: External RADIUS

# 4. Manage → Users → Guest Services → Guest Profile
#    Enable RADIUS accounting
#    Session timeout: controlado pelo RADIUS (Session-Timeout)

# 5. (opcional) CoA — SonicWall aceita Disconnect-Request na porta ${coa}
#    Verifique em Manage → Log → RADIUS Accounting logs
`

    case 'pfsense':
      return `# ══════════════════════════════════════════════════════════════
# pfSense — Authentication Server RADIUS
# ══════════════════════════════════════════════════════════════

# 1. System → User Manager → Authentication Servers → Add

    Descriptive name:          Captive Portal RADIUS
    Type:                      RADIUS

  [ RADIUS Server Settings ]
    Protocol:                  PAP
    Hostname or IP address:    ${vps}
    Shared Secret:             <SHARED_SECRET>
    Services offered:          Authentication and Accounting
    Authentication port:       ${authPort}
    Accounting port:           ${acctPort}
    Authentication Timeout:    5

# 2. Services → Captive Portal → <zone> → Edit

    Authentication Method:     RADIUS
    Primary RADIUS Server:     escolha "Captive Portal RADIUS"
    MAC authentication:        ✓ (envia MAC como User-Name)
    Accounting:                ✓ send accounting updates
    Reauthentication:          ✓

# 3. (opcional) CoA — pfSense não envia, mas aceita Disconnect-Request
#    na porta ${coa} se o pacote freeradius-server estiver instalado.
`
  }
}

export function TenantFirewallHelp(props: Props) {
  const [vendor, setVendor] = useState<Vendor>('mikrotik')
  const [copied, setCopied] = useState(false)

  const snippet = buildSnippet(vendor, props)
  const hasPorts = props.radiusAuthPort !== undefined

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard indisponível — usuário copia manualmente pelo <pre>
    }
  }

  return (
    <div className="glass-card rounded-xl">
      <div className="flex items-center justify-between border-b border-t-default px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-t-secondary">Configurar firewall</h2>
          <p className="mt-0.5 text-[11px] text-t-placeholder">
            Snippets prontos pra apontar o firewall do cliente pro container RADIUS deste tenant.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-t-input px-3 py-1.5 text-[11px] font-medium text-t-muted hover:bg-t-hover transition-colors"
          title="Copiar snippet atual"
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>

      {/* Vendor tabs */}
      <div className="flex gap-1 border-b border-t-default px-6 pt-3">
        {VENDORS.map((v) => {
          const active = vendor === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setVendor(v.key)}
              className={`rounded-t-md border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-edge-cyan text-edge-cyan'
                  : 'border-transparent text-t-label hover:text-t-secondary'
              }`}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      <div className="px-6 py-4 space-y-3">
        {!hasPorts && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[11px] text-amber-400/90 leading-relaxed">
              <strong>Aguardando provisioner:</strong> as portas UDP aparecerão
              aqui automaticamente quando o tenant passar pra{' '}
              <code className="rounded bg-t-input px-1 py-0.5 font-mono text-[10px]">active</code>.
              Enquanto isso o snippet usa{' '}
              <code className="rounded bg-t-input px-1 py-0.5 font-mono text-[10px]">&lt;PORTA_AUTH&gt;</code>{' '}
              /{' '}
              <code className="rounded bg-t-input px-1 py-0.5 font-mono text-[10px]">&lt;PORTA_ACCT&gt;</code>{' '}
              como placeholder. O{' '}
              <code className="rounded bg-t-input px-1 py-0.5 font-mono text-[10px]">&lt;SHARED_SECRET&gt;</code>{' '}
              você sempre preenche à mão (o painel nunca devolve em claro).
            </p>
          </div>
        )}

        <pre className="max-h-[480px] overflow-auto rounded-lg border border-t-default bg-t-input p-4 text-[11px] leading-relaxed text-t-secondary font-mono whitespace-pre">
          {snippet}
        </pre>

        <p className="text-[10px] text-t-placeholder">
          O <code>&lt;SHARED_SECRET&gt;</code> é o mesmo valor que você configurou na aba{' '}
          <strong>Configuração RADIUS</strong> acima. Por segurança o painel nunca devolve o segredo
          em claro — guarde ele no gerador de senhas quando criar o tenant.
        </p>
      </div>
    </div>
  )
}
