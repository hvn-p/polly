import { describe, expect, it } from 'vitest'
import { assertTestDatabase } from './global-setup.ts'

describe('test-database guard', () => {
  it('C35: refuses a database whose name does not end in _test', () => {
    expect(() => assertTestDatabase('postgresql://polly_x:pw@127.0.0.1:55432/polly_x')).toThrow(
      /^NOT_A_TEST_DATABASE: polly_x/,
    )
    expect(() => assertTestDatabase('postgresql://u:pw@127.0.0.1:55432/polly_test_x')).toThrow(
      /NOT_A_TEST_DATABASE/,
    )
    expect(() => assertTestDatabase('postgresql://u:pw@127.0.0.1:55432/')).toThrow(/NOT_A_TEST_DATABASE/)
  })

  it('C35: refuses an absent URL, naming the command that creates one', () => {
    expect(() => assertTestDatabase(undefined)).toThrow(/NOT_A_TEST_DATABASE: .*nr dev:up/)
  })

  it('C35: accepts a database whose name ends in _test', () => {
    expect(assertTestDatabase('postgresql://polly_x:pw@127.0.0.1:55432/polly_x_test')).toBe(
      'postgresql://polly_x:pw@127.0.0.1:55432/polly_x_test',
    )
    expect(() =>
      assertTestDatabase('postgresql://u:pw@127.0.0.1:5432/polly_x_test?sslmode=disable'),
    ).not.toThrow()
  })
})
