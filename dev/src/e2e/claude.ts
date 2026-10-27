// The driver of an end-to-end run: Claude Code itself, interactive, in a
// pseudo-terminal given by `script` (plugin monitors do not start headless).
// It signs the polly MCP server in through the real OAuth flow, with
// agent-browser playing the demo learner, then plays a scenario and reads the
// session transcript. Run on demand, never in CI.

import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Scenario } from './scenario.ts'

const pluginDirectory = join(import.meta.dirname, '..', '..', '..', 'plugin')
const DEMO = { email: 'demo@polly.localhost', password: 'polly-demo-learner' }
const ALLOWED_TOOLS = ['Skill', 'mcp__plugin_polly_polly__whoami', 'mcp__plugin_polly_polly__start_lesson']
const SCENARIO_TIMEOUT_MS = 240_000

export interface ClientStatus {
  installed: boolean
  signedIn: boolean
}

export interface RunResult {
  failures: string[]
  transcript: string
}

function capture(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { env, encoding: 'utf8' }, (_error, stdout, stderr) =>
      resolve(`${stdout}${stderr}`),
    )
  })
}

// Strips terminal escapes from what a pseudo-terminal printed.
function plain(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escapes are control characters.
  return text.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

function quote(argument: string): string {
  return `'${argument.replaceAll("'", "'\\''")}'`
}

// A command run in a pseudo-terminal, with its output accumulated.
function inTerminal(command: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const child = spawn('script', ['-qfec', command.map(quote).join(' '), '/dev/null'], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited, output: () => plain(output), type: (text: string) => child.stdin.write(text) }
}

async function until(condition: () => boolean, timeout: number, what: string): Promise<void> {
  const deadline = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await sleep(500)
  }
}

export async function probeClaude(): Promise<ClientStatus> {
  const status = await capture('claude', ['auth', 'status'], process.env)
  if (status.includes('ENOENT') || status.trim() === '') {
    return { installed: false, signedIn: false }
  }
  return { installed: true, signedIn: /"loggedIn":\s*true/.test(status) }
}

// The worktree's URLs, without the markers of a Claude Code session this run
// was started from: inherited, they make the driven session a child that
// keeps no transcript.
function sessionEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const inherited = Object.entries(process.env).filter(
    ([key]) => !(key === 'CLAUDECODE' || key === 'CLAUDE_PID' || /^CLAUDE_CODE_(?!ENABLE_)/.test(key)),
  )
  return {
    ...Object.fromEntries(inherited),
    POLLY_MCP_URL: env['POLLY_MCP_URL'],
    POLLY_EVENTS_URL: env['POLLY_EVENTS_URL'],
  }
}

// Signs the polly MCP server in, unless it already is: Claude Code prints the
// authorization URL, agent-browser signs the demo learner in and consents.
async function signIn(root: string, env: Record<string, string>, out: (line: string) => void): Promise<void> {
  const claudeEnv = sessionEnv(env)
  const servers = await capture('claude', ['--plugin-dir', pluginDirectory, 'mcp', 'list'], claudeEnv)
  if (/plugin:polly:polly: .*Connected/.test(servers)) {
    return
  }
  out('signing the polly MCP server in with the demo account')
  const login = inTerminal(
    ['claude', '--plugin-dir', pluginDirectory, 'mcp', 'login', 'plugin:polly:polly', '--no-browser'],
    claudeEnv,
    root,
  )
  try {
    await until(
      () => /https:\/\/\S+oauth2\/authorize\S+/.test(login.output()),
      30_000,
      'the authorization URL',
    )
    const url = /https:\/\/\S+oauth2\/authorize\S+/.exec(login.output())?.[0] ?? ''
    const browser = [
      '--session',
      `polly-e2e-${env['POLLY_WORKTREE_ID']}`,
      '--ca-cert',
      join(homedir(), '.portless', 'ca.pem'),
    ]
    const run = (...args: string[]) => capture('agent-browser', [...browser, ...args], process.env)
    await run('open', url)
    await run('wait', 'input[name=email]')
    await run('fill', 'input[name=email]', DEMO.email)
    await run('fill', 'input[name=password]', DEMO.password)
    await run('click', 'button[type=submit]')
    await run('wait', 'button')
    await run('find', 'role', 'button', 'click', '--name', 'Allow')
    await until(() => login.output().includes('Authenticated'), 30_000, 'the MCP sign-in')
    await run('close')
  } finally {
    login.child.kill()
    await login.exited
  }
}

function transcriptOf(sessionId: string): string | undefined {
  const projects = join(homedir(), '.claude', 'projects')
  for (const project of existsSync(projects) ? readdirSync(projects) : []) {
    const file = join(projects, project, `${sessionId}.jsonl`)
    if (existsSync(file)) {
      return file
    }
  }
  return undefined
}

export async function runScenario({
  root,
  env,
  scenario,
  out,
}: {
  root: string
  env: Record<string, string>
  scenario: Scenario
  out: (line: string) => void
}): Promise<RunResult> {
  await signIn(root, env, out)
  const sessionId = randomUUID()
  out(`session ${sessionId}: ${scenario.prompt}`)
  const session = inTerminal(
    [
      'claude',
      '--plugin-dir',
      pluginDirectory,
      '--session-id',
      sessionId,
      '--allowedTools',
      ALLOWED_TOOLS.join(','),
      // Fixed for every run: no permission mode or hook of the person's own
      // settings changes what the session does.
      '--permission-mode',
      'default',
      '--setting-sources',
      'project,local',
    ],
    sessionEnv(env),
    root,
  )
  const read = () => {
    const file = transcriptOf(sessionId)
    return file === undefined ? '' : readFileSync(file, 'utf8')
  }
  try {
    // The prompt is typed once the interface shows its footer, ready to take it.
    await until(() => session.output().includes('for shortcuts'), 60_000, 'the Claude Code prompt')
    await sleep(2000)
    session.type(scenario.prompt)
    await sleep(500)
    session.type('\r')
    await until(() => scenario.done(read()), SCENARIO_TIMEOUT_MS, `the ${scenario.name} scenario`)
  } catch {
    // Reported below, with what the transcript misses.
  } finally {
    // The session never outlives the run, whatever stopped it.
    session.type('/exit\r')
    await Promise.race([session.exited, sleep(5000)])
    session.child.kill()
    await session.exited
  }
  const failures = scenario.failures(read())
  if (failures.length > 0) {
    // What the terminal showed, to see where the session stopped.
    const screen = join(root, '.dev', 'logs', `e2e-${sessionId}.log`)
    mkdirSync(dirname(screen), { recursive: true })
    writeFileSync(screen, session.output())
    out(`terminal: ${screen}`)
  }
  return { failures, transcript: transcriptOf(sessionId) ?? '(no transcript)' }
}
