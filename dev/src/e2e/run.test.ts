import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Machine, play, type Terminal, type Timings } from './run.ts'
import type { Scenario } from './scenario.ts'

const TIMINGS: Timings = {
  poll: 1,
  authorizationUrl: 50,
  signIn: 50,
  prompt: 50,
  settle: 1,
  scenario: 50,
  exit: 7,
}
const ACCOUNT = { email: 'demo@polly.localhost', password: 'demo-password' }
const AUTHORIZE = 'https://x.polly.localhost/api/auth/oauth2/authorize?client_id=c'
const CODE = 'A'.repeat(43)

function terminal(screen: () => string): Terminal & { typed: string[]; stopped: number[] } {
  const typed: string[] = []
  const stopped: number[] = []
  return {
    output: screen,
    type: (text) => typed.push(text),
    stop: async (grace) => {
      stopped.push(grace)
    },
    typed,
    stopped,
  }
}

const PAGES: Record<string, { url: string; elements: string[] }> = {
  none: { url: 'about:blank', elements: [] },
  'sign-in': {
    url: 'https://x.polly.localhost/sign-in?client_id=c&sig=s',
    elements: ['input[name=email]', 'input[name=password]', 'button[type=submit]', 'button'],
  },
  consent: { url: 'https://x.polly.localhost/consent?client_id=c&sig=s', elements: ['button', 'Allow'] },
  callback: { url: 'http://localhost:4000/callback?code=c', elements: [] },
}

// What the browser remembers of earlier runs: a Polly session, a consent.
interface Remembered {
  signedIn?: boolean
  consented?: boolean
}

// agent-browser on the sign-in flow: the authorization URL shows the sign-in
// page unless the browser is signed in to Polly; submitting the form leaves
// that page only later; the consent page shows unless the learner already
// consented, sending them straight back to Claude Code. A command fails when
// its element is not on the page.
function browser({ signedIn, consented }: Remembered, onAuthenticated: () => void) {
  let page = 'none'
  let submitted = false
  const calls: string[][] = []
  const on = (element: string) => {
    if (!(PAGES[page]?.elements ?? []).includes(element)) {
      throw new Error(`no element ${element} on the ${page} page`)
    }
  }
  const reach = (next: string) => {
    page = next
    if (next === 'callback') {
      onAuthenticated()
    }
  }
  const run = async (...args: string[]) => {
    calls.push(args)
    const [command = '', ...rest] = args
    if (command === 'open') {
      if (signedIn) {
        reach(consented ? 'callback' : 'consent')
      } else {
        page = 'sign-in'
      }
    } else if (command === 'get' && rest[0] === 'url') {
      const url = `${PAGES[page]?.url}\n`
      if (submitted && page === 'sign-in') {
        reach(consented ? 'callback' : 'consent')
      }
      return url
    } else if (command === 'wait' || command === 'fill') {
      on(rest[0] ?? '')
    } else if (command === 'click') {
      on(rest[0] ?? '')
      submitted = true
    } else if (command === 'find') {
      on(rest.at(-1) ?? '')
      reach('callback')
    }
    return ''
  }
  return { run, calls }
}

const scenario: Scenario = {
  name: 'smoke',
  prompt: 'start a lesson',
  done: (transcript) => transcript.includes('done'),
  failures: (transcript) => (transcript.includes('done') ? [] : ['whoami was not called']),
}

// A transcript showing the scenario finished.
const finished = join(mkdtempSync(join(tmpdir(), 'transcript-')), 'session.jsonl')
writeFileSync(finished, 'done')

function machine(
  overrides: Partial<Machine> = {},
  remembered: Remembered = {},
): Machine & { browserCalls: string[][] } {
  let authenticated = false
  const fake = browser(remembered, () => {
    authenticated = true
  })
  return {
    signedIn: async () => false,
    login: () => terminal(() => `Open ${AUTHORIZE}\n${authenticated ? 'Authenticated' : ''}`),
    browser: fake.run,
    session: () => terminal(() => 'for shortcuts'),
    transcript: () => finished,
    browserCalls: fake.calls,
    ...overrides,
  }
}

function run(m: Machine) {
  const root = mkdtempSync(join(tmpdir(), 'e2e-'))
  const lines: string[] = []
  return {
    root,
    lines,
    result: play({
      root,
      scenario,
      machine: m,
      account: ACCOUNT,
      out: (line) => lines.push(line),
      timings: TIMINGS,
    }),
  }
}

