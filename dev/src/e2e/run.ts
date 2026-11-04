// The steps of an end-to-end run, apart from the processes they drive: sign
// the polly MCP server in through the real OAuth flow, with agent-browser
// playing the demo learner, then play a scenario in a Claude Code session and
// read its transcript.

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { redactEventCodes } from './redact.ts'
import type { Scenario } from './scenario.ts'

export interface RunResult {
  failures: string[]
  transcript: string
}

// A command running in a pseudo-terminal.
export interface Terminal {
  // What the screen showed so far, without its escapes.
  output: () => string
  type: (text: string) => void
  // Waits up to `grace` ms for the command to exit, then ends it.
  stop: (grace: number) => Promise<void>
}

// The processes a run drives.
export interface Machine {
  // Whether Claude Code lists the polly MCP server as connected.
  signedIn: () => Promise<boolean>
  // `claude mcp login` for the polly MCP server.
  login: () => Terminal
  // An agent-browser command, resolving with what it printed.
  browser: (...args: string[]) => Promise<string>
  // A Claude Code session of the worktree.
  session: (sessionId: string) => Terminal
  // The session's transcript file, once Claude Code wrote it.
  transcript: (sessionId: string) => string | undefined
}

export interface Timings {
  poll: number
  authorizationUrl: number
  signIn: number
  prompt: number
  // Between the prompt showing and the text typed, and between the text and
  // its return: the interface drops keys typed sooner.
  settle: number
  scenario: number
  exit: number
}

const TIMINGS: Timings = {
  poll: 500,
  authorizationUrl: 30_000,
  signIn: 30_000,
  prompt: 60_000,
  settle: 2000,
  scenario: 240_000,
  exit: 5000,
}

const AUTHORIZATION_URL = /https:\/\/\S+oauth2\/authorize\S+/

async function until(
  condition: () => boolean | Promise<boolean>,
  timeout: number,
  poll: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeout
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await sleep(poll)
  }
}

// Claude Code prints the authorization URL, agent-browser plays the demo
// learner on each page it shows until the browser leaves Polly for Claude
// Code: the sign-in form unless the browser is still signed in to Polly from
// an earlier run, the consent page unless the learner already consented. The
// page is read rather than waited for: a wait in the browser does not outlive
// a navigation.
async function signIn(
  login: Terminal,
  browser: Machine['browser'],
  account: { email: string; password: string },
  timings: Timings,
): Promise<void> {
  await until(
    () => AUTHORIZATION_URL.test(login.output()),
    timings.authorizationUrl,
    timings.poll,
    'the authorization URL',
  )
  const authorize = AUTHORIZATION_URL.exec(login.output())?.[0] ?? ''
  const polly = new URL(authorize).origin
  const answered = new Set<string>()
  let page: URL | undefined
  try {
    await browser('open', authorize)
    await until(
      async () => {
        page = await currentPage(browser)
        if (page.origin !== polly) {
          return true
        }
        if (page.pathname === '/sign-in' && !answered.has(page.pathname)) {
          answered.add(page.pathname)
          await browser('wait', 'input[name=email]')
          await browser('fill', 'input[name=email]', account.email)
          await browser('fill', 'input[name=password]', account.password)
          await browser('click', 'button[type=submit]')
        } else if (page.pathname === '/consent' && !answered.has(page.pathname)) {
          answered.add(page.pathname)
          await browser('find', 'role', 'button', 'click', '--name', 'Allow')
        }
        return false
      },
      timings.signIn,
      timings.poll,
      'the browser to leave Polly',
    ).catch(async (error: unknown) => {
      throw page === undefined
        ? error
        : new Error(`${reason(error)}, on ${page.href}${await alertOf(browser)}`)
    })
    await until(
      () => login.output().includes('Authenticated'),
      timings.signIn,
      timings.poll,
      'the MCP sign-in',
    )
  } finally {
    // The next run starts from no page, whatever this one left. A close that
    // fails says nothing of the sign-in: it neither replaces its failure nor
    // makes one.
    await browser('close').catch(() => undefined)
  }
}

async function currentPage(browser: Machine['browser']): Promise<URL> {
  const printed = (await browser('get', 'url')).trim()
  if (!URL.canParse(printed)) {
    throw new Error(`agent-browser get url printed no URL: ${printed || '(nothing)'}`)
  }
  return new URL(printed)
}

// What the page says went wrong, if it says anything.
async function alertOf(browser: Machine['browser']): Promise<string> {
  const text = await browser('get', 'text', '[role=alert]').catch(() => '')
  return text.trim() === '' ? '' : `: ${text.trim()}`
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Each step's failure ends the run as a failure naming the step, the terminal
// it drove kept in .dev/logs/ to see where it stopped; a session's failure
// comes with what its transcript misses.
export async function play({
  root,
  scenario,
  machine,
  account,
  out,
  timings = TIMINGS,
}: {
  root: string
  scenario: Scenario
  machine: Machine
  account: { email: string; password: string }
  out: (line: string) => void
  timings?: Timings
}): Promise<RunResult> {
  const sessionId = randomUUID()
  const keep = (terminal: Terminal) => {
    const screen = join(root, '.dev', 'logs', `e2e-${sessionId}.log`)
    mkdirSync(dirname(screen), { recursive: true })
    writeFileSync(screen, redactEventCodes(terminal.output()))
    out(`terminal: ${screen}`)
  }
  let login: Terminal | undefined
  try {
    if (!(await machine.signedIn())) {
      out('signing the polly MCP server in with the demo account')
      login = machine.login()
      await signIn(login, machine.browser, account, timings)
      // Signed in, it writes its credentials before it exits.
      await login.stop(timings.exit)
    }
  } catch (error) {
    if (login !== undefined) {
      keep(login)
      await login.stop(0)
    }
    return { failures: [`MCP sign-in: ${reason(error)}`], transcript: '(no transcript)' }
  }
  out(`session ${sessionId}: ${scenario.prompt}`)
  const session = machine.session(sessionId)
  // Claude Code writes the transcript once the session starts, and it stays where it is.
  let file: string | undefined
  const transcript = () => {
    file ??= machine.transcript(sessionId)
    return file
  }
  const read = () => {
    const found = transcript()
    return found === undefined ? '' : readFileSync(found, 'utf8')
  }
  const failures: string[] = []
  try {
    // The prompt is typed once the interface shows its footer, ready to take it.
    await until(
      () => session.output().includes('for shortcuts'),
      timings.prompt,
      timings.poll,
      'the Claude Code prompt',
    )
    await sleep(timings.settle)
    session.type(scenario.prompt)
    await sleep(timings.settle / 4)
    session.type('\r')
    await until(() => scenario.done(read()), timings.scenario, timings.poll, `the ${scenario.name} scenario`)
  } catch (error) {
    failures.push(`session: ${reason(error)}`)
  } finally {
    // The session never outlives the run, whatever stopped it.
    session.type('/exit\r')
    await session.stop(timings.exit)
  }
  failures.push(...scenario.failures(read()))
  if (failures.length > 0) {
    keep(session)
  }
  return { failures, transcript: transcript() ?? '(no transcript)' }
}
