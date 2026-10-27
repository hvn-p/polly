// A refusal that depends on state: a named code the caller can act on, and a
// message for the person reading it. Its text reads `<CODE>: <message>`.
export class Refusal extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.code = code
  }
}
