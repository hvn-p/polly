import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { portlessRoutes } from '../src/infra/portless.ts'
import { fakePortless } from './support/fake-portless.ts'

// The stand-in, never the machine's portless, whose table the worktrees share.
const standIn = join(fakePortless(), 'portless')

describe('portless route adapter, against a stand-in portless', () => {
  it('reads a route back from the table, and only that route', async () => {
    const routes = portlessRoutes(standIn)
    await routes.add('a.polly', 41000)
    await routes.add('b.polly', 41001)
    expect(await routes.portOf('a.polly')).toBe(41000)
    expect(await routes.portOf('b.polly')).toBe(41001)
    expect(await routes.portOf('polly')).toBeUndefined()
  })

  it('removes a route; removing an absent one changes nothing', async () => {
    const routes = portlessRoutes(standIn)
    await routes.add('c.polly', 41002)
    await routes.remove('c.polly')
    expect(await routes.portOf('c.polly')).toBeUndefined()
    await expect(routes.remove('c.polly')).resolves.toBeUndefined()
  })

  it('reports any other failure', async () => {
    await expect(portlessRoutes('/nonexistent/portless').remove('d.polly')).rejects.toThrow()
  })
})
