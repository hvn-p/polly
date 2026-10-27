import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues, translator } from '../../shared/i18n/index.ts'
import { ConsentPage } from './index.tsx'

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

async function submit(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

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
