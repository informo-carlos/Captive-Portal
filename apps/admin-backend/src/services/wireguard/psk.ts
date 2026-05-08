import { randomBytes } from 'node:crypto'

/**
 * Gera uma Pre-Shared Key WireGuard: 32 bytes aleatórios em base64.
 */
export function generatePsk(): string {
  return randomBytes(32).toString('base64')
}
