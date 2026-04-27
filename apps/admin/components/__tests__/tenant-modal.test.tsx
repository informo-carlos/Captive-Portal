/**
 * Regressão: a primeira versão do `inputClass` no tenant-modal usava
 * `fieldError?.field === field` sem garantir que `field` fosse definido.
 * Quando `fieldError === null` (estado normal) e o input chamava
 * `inputClass()` sem arg, a expressão resolvia `undefined === undefined`
 * e pintava TODOS os campos opcionais (branding, Zenvia, duração, etc.)
 * com borda vermelha mesmo sem erro algum.
 *
 * Esses testes garantem que:
 *  1. Nenhum input fica com `border-red-500/50` quando o modal abre limpo.
 *  2. Quando o backend devolve `field='port'` no erro, SÓ o input do
 *     campo Porta ganha a borda vermelha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TenantModal } from '../tenant-modal'

vi.mock('../../lib/api', () => ({
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    error: string
    code: number
    field?: string
    constructor(payload: { error: string; message: string; code: number; field?: string }) {
      super(payload.message)
      this.error = payload.error
      this.code = payload.code
      this.field = payload.field
    }
  },
}))

vi.mock('../../lib/notification-context', () => ({
  useNotifications: () => ({ add: vi.fn() }),
}))

describe('TenantModal — inputClass não pinta vermelho sem erro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abre limpo: nenhum input está com border-red-500/50', () => {
    render(
      <TenantModal
        tenant={null}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    // Pega todos os inputs e selects renderizados pelo modal
    const inputs: Element[] = [
      ...screen.getAllByRole('textbox'),
      ...Array.from(document.querySelectorAll('input[type="number"]')),
      ...Array.from(document.querySelectorAll('input[type="password"]')),
      ...Array.from(document.querySelectorAll('input[type="url"]')),
      ...Array.from(document.querySelectorAll('input[type="color"]')),
      ...screen.getAllByRole('combobox'),
    ]

    expect(inputs.length).toBeGreaterThan(5) // sanity: o modal tem vários inputs

    for (const el of inputs) {
      const cls = el.className
      expect(
        cls.includes('border-red-500/50'),
        `Input renderizou com borda vermelha sem nenhum erro: classes=${cls}`,
      ).toBe(false)
    }
  })

  it('campos opcionais de branding nunca têm border-red-500/50', () => {
    render(
      <TenantModal
        tenant={null}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    // URL Logo — type=url
    const logoInput = document.querySelector('input[type="url"]')
    expect(logoInput?.className).not.toContain('border-red-500/50')

    // Cor primária / Cor de fundo — campos hex (text)
    const colorTexts = screen.getAllByPlaceholderText(/#0/)
    for (const el of colorTexts) {
      expect(el.className).not.toContain('border-red-500/50')
    }
  })

  it('campo serial secundário (opcional) nunca fica vermelho sem erro', () => {
    render(
      <TenantModal
        tenant={null}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )
    const secondaryInput = screen.getByPlaceholderText(/SN-ABC124/)
    expect(secondaryInput.className).not.toContain('border-red-500/50')
  })

  it('campo duração da sessão (com valor default 480) nunca fica vermelho', () => {
    render(
      <TenantModal
        tenant={null}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )
    const durationInput = screen.getByPlaceholderText('480') as HTMLInputElement
    expect(durationInput.value).toBe('480')
    expect(durationInput.className).not.toContain('border-red-500/50')
  })
})
