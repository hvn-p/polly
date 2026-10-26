// A refusal: the command declines to act, says why in one line, and changes
// nothing it has not already said it changed. Printed as `<CODE>: <message>`.
export class Refusal extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
