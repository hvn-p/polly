import { randomBytes } from 'node:crypto'
import { createLearner, fakeClock, mcpAccessToken, openStream } from '@polly/api/test-support'
import { describe, expect, it } from 'vitest'
import { mcpClient, resultOf } from './support/mcp.ts'
import { mcpTestServer } from './support/server.ts'

const clock = fakeClock()
const server = await mcpTestServer({}, { clock })

describe("start_lesson and the lesson's event stream", () => {
  it('C47: a connection waiting with an unbound code gets the test event once the agent calls start_lesson', async () => {
    const learner = await createLearner(server, 'listener')
    const client = await mcpClient(server, await mcpAccessToken(server, learner.email, learner.password))
    const code = randomBytes(32).toString('base64url')
    const stream = await openStream(`${server.url}/api/agent-events`, { authorization: `Bearer ${code}` })
    await clock.advance(3_000)
    expect(stream.frames).toEqual([])

    expect(await client.callTool({ name: 'start_lesson', arguments: { code } }).then(resultOf)).toEqual({
      bound: true,
    })
    await clock.advance(1_000)
    expect(stream.frames).toEqual([{ event: 'test', data: { type: 'test' } }])
    stream.close()
  })
})
