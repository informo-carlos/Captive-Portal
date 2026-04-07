// Cópia mínima do services/crypto.ts do admin-backend — mesmo formato AES-256-CBC.
// Intencional: o provisioner não importa código do admin-backend pra manter os
// dois apps independentes e com deploys isolados.

import crypto from 'node:crypto'

const ALGO = 'aes-256-cbc'

function getKey(encryptionKey: string): Buffer {
  return crypto.createHash('sha256').update(encryptionKey).digest()
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
