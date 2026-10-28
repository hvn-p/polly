import { createHash } from 'node:crypto'

// The one hash Polly computes: SHA-256, in hex.
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
