import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues, translator } from '../../shared/i18n/index.ts'
import { ConsentPage } from './index.tsx'

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

async function submit(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('consent page', () => {
  it('names the client and follows the API after allowing, carrying the authorization request', async () => {
    window.history.pushState({}, '', '/consent?client_id=https%3A%2F%2Fclient.example&sig=s')
    api.call.mockResolvedValueOnce({ ok: true, value: { next: 'http://localhost:1/callback?code=c' } })
    render(<ConsentPage t={t} />)
    expect(screen.getByText('https://client.example asks to use Polly on your behalf.')).toBeDefined()
    await submit(en['consent.allow'])
    expect(api.call).toHaveBeenCalledWith('consent', {
      accept: true,
      oauthQuery: 'client_id=https%3A%2F%2Fclient.example&sig=s',
    })
    expect(assigned).toEqual(['http://localhost:1/callback?code=c'])
  })

  it('denies, and says so when the API refuses', async () => {
    api.call.mockResolvedValueOnce({ ok: false, status: 400, code: 'INVALID_OAUTH_REQUEST' })
    render(<ConsentPage t={t} />)
    await submit(en['consent.deny'])
    expect(api.call).toHaveBeenCalledWith('consent', { accept: false, oauthQuery: '' })
    expect(screen.getByRole('alert').textContent).toBe(en['error.unexpected'])
  })
})
