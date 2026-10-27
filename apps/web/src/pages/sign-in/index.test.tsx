import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues, translator } from '../../shared/i18n/index.ts'
import { SignInPage } from './index.tsx'

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
  signInEmail: vi.fn(),
  consent: vi.fn(),
}))

vi.mock('../../shared/auth/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/auth/index.ts')>()),
  authClient: {
    useSession: auth.useSession,
    signIn: { email: auth.signInEmail },
    oauth2: { consent: auth.consent },
  },
}))

const t = translator(['en'])
const en = catalogues.en
let assigned: string[]

beforeEach(() => {
  assigned = []
  vi.spyOn(window.location, 'assign').mockImplementation((url) => {
    assigned.push(String(url))
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  auth.useSession.mockReset()
  auth.signInEmail.mockReset()
  auth.consent.mockReset()
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
    expect(screen.getByRole('alert').textContent).toBe(en['signIn.emailInvalid'])
    expect(auth.signInEmail).not.toHaveBeenCalled()
  })

  it('signs in, then goes where the server says, or home', async () => {
    auth.signInEmail.mockResolvedValueOnce({ data: { url: '/consent?x=1' }, error: null })
    render(<SignInPage t={t} />)
    fillSignIn('demo@polly.localhost', 'polly-demo-learner')
    await submit(en['signIn.submit'])
    expect(auth.signInEmail).toHaveBeenCalledWith({
      email: 'demo@polly.localhost',
      password: 'polly-demo-learner',
    })
    auth.signInEmail.mockResolvedValueOnce({ data: { token: 'x' }, error: null })
    await submit(en['signIn.submit'])
    expect(assigned).toEqual(['/consent?x=1', '/'])
  })

  it('says a refused sign-in apart from an unexpected failure', async () => {
    auth.signInEmail.mockResolvedValueOnce({ data: null, error: { status: 401 } })
    render(<SignInPage t={t} />)
    fillSignIn('demo@polly.localhost', 'wrong-password')
    await submit(en['signIn.submit'])
    expect(screen.getByRole('alert').textContent).toBe(en['signIn.refused'])
    auth.signInEmail.mockResolvedValueOnce({ data: null, error: { status: 500 } })
    await submit(en['signIn.submit'])
    expect(screen.getByRole('alert').textContent).toBe(en['error.unexpected'])
    expect(assigned).toEqual([])
  })
})
