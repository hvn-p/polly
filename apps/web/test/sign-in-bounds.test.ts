import { describe, expect, it } from 'vitest'
import { signInProblem } from '../src/pages/sign-in/bounds.ts'

describe('sign-in form bounds', () => {
  it('accepts an email of 3 to 254 characters and a password of 8 to 128', () => {
    expect(signInProblem('a@b', '12345678')).toBeUndefined()
    expect(signInProblem(`${'a'.repeat(250)}@b.c`, 'x'.repeat(128))).toBeUndefined()
  })

  it('names the field outside its bounds', () => {
    expect(signInProblem('a@', '12345678')).toBe('signIn.emailInvalid')
    expect(signInProblem(`${'a'.repeat(251)}@b.c`, '12345678')).toBe('signIn.emailInvalid')
    expect(signInProblem('a@b', '1234567')).toBe('signIn.passwordInvalid')
    expect(signInProblem('a@b', 'x'.repeat(129))).toBe('signIn.passwordInvalid')
  })
})
