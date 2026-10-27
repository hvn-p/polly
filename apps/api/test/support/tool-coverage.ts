// The MCP tool coverage guard (constitution principle XIV): every tool the
// server lists must be called by an MCP client in the tests.

import type { Client } from '@modelcontextprotocol/client'

const called = new WeakMap<Client, Set<string>>()

// The client, recording the name of every tool it calls.
export function recordCalls(client: Client): Client {
  const names = new Set<string>()
  called.set(client, names)
  const callTool = client.callTool.bind(client)
  client.callTool = ((params, ...rest) => {
    names.add(params.name)
    return callTool(params, ...rest)
  }) as Client['callTool']
  return client
}

export async function assertEveryToolCalled(client: Client): Promise<void> {
  const names = called.get(client) ?? new Set<string>()
  const { tools } = await client.listTools()
  const untested = tools.map(({ name }) => name).filter((name) => !names.has(name))
  if (untested.length > 0) {
    throw new Error(`UNTESTED_MCP_TOOL: ${untested.join(', ')}`)
  }
}
