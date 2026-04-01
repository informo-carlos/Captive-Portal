// Schema de validação para guest_contact por auth_method.
// Garante consistência do JSONB antes de inserir no banco.
// Referência: infra/postgres/migrations/008_add_guest_fields.sql

export type AuthMethod = 'sms' | 'email' | 'whatsapp' | 'social'

// Contrato de cada auth_method
interface SmsContact {
  phone: string // E.164
}

interface EmailContact {
  email: string
}

interface WhatsappContact {
  phone: string // E.164
  whatsapp_verified?: boolean
}

interface SocialContact {
  provider: string // google, facebook, apple, etc.
  provider_id: string
  email?: string
}

export type GuestContact = SmsContact | EmailContact | WhatsappContact | SocialContact

// Validadores por método
const validators: Record<AuthMethod, (data: Record<string, unknown>) => string | null> = {
  sms: (data) => {
    if (typeof data['phone'] !== 'string' || !data['phone'].startsWith('+')) {
      return 'guest_contact.phone deve ser uma string E.164 (ex: +5511987654321)'
    }
    return null
  },

  email: (data) => {
    if (typeof data['email'] !== 'string' || !data['email'].includes('@')) {
      return 'guest_contact.email deve ser um email válido'
    }
    return null
  },

  whatsapp: (data) => {
    if (typeof data['phone'] !== 'string' || !data['phone'].startsWith('+')) {
      return 'guest_contact.phone deve ser uma string E.164'
    }
    return null
  },

  social: (data) => {
    if (typeof data['provider'] !== 'string' || data['provider'].length === 0) {
      return 'guest_contact.provider é obrigatório'
    }
    if (typeof data['provider_id'] !== 'string' || data['provider_id'].length === 0) {
      return 'guest_contact.provider_id é obrigatório'
    }
    return null
  },
}

/**
 * Valida guest_contact com base no auth_method.
 * Retorna null se válido, ou uma mensagem de erro se inválido.
 */
export function validateGuestContact(
  authMethod: string,
  guestContact: Record<string, unknown>,
): string | null {
  const validator = validators[authMethod as AuthMethod]
  if (!validator) {
    return `auth_method "${authMethod}" não é suportado. Valores válidos: ${Object.keys(validators).join(', ')}`
  }
  return validator(guestContact)
}
