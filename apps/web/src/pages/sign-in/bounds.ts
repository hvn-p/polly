import type { MessageKey } from '../../shared/i18n/index.ts'

// The bounds of Better Auth, checked again by the API: the form only spares a
// round trip.
export function signInProblem(email: string, password: string): MessageKey | undefined {
  if (email.length < 3 || email.length > 254 || !email.includes('@')) {
    return 'signIn.emailInvalid'
  }
  if (password.length < 8 || password.length > 128) {
    return 'signIn.passwordInvalid'
  }
  return undefined
}
