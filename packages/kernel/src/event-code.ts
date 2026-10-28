// An event code: the secret an event listener draws, 32 random bytes in
// base64url, which an agent binds to its learner. Stored as its hash only.
const EVENT_CODE = /^[A-Za-z0-9_-]{43}$/

export type EventCode = string & { readonly __brand: 'EventCode' }

export function isEventCode(value: string): value is EventCode {
  return EVENT_CODE.test(value)
}
