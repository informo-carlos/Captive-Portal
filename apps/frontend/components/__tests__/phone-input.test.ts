import { describe, it, expect } from 'vitest'
import { validatePhone } from '../PhoneInput'

describe('validatePhone', () => {
  it('rejeita string vazia com mensagem "Informe"', () => {
    expect(validatePhone('')).toBe('Informe seu número de celular.')
  })

  it('rejeita menos de 11 dígitos como incompleto', () => {
    expect(validatePhone('1')).toBe('Número incompleto.')
    expect(validatePhone('1199')).toBe('Número incompleto.')
    expect(validatePhone('11999999')).toBe('Número incompleto.')
    // 10 dígitos = formato de fixo. Rejeitamos explicitamente — telefone fixo
    // não recebe SMS, deixar passar só trava o usuário depois.
    expect(validatePhone('1199999999')).toBe('Número incompleto.')
  })

  it('rejeita DDD inválido mesmo com 11 dígitos', () => {
    expect(validatePhone('00999999999')).toBe('DDD inválido.')
    // DDD 10 não existe no plano brasileiro
    expect(validatePhone('10999999999')).toBe('DDD inválido.')
  })

  it('rejeita número que não começa com 9 após o DDD', () => {
    // Terceiro dígito tem que ser 9 pra ser celular; 8/7 eram fixos antigos
    expect(validatePhone('11899999999')).toBe('Número de celular inválido.')
    expect(validatePhone('11799999999')).toBe('Número de celular inválido.')
  })

  it('aceita celular válido (11 dígitos, DDD válido, começa com 9)', () => {
    expect(validatePhone('11999999999')).toBeNull()
    expect(validatePhone('21998765432')).toBeNull()
    expect(validatePhone('85988887777')).toBeNull()
  })

  it('cobre DDDs de regiões diferentes', () => {
    expect(validatePhone('11999999999')).toBeNull() // SP
    expect(validatePhone('21999999999')).toBeNull() // RJ
    expect(validatePhone('61999999999')).toBeNull() // DF
    expect(validatePhone('98999999999')).toBeNull() // MA
    expect(validatePhone('92999999999')).toBeNull() // AM
  })
})
