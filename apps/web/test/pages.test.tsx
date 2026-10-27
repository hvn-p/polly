import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsentPage } from '../src/pages/consent/index.tsx'
import { HomePage } from '../src/pages/home/index.tsx'
import { SignInPage } from '../src/pages/sign-in/index.tsx'
import { catalogues, translator } from '../src/shared/i18n/index.ts'

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
  signInEmail: vi.fn(),
  consent: vi.fn(),
}))

vi.mock('../src/shared/auth/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/shared/auth/index.ts')>()),
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

describe('home page', () => {
  it('shows the signed-in learner', () => {
    auth.useSession.mockReturnValue({ data: { user: { name: 'Demo Learner' } }, isPending: false })
    render(<HomePage t={t} />)
    expect(screen.getByText('Signed in as Demo Learner.')).toBeDefined()
  })

  it('offers to sign in when signed out, and shows nothing while the session loads', () => {
    auth.useSession.mockReturnValue({ data: null, isPending: false })
    render(<HomePage t={t} />)
    expect(screen.getByRole('link', { name: en['home.signIn'] }).getAttribute('href')).toBe('/sign-in')
    cleanup()
    auth.useSession.mockReturnValue({ data: null, isPending: true })
    const { container } = render(<HomePage t={t} />)
    expect(container.innerHTML).toBe('')
  })
})

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

describe('consent page', () => {
  it('names the client and follows the server after allowing', async () => {
    window.history.pushState({}, '', '/consent?client_id=https%3A%2F%2Fclient.example')
    auth.consent.mockResolvedValueOnce({ data: { url: 'http://localhost:1/callback?code=c' }, error: null })
    render(<ConsentPage t={t} />)
    expect(screen.getByText('https://client.example asks to use Polly on your behalf.')).toBeDefined()
    await submit(en['consent.allow'])
    expect(auth.consent).toHaveBeenCalledWith({ accept: true })
    expect(assigned).toEqual(['http://localhost:1/callback?code=c'])
  })

  it('denies, and says so when the server gives nowhere to go', async () => {
    auth.consent.mockResolvedValueOnce({ data: null, error: { status: 400 } })
    render(<ConsentPage t={t} />)
    await submit(en['consent.deny'])
    expect(auth.consent).toHaveBeenCalledWith({ accept: false })
    expect(screen.getByRole('alert').textContent).toBe(en['error.unexpected'])
  })
})

describe('application entry', () => {
  it('renders the page of the current path, in the reader language', async () => {
    window.history.pushState({}, '', '/sign-in')
    document.body.innerHTML = '<div id="root"></div>'
    await act(async () => {
      await import('../src/app/index.tsx')
    })
    expect(screen.getByRole('heading').textContent).toBe(en['signIn.title'])
    expect(document.documentElement.lang).toMatch(/^(en|fr)$/)
  })
})
