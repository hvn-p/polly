import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { portless, portlessRoutes } from '../src/infra/portless.ts'

const portlessRuns = await portless(['doctor']).then(
  (output) => output.includes('Proxy is responding'),
  () => false,
)

// portless is absent from CI, where the commands use its fake: this test of
// the adapter itself runs locally only.
describe.skipIf(!portlessRuns)('portless route adapter (local only)', () => {
  it('adds a route, reads its port back, and removes it; removing again changes nothing', async () => {
    const routes = portlessRoutes()
    const name = `test-${randomBytes(3).toString('hex')}.polly`
    expect(await routes.portOf(name)).toBeUndefined()
    await routes.add(name, 45991)
    try {
      expect(await routes.portOf(name)).toBe(45991)
      expect(await routes.portOf(`other-${name}`)).toBeUndefined()
    } finally {
      await routes.remove(name)
    }
    expect(await routes.portOf(name)).toBeUndefined()
    await expect(routes.remove(name)).resolves.toBeUndefined()
  })
})
