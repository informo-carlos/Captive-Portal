import { describe, it, expect } from 'vitest'
import { buildSnippet } from '../tenant-firewall-help'

describe('buildSnippet', () => {
  describe('com portas reais', () => {
    const realCtx = {
      vpsHost: 'admin.example.com',
      radiusAuthPort: 18120,
      radiusAcctPort: 18121,
      coaPort: 3799,
    }

    it('Mikrotik: usa vpsHost, authPort e acctPort reais', () => {
      const snippet = buildSnippet('mikrotik', realCtx)
      expect(snippet).toContain('address=admin.example.com')
      expect(snippet).toContain('authentication-port=18120')
      expect(snippet).toContain('accounting-port=18121')
    })

    it('Mikrotik: inclui o port do CoA', () => {
      const snippet = buildSnippet('mikrotik', realCtx)
      expect(snippet).toContain('/radius incoming set accept=yes port=3799')
    })

    it('Unifi: usa vpsHost como "IP / Hostname"', () => {
      const snippet = buildSnippet('unifi', realCtx)
      expect(snippet).toContain('IP / Hostname:       admin.example.com')
      expect(snippet).toContain('Port:                18120')
    })

    it('SonicWall nativo: inclui Auth port e Accounting port', () => {
      const snippet = buildSnippet('sonicwall', realCtx)
      expect(snippet).toContain('Host/IP:            admin.example.com')
      expect(snippet).toContain('Auth port:          18120')
      expect(snippet).toContain('Accounting port:    18121')
    })

    it('pfSense: usa Hostname correto', () => {
      const snippet = buildSnippet('pfsense', realCtx)
      expect(snippet).toContain('Hostname or IP address:    admin.example.com')
      expect(snippet).toContain('Authentication port:       18120')
      expect(snippet).toContain('Accounting port:           18121')
    })

    it('todos os vendors mantêm <SHARED_SECRET> como placeholder (backend nunca devolve o valor)', () => {
      for (const vendor of ['mikrotik', 'unifi', 'sonicwall', 'pfsense'] as const) {
        const snippet = buildSnippet(vendor, realCtx)
        expect(snippet, `vendor=${vendor}`).toContain('<SHARED_SECRET>')
      }
    })
  })

  describe('sem portas (tenant ainda em provisioning)', () => {
    const emptyCtx = {}

    it('Mikrotik: usa <VPS_IP>, <PORTA_AUTH>, <PORTA_ACCT> como placeholders', () => {
      const snippet = buildSnippet('mikrotik', emptyCtx)
      expect(snippet).toContain('address=<VPS_IP>')
      expect(snippet).toContain('authentication-port=<PORTA_AUTH>')
      expect(snippet).toContain('accounting-port=<PORTA_ACCT>')
    })

    it('CoA usa default 3799 quando coaPort não passada', () => {
      const snippet = buildSnippet('mikrotik', emptyCtx)
      expect(snippet).toContain('port=3799')
    })
  })

  it('CoA customizado é propagado em todos os vendors', () => {
    const ctx = { vpsHost: 'x', radiusAuthPort: 18120, radiusAcctPort: 18121, coaPort: 1700 }
    for (const vendor of ['mikrotik', 'unifi', 'sonicwall', 'pfsense'] as const) {
      const snippet = buildSnippet(vendor, ctx)
      expect(snippet, `vendor=${vendor}`).toContain('1700')
    }
  })
})
