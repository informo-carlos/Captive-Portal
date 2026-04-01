import crypto from 'node:crypto'

const ALGO = 'aes-256-cbc'

// Deriva uma chave de 32 bytes a partir da ENCRYPTION_KEY do env
function getKey(encryptionKey: string): Buffer {
  return crypto.createHash('sha256').update(encryptionKey).digest()
}

export function encrypt(text: string, encryptionKey: string): string {
  const key = getKey(encryptionKey)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export function decrypt(cipherText: string, encryptionKey: string): string {
  const key = getKey(encryptionKey)
  const [ivHex, encrypted] = cipherText.split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Formato de texto criptografado inválido (esperado iv:ciphertext)')
  }
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
