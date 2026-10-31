import { BOUNDS } from '@polly/contract'
import type { MessageKey } from '../../shared/i18n/index.ts'

export const { email: EMAIL, password: PASSWORD } = BOUNDS.SignInRequest

// The bounds of the API's contract, which checks them again: the form only
// spares a round trip.
export function signInProblem(email: string, password: string): MessageKey | undefined {
  if (email.length < EMAIL.min || email.length > EMAIL.max || !email.includes('@')) {
    return 'signIn.emailInvalid'
  }
  if (password.length < PASSWORD.min || password.length > PASSWORD.max) {
    return 'signIn.passwordInvalid'
  }
  return undefined
}

// The values of a problem's message: the bounds it names.
export function problemValues(problem: MessageKey): Record<string, string> {
  const bounds =
    problem === 'signIn.emailInvalid' ? EMAIL : problem === 'signIn.passwordInvalid' ? PASSWORD : undefined
  return bounds === undefined ? {} : { min: String(bounds.min), max: String(bounds.max) }
}
