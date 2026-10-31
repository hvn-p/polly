// The origin a process is reached on from the same machine, from the address it
// listens on: a wildcard address (every interface, as in a container) is read
// back on loopback, an IPv6 address bracketed.

const WILDCARD_TO_LOOPBACK: Record<string, string> = { '0.0.0.0': '127.0.0.1', '::': '::1' }

export function originOf(hostname: string, port: number): string {
  const address = WILDCARD_TO_LOOPBACK[hostname] ?? hostname
  return `http://${address.includes(':') ? `[${address}]` : address}:${port}`
}
