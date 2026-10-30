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
