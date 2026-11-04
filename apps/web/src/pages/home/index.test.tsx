import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues, translator } from '../../shared/i18n/index.ts'
import { HomePage } from './index.tsx'

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

async function renderHome(): Promise<void> {
  await act(async () => {
    render(<HomePage t={t} />)
  })
}

describe('home page', () => {
  it('shows the signed-in learner the API names', async () => {
    api.call.mockResolvedValueOnce({ ok: true, value: { learnerId: 'l1', name: 'Demo Learner' } })
    await renderHome()
    expect(api.call).toHaveBeenCalledWith('getMe')
    expect(screen.getByText('Signed in as Demo Learner.')).toBeDefined()
  })

  it('offers to sign in when the API refuses, and shows nothing while it answers', async () => {
    api.call.mockResolvedValueOnce({ ok: false, status: 401, code: 'UNAUTHORIZED' })
    await renderHome()
    expect(screen.getByRole('link', { name: en['home.signIn'] }).getAttribute('href')).toBe('/sign-in')
    cleanup()
    api.call.mockReturnValueOnce(new Promise(() => undefined))
    const { container } = render(<HomePage t={t} />)
    expect(container.innerHTML).toBe('')
  })
})
