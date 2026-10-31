import { BOUNDS } from '@polly/contract'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues, translator } from '../../shared/i18n/index.ts'
import { SignInPage } from './index.tsx'

const api = vi.hoisted(() => ({ call: vi.fn() }))

vi.mock('../../shared/api/index.ts', () => ({ api }))

const t = translator(['en'])
const en = catalogues.en
let assigned: string[]

beforeEach(() => {
  assigned = []
  window.history.pushState({}, '', '/')
  vi.spyOn(window.location, 'assign').mockImplementation((url) => {
    assigned.push(String(url))
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  api.call.mockReset()
})

function fillSignIn(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText(en['signIn.email']), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(en['signIn.password']), { target: { value: password } })
}

async function submit(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('sign-in page', () => {
  it('names the field out of bounds, without calling the API', async () => {
    render(<SignInPage t={t} />)
    fillSignIn('a@', 'password-1')
    await submit(en['signIn.submit'])
    expect(screen.getByRole('alert').textContent).toBe('Enter an email address of 3 to 254 characters.')
    expect(api.call).not.toHaveBeenCalled()
  })

  it("names the contract's bounds in each field's message, in every language, the catalogue writing none", async () => {
    const cases = [
      { key: 'signIn.emailInvalid', email: 'a@', bounds: BOUNDS.SignInRequest.email },
      { key: 'signIn.passwordInvalid', email: 'a@b.c', bounds: BOUNDS.SignInRequest.password },
    ] as const
    for (const [language, catalogue] of Object.entries(catalogues)) {
      for (const { key, email, bounds } of cases) {
        expect(catalogue[key]).not.toMatch(/\d/)
        render(<SignInPage t={translator([language])} />)
        fireEvent.change(screen.getByLabelText(catalogue['signIn.email']), { target: { value: email } })
        fireEvent.change(screen.getByLabelText(catalogue['signIn.password']), { target: { value: 'short' } })
        await submit(catalogue['signIn.submit'])
        expect(screen.getByRole('alert').textContent).toBe(
          catalogue[key].replace('{min}', String(bounds.min)).replace('{max}', String(bounds.max)),
        )
        expect(screen.getByRole('alert').textContent).toContain(`${bounds.min}`)
        expect(screen.getByRole('alert').textContent).toContain(`${bounds.max}`)
        cleanup()
      }
    }
  })

  it("bounds each field as the API's contract does", () => {
    render(<SignInPage t={t} />)
    const email = screen.getByLabelText<HTMLInputElement>(en['signIn.email'])
    const password = screen.getByLabelText<HTMLInputElement>(en['signIn.password'])
    const { email: emailBounds, password: passwordBounds } = BOUNDS.SignInRequest
    expect([email.minLength, email.maxLength]).toEqual([emailBounds.min, emailBounds.max])
    expect([password.minLength, password.maxLength]).toEqual([passwordBounds.min, passwordBounds.max])
  })

  it("signs in through the API's contract, then goes where it says, or home", async () => {
    api.call.mockResolvedValueOnce({ ok: true, value: { next: '/consent?x=1' } })
    render(<SignInPage t={t} />)
    fillSignIn('demo@polly.localhost', 'polly-demo-learner')
    await submit(en['signIn.submit'])
    expect(api.call).toHaveBeenCalledWith('signIn', {
      email: 'demo@polly.localhost',
      password: 'polly-demo-learner',
    })
    api.call.mockResolvedValueOnce({ ok: true, value: {} })
    await submit(en['signIn.submit'])
    expect(assigned).toEqual(['/consent?x=1', '/'])
  })

  it('carries the pending authorization request the page received', async () => {
    window.history.pushState({}, '', '/sign-in?client_id=c&sig=s')
    api.call.mockResolvedValueOnce({ ok: true, value: {} })
    render(<SignInPage t={t} />)
    fillSignIn('demo@polly.localhost', 'polly-demo-learner')
    await submit(en['signIn.submit'])
    expect(api.call).toHaveBeenCalledWith('signIn', {
      email: 'demo@polly.localhost',
      password: 'polly-demo-learner',
      oauthQuery: 'client_id=c&sig=s',
    })
  })

  it('says a refused sign-in apart from an unexpected failure', async () => {
    api.call.mockResolvedValueOnce({ ok: false, status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })
    render(<SignInPage t={t} />)
    fillSignIn('demo@polly.localhost', 'wrong-password')
    await submit(en['signIn.submit'])
    expect(screen.getByRole('alert').textContent).toBe(en['signIn.refused'])
    api.call.mockResolvedValueOnce({ ok: false, status: 500, code: 'UNEXPECTED' })
    await submit(en['signIn.submit'])
    expect(screen.getByRole('alert').textContent).toBe(en['error.unexpected'])
    expect(assigned).toEqual([])
  })
})
