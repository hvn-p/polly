// The API's client for its interfaces: each operation of the generated contract,
// called with a bearer token, its value checked against its schema or its
// refusal read back by code.

import { z } from 'zod'
import { OPERATIONS, type Operations, REFUSAL_CODES, RESPONSES, type RefusalCode } from './generated.ts'

export * from './generated.ts'

export type Outcome<T> =
  | { ok: true; value: T }
  // UNEXPECTED: an answer the contract does not describe.
  | { ok: false; status: number; code: RefusalCode | 'UNEXPECTED'; reason?: string }

type Arguments<N extends keyof Operations> = Operations[N]['body'] extends undefined
  ? []
  : [Operations[N]['body']]

export interface ApiClient {
  call: <N extends keyof Operations>(
    name: N,
    ...body: Arguments<N>
  ) => Promise<Outcome<Operations[N]['response']>>
}

function isRefusalCode(code: unknown): code is RefusalCode {
  return (REFUSAL_CODES as readonly unknown[]).includes(code)
}

export function createApiClient({
  baseUrl,
  token,
  fetch = globalThis.fetch,
}: {
  baseUrl: string
  // The bearer token of each call, obtained when the call is made.
  token: () => Promise<string>
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}): ApiClient {
  // Built with the client, so a module that only reads the contract's tables
  // (the plugin's monitor) bundles no schema library.
  const validators = Object.fromEntries(
    Object.entries(RESPONSES).map(([name, schema]) => [name, z.fromJSONSchema(schema)]),
  )
  return {
    call: async (name, ...[body]) => {
      const { method, path } = OPERATIONS[name]
      const headers: Record<string, string> = { authorization: `Bearer ${await token()}` }
      if (body !== undefined) {
        headers['content-type'] = 'application/json'
      }
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const read = (await response.json().catch(() => undefined)) as
        | { code?: unknown; reason?: unknown }
        | undefined
      if (response.ok) {
        if (!(validators[name]?.safeParse(read).success ?? false)) {
          return {
            ok: false,
            status: response.status,
            code: 'UNEXPECTED',
            reason: 'the answer does not match the contract',
          }
        }
        return { ok: true, value: read as Operations[typeof name]['response'] }
      }
      if (!isRefusalCode(read?.code)) {
        return { ok: false, status: response.status, code: 'UNEXPECTED' }
      }
      return {
        ok: false,
        status: response.status,
        code: read.code,
        ...(typeof read.reason === 'string' ? { reason: read.reason } : {}),
      }
    },
  }
}
