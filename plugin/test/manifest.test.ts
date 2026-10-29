import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'),
)

describe('plugin manifest', () => {
  it('C28: the MCP URL comes from the worktree and defaults to an invalid address, never production', () => {
    expect(manifest.mcpServers.polly).toEqual({
      type: 'http',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude Code expands it, not JavaScript.
      url: '${POLLY_MCP_URL:-https://unconfigured.invalid/mcp}',
    })
  })

  it('declares no static header, so the MCP authenticates through OAuth', () => {
    expect(manifest.mcpServers.polly.headers).toBeUndefined()
  })

  it('starts the event listener when the lesson skill runs', () => {
    expect(manifest.experimental.monitors).toEqual([
      expect.objectContaining({
        name: 'agent-events',
        // The system's CA store holds the local CA of the worktree's HTTPS origin.
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude Code expands it, not JavaScript.
        command: 'node --use-system-ca "${CLAUDE_PLUGIN_ROOT}/monitors/agent-events.mjs"',
        when: expect.stringMatching(/^on-skill-invoke:(polly:)?lesson$/),
      }),
    ])
  })
})
