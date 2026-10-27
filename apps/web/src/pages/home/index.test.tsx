import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues, translator } from '../../shared/i18n/index.ts'
import { HomePage } from './index.tsx'

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
