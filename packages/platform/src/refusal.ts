// A refusal: an expected failure that depends on state, with a code from a closed
// list the caller can act on and a reason for the person reading it. Each
// interface translates it once: an HTTP response, an MCP tool error, a command's
// `<CODE>: <reason>` line.
export class Refusal extends Error {
  readonly code: string

  constructor(code: string, reason: string) {
    super(reason)
    this.code = code
  }

  // `<CODE>: <reason>`, as a person or an agent reads it.
  get text(): string {
    return `${this.code}: ${this.message}`
  }
}
