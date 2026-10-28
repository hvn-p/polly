import { describe, expect, it } from 'vitest'
import { assertTestDatabase } from './test-database.ts'

describe('test-database guard', () => {
  it('C35: refuses a database whose name does not end in the identity-derived __test', () => {
    expect(() => assertTestDatabase('postgresql://polly_x:pw@127.0.0.1:55432/polly_x')).toThrow(
      /^NOT_A_TEST_DATABASE: polly_x/,
    )
    expect(() => assertTestDatabase('postgresql://u:pw@127.0.0.1:55432/polly_test_x')).toThrow(
      /NOT_A_TEST_DATABASE/,
    )
    expect(() => assertTestDatabase('postgresql://u:pw@127.0.0.1:55432/')).toThrow(/NOT_A_TEST_DATABASE/)
  })

  it("C35: refuses polly_x_test, identity x-test's development database", () => {
    expect(() => assertTestDatabase('postgresql://u:pw@127.0.0.1:55432/polly_x_test')).toThrow(
      /^NOT_A_TEST_DATABASE: polly_x_test/,
    )
  })

  it('C35: refuses an absent URL, naming the command that creates one', () => {
    expect(() => assertTestDatabase(undefined)).toThrow(/NOT_A_TEST_DATABASE: .*nr dev:up/)
  })

  it('C35: accepts a database whose name ends in __test', () => {
    expect(assertTestDatabase('postgresql://polly_x:pw@127.0.0.1:55432/polly_x__test')).toBe(
      'postgresql://polly_x:pw@127.0.0.1:55432/polly_x__test',
    )
    expect(() =>
      assertTestDatabase('postgresql://u:pw@127.0.0.1:5432/polly_feature_auth__test?sslmode=disable'),
    ).not.toThrow()
  })
})
