/**
 * Gera Pre-shared Key pra IPsec.
 * 32 bytes random (256 bits) base64 = ~44 chars.
 */

import { randomBytes } from 'node:crypto'

export function generatePsk(): string {
  return randomBytes(32).toString('base64')
}