describe('end-to-end run', () => {
  it('US6/AC2: signs in, waits for the consent page, then allows', async () => {
    const m = machine()
    const { result } = run(m)
    expect((await result).failures).toEqual([])
    expect(m.browserCalls.filter((call) => call[0] === 'find')).toEqual([
      ['find', 'role', 'button', 'click', '--name', 'Allow'],
    ])
    expect(m.browserCalls.at(-1)).toEqual(['close'])
  })

  it('US6/AC2: signs in a learner who already consented, with no consent page to answer', async () => {
    const m = machine({}, { consented: true })
    const { result } = run(m)
    expect((await result).failures).toEqual([])
    expect(m.browserCalls.some((call) => call[0] === 'find')).toBe(false)
    expect(m.browserCalls.at(-1)).toEqual(['close'])
  })

  it('US6/AC2: consents in a browser still signed in to Polly, with no sign-in form to fill', async () => {
    const m = machine({}, { signedIn: true })
    const { result } = run(m)
    expect((await result).failures).toEqual([])
    expect(m.browserCalls.some((call) => call[0] === 'fill')).toBe(false)
    expect(m.browserCalls.filter((call) => call[0] === 'find')).toHaveLength(1)
  })

  it('FR-024: closes the browser when the sign-in fails, so the next run starts from no page', async () => {
    const m = machine({ login: () => terminal(() => `Open ${AUTHORIZE}`) })
    const { result } = run(m)
    expect((await result).failures).toEqual(['MCP sign-in: timed out waiting for the MCP sign-in'])
    expect(m.browserCalls.at(-1)).toEqual(['close'])
  })

  it('FR-024: a failed sign-in is a failure naming its step, with the terminal kept', async () => {
    const m = machine({
      login: () => terminal(() => `Open ${AUTHORIZE}\nwaiting, code ${CODE}`),
      // The browser is sent back to Claude Code, which never says it is signed in.
      browser: async (...args) => (args[0] === 'get' ? `${PAGES['callback']?.url}\n` : ''),
    })
    const { lines, result } = run(m)
    const { failures, transcript } = await result
    expect(failures).toEqual(['MCP sign-in: timed out waiting for the MCP sign-in'])
    expect(transcript).toBe('(no transcript)')
    const screen = lines.find((line) => line.startsWith('terminal: '))?.slice('terminal: '.length) ?? ''
    expect(screen).toMatch(/\.dev\/logs\/e2e-[0-9a-f-]+\.log$/)
    expect(readFileSync(screen, 'utf8')).toBe(`Open ${AUTHORIZE}\nwaiting, code [redacted]`)
  })

  it('FR-024: a failed browser command ends the sign-in, naming it', async () => {
    const m = machine({
      browser: async (...args) => {
        if (args[0] === 'open') {
          throw new Error('agent-browser open failed: net::ERR_CERT_AUTHORITY_INVALID')
        }
        return ''
      },
    })
    const { result } = run(m)
    expect((await result).failures).toEqual([
      'MCP sign-in: agent-browser open failed: net::ERR_CERT_AUTHORITY_INVALID',
    ])
  })

  it('FR-024: a session that never shows its prompt names that step, with what the transcript misses', async () => {
    const m = machine({
      signedIn: async () => true,
      session: () => terminal(() => 'starting'),
      transcript: () => undefined,
    })
    const { lines, result } = run(m)
    expect((await result).failures).toEqual([
      'session: timed out waiting for the Claude Code prompt',
      'whoami was not called',
    ])
    expect(lines.some((line) => line.startsWith('terminal: '))).toBe(true)
  })

  it('C38: a scenario that finishes passes, its transcript returned and no terminal kept', async () => {
    const session = terminal(() => 'for shortcuts')
    const { lines, result } = run(machine({ signedIn: async () => true, session: () => session }))
    expect(await result).toEqual({ failures: [], transcript: finished })
    expect(session.typed).toEqual(['start a lesson', '\r', '/exit\r'])
    expect(lines.some((line) => line.startsWith('terminal: '))).toBe(false)
  })

  it('C38: a run whose MCP server is already connected signs nothing in', async () => {
    let logins = 0
    const m = machine({
      signedIn: async () => true,
      login: () => {
        logins += 1
        return terminal(() => '')
      },
    })
    const { lines, result } = run(m)
    expect((await result).failures).toEqual([])
    expect(logins).toBe(0)
    expect(m.browserCalls).toEqual([])
    expect(lines.some((line) => line.startsWith('signing'))).toBe(false)
  })

  it('FR-024: a session that never shows its prompt is still exited and ended', async () => {
    const session = terminal(() => 'starting')
    const { result } = run(machine({ signedIn: async () => true, session: () => session }))
    await result
    expect(session.typed).toEqual(['/exit\r'])
    expect(session.stopped).toEqual([TIMINGS.exit])
  })

  it('FR-024: a scenario that never finishes still exits and ends its session', async () => {
    const session = terminal(() => 'for shortcuts')
    const { result } = run(
      machine({ signedIn: async () => true, session: () => session, transcript: () => undefined }),
    )
    expect((await result).failures[0]).toBe('session: timed out waiting for the smoke scenario')
    expect(session.typed.at(-1)).toBe('/exit\r')
    expect(session.stopped).toEqual([TIMINGS.exit])
  })

  it('FR-024: a failed sign-in still ends claude mcp login, at once', async () => {
    const login = terminal(() => `Open ${AUTHORIZE}`)
    const { result } = run(machine({ login: () => login }))
    expect((await result).failures).toEqual(['MCP sign-in: timed out waiting for the MCP sign-in'])
    expect(login.stopped).toEqual([0])
  })

  it('FR-024: a sign-in that succeeds gives claude mcp login time to write its credentials', async () => {
    let authenticated = false
    const fake = browser({}, () => {
      authenticated = true
    })
    const login = terminal(() => `Open ${AUTHORIZE}\n${authenticated ? 'Authenticated' : ''}`)
    const { result } = run(machine({ login: () => login, browser: fake.run }))
    expect((await result).failures).toEqual([])
    expect(login.stopped).toEqual([TIMINGS.exit])
  })

  it('FR-024: a browser that fails to close neither masks why the sign-in failed nor fails one that succeeded', async () => {
    const failingClose =
      (m: Machine): Machine['browser'] =>
      async (...args) => {
        if (args[0] === 'close') {
          throw new Error('agent-browser close failed: no session')
        }
        return m.browser(...args)
      }
    const succeeding = machine()
    const { result } = run({ ...succeeding, browser: failingClose(succeeding) })
    expect((await result).failures).toEqual([])
    const failing = machine({ login: () => terminal(() => `Open ${AUTHORIZE}`) })
    const failed = run({ ...failing, browser: failingClose(failing) })
    expect((await failed.result).failures).toEqual(['MCP sign-in: timed out waiting for the MCP sign-in'])
  })

  it('FR-024: a browser that prints no URL fails the sign-in naming what it printed', async () => {
    const m = machine({ browser: async (...args) => (args[0] === 'get' ? 'Daemon restarting\n' : '') })
    const { result } = run(m)
    expect((await result).failures).toEqual([
      'MCP sign-in: agent-browser get url printed no URL: Daemon restarting',
    ])
  })

  it('FR-024: a browser stuck on a Polly page names the page and its alert', async () => {
    const stuck = async (...args: string[]) => {
      if (args[0] === 'get' && args[1] === 'url') {
        return `${PAGES['sign-in']?.url}\n`
      }
      if (args[0] === 'get' && args[1] === 'text') {
        return 'Wrong email or password.\n'
      }
      return ''
    }
    const { result } = run(machine({ browser: stuck }))
    expect((await result).failures).toEqual([
      `MCP sign-in: timed out waiting for the browser to leave Polly, on ${PAGES['sign-in']?.url}: Wrong email or password.`,
    ])
    const silent = async (...args: string[]) => {
      if (args[0] === 'get' && args[1] === 'text') {
        throw new Error('agent-browser get failed: Element not found: [role=alert]')
      }
      return stuck(...args)
    }
    const quiet = run(machine({ browser: silent }))
    expect((await quiet.result).failures).toEqual([
      `MCP sign-in: timed out waiting for the browser to leave Polly, on ${PAGES['sign-in']?.url}`,
    ])
  })

  it('reads where the transcript is only until it finds it', async () => {
    let calls = 0
    const transcript = () => {
      calls += 1
      return calls < 3 ? undefined : finished
    }
    const { result } = run(machine({ signedIn: async () => true, transcript }))
    expect(await result).toEqual({ failures: [], transcript: finished })
    expect(calls).toBe(3)
  })
})
