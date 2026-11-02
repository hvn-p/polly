// The processes an end-to-end run drives: Claude Code itself, interactive, in
// a pseudo-terminal given by `script` (plugin monitors do not start headless),
// and agent-browser. Run on demand, never in CI.

import { execFile, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { DEMO_ACCOUNT } from '@polly/back'
import { AGENT_BROWSER } from '../machine/index.ts'
import { checked } from './command.ts'
import { type Machine, play, type RunResult, type Terminal } from './run.ts'
import type { Scenario } from './scenario.ts'
import { drivenSession } from './session.ts'
import { plain, shellQuoted } from './terminal.ts'

const ALLOWED_TOOLS = ['Skill', 'mcp__plugin_polly_polly__whoami', 'mcp__plugin_polly_polly__start_lesson']

function capture(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { env, encoding: 'utf8' }, (_error, stdout, stderr) =>
      resolve(`${stdout}${stderr}`),
    )
  })
}

// A command run in a pseudo-terminal, with its output accumulated.
function inTerminal(command: string[], env: NodeJS.ProcessEnv, cwd: string): Terminal {
  const child = spawn('script', ['-qfec', command.map(shellQuoted).join(' '), '/dev/null'], {
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
  return {
    output: () => plain(output),
    type: (text) => child.stdin.write(text),
    stop: async (grace) => {
      await Promise.race([exited, sleep(grace)])
      child.kill()
      await exited
    },
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

function machineOf(root: string, env: Record<string, string>): Machine {
  const browser = [
    '--session',
    `polly-e2e-${env['POLLY_WORKTREE_ID']}`,
    '--ca-cert',
    join(homedir(), '.portless', 'ca.pem'),
  ]
  return {
    signedIn: async () => {
      const list = drivenSession(root, ['mcp', 'list'])
      return /plugin:polly:polly: .*Connected/.test(await capture(list.command, list.args, list.env))
    },
    login: () => {
      const login = drivenSession(root, ['mcp', 'login', 'plugin:polly:polly', '--no-browser'])
      return inTerminal([login.command, ...login.args], login.env, root)
    },
    browser: (...args) => checked(AGENT_BROWSER, [...browser, ...args], `agent-browser ${args[0]}`),
    session: (sessionId) => {
      const driven = drivenSession(root, [
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
      ])
      return inTerminal([driven.command, ...driven.args], driven.env, root)
    },
    transcript: transcriptOf,
  }
}

export function runScenario({
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
  return play({ root, scenario, machine: machineOf(root, env), account: DEMO_ACCOUNT, out })
}
