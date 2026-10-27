import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues } from '../shared/i18n/index.ts'

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
  signInEmail: vi.fn(),
  consent: vi.fn(),
}))

vi.mock('../shared/auth/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/auth/index.ts')>()),
  authClient: {
    useSession: auth.useSession,
    signIn: { email: auth.signInEmail },
    oauth2: { consent: auth.consent },
  },
}))

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

describe('application entry', () => {
  it('renders the page of the current path, in the reader language', async () => {
    window.history.pushState({}, '', '/sign-in')
    document.body.innerHTML = '<div id="root"></div>'
    await act(async () => {
      await import('./index.tsx')
    })
    expect(screen.getByRole('heading').textContent).toBe(en['signIn.title'])
    expect(document.documentElement.lang).toMatch(/^(en|fr)$/)
  })
})
