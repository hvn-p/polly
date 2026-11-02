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
  exit: 0,
}
const ACCOUNT = { email: 'demo@polly.localhost', password: 'demo-password' }
const AUTHORIZE = 'https://x.polly.localhost/api/auth/oauth2/authorize?client_id=c'
const CODE = 'A'.repeat(43)

function terminal(screen: () => string): Terminal & { typed: string[] } {
  const typed: string[] = []
  return { output: screen, type: (text) => typed.push(text), stop: async () => undefined, typed }
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
})
