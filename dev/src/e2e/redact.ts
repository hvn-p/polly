// An event code is a bearer secret (FR-035): what a run keeps on disk shows
// none, wherever the screen repeated it. A code is 43 base64url characters
// standing alone.

const EVENT_CODE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g

export function redactEventCodes(screen: string): string {
  return screen.replace(EVENT_CODE, '[redacted]')
}
