import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogues } from '../shared/i18n/index.ts'

const api = vi.hoisted(() => ({ call: vi.fn() }))

vi.mock('../shared/api/index.ts', () => ({ api }))

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
  api.call.mockReset()
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
