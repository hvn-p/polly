import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createConnection, createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { up } from '../src/commands/up.ts'
import { url } from '../src/commands/url.ts'
import { parseEnv } from '../src/config/index.ts'
import { listeningPorts } from '../src/infra/listening.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { git, temporaryRepository } from './support/repository.ts'

function output() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

function env(root: string): Map<string, string> {
  return parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
}

// Another process's listener on a port, as the machine shows it to dev:up.
function holdPort(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.end())
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

describe('dev:up with faked infrastructure', () => {
  it('creates what is missing in order, then prints the URL', async () => {
    const root = temporaryRepository('feature/probe')
    const infra = fakeInfrastructure()
    const out = output()
    await up({ root, ...loaded(infra), out: out.write, warn: out.write })
    const id = env(root).get('POLLY_WORKTREE_ID') ?? ''
    const role = `polly_${id.replaceAll('-', '_')}`
    expect(infra.calls).toEqual([
      'infrastructure.load',
      'shared.ensureRunning',
      `postgres.ensure ${role}`,
      `garage.ensure polly-${id}`,
      `application.migrate ${role}`,
      'application.seed local',
      `routes.add ${id}.polly ${env(root).get('POLLY_WEB_PORT')}`,
      `routes.add arch.${id}.polly ${env(root).get('POLLY_ARCH_PORT')}`,
      'supervisor.start',
    ])
    expect(out.lines).toContain(`architecture view: https://arch.${id}.polly.localhost`)
    expect(out.lines.at(-1)).toBe(`https://${id}.polly.localhost`)
    expect(JSON.parse(readFileSync(join(root, '.dev/state.json'), 'utf8'))).toMatchObject({
      supervisor: { pid: expect.any(Number) },
      route: `${id}.polly`,
      architectureRoute: `arch.${id}.polly`,
      role,
      garageKeyId: env(root).get('S3_ACCESS_KEY_ID'),
    })
  })

  it('says the architecture view needs a local analyzer build when none is installed, instead of its URL', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    infra.application.architecture = () => 'missing'
    const warnings: string[] = []
    await up({ root, ...loaded(infra), out: output().write, warn: (line) => warnings.push(line) })
    expect(warnings).toEqual([
      expect.stringMatching(/^ARCHITECTURE_VIEW_UNAVAILABLE: .*cargo build --release/),
    ])
  })

  it('C2: on a running worktree, recreates nothing it already has', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    const before = readFileSync(join(root, '.env.local'), 'utf8')
    infra.calls.length = 0
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    expect(infra.calls).not.toContain('supervisor.start')
    expect(infra.calls.filter((call) => call.startsWith('routes.add'))).toEqual([])
    expect(readFileSync(join(root, '.env.local'), 'utf8')).toBe(before)
  })

  it('restarts a running supervisor whose process set changed, as when .env.local gains a port', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    infra.application.processes = (values) => [
      {
        name: 'architecture',
        command: 'analyzer',
        args: ['--port', String(values['POLLY_ARCH_PORT'])],
        cwd: root,
      },
    ]
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    const envFile = join(root, '.env.local')
    writeFileSync(envFile, readFileSync(envFile, 'utf8').replace(/^POLLY_ARCH_PORT=.*\n/m, ''))
    infra.routeTable.clear()
    infra.calls.length = 0
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    expect(infra.calls.filter((call) => call.startsWith('supervisor.'))).toEqual([
      expect.stringMatching(/^supervisor\.stop /),
      'supervisor.start',
    ])
    infra.calls.length = 0
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    expect(infra.calls.filter((call) => call.startsWith('supervisor.'))).toEqual([])
  })

  it('C3: restarts a dead supervisor, stopping the group it left behind before checking the ports it holds', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    infra.runningSupervisors.clear()
    const port = Number(env(root).get('POLLY_API_PORT'))
    infra.heldPorts.add(port)
    const stop = infra.supervisor.stop
    infra.supervisor.stop = async (state) => {
      await stop(state)
      infra.heldPorts.delete(port)
    }
    infra.calls.length = 0
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    expect(infra.calls.filter((call) => call.startsWith('supervisor.'))).toEqual([
      expect.stringMatching(/^supervisor\.stop /),
      'supervisor.start',
    ])
  })

  it('C9: refuses a port held by another process, naming the port, and leaves it alone', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    infra.runningSupervisors.clear()
    infra.ports = listeningPorts()
    const port = Number(env(root).get('POLLY_API_PORT'))
    const holder = await holdPort(port)
    infra.calls.length = 0
    await expect(
      up({ root, ...loaded(infra), out: output().write, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: expect.stringMatching(
        new RegExp(`^port ${port} \\(POLLY_API_PORT\\) is held by another process`),
      ),
    })
    expect(infra.calls).not.toContain('supervisor.start')
    expect(await accepts(port)).toBe(true)
    holder.close()
  })

  it('C9: refuses a host name already routed to another port, and leaves the route alone', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    const id = env(root).get('POLLY_WORKTREE_ID')
    infra.routeTable.set(`${id}.polly`, 1)
    infra.calls.length = 0
    await expect(
      up({ root, ...loaded(infra), out: output().write, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: expect.stringContaining(`${id}.polly.localhost is routed to port 1`),
    })
    expect(infra.routeTable.get(`${id}.polly`)).toBe(1)
  })

  it('C9: refuses an architecture view host routed to another port, and leaves the route alone', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    const id = env(root).get('POLLY_WORKTREE_ID')
    infra.routeTable.set(`arch.${id}.polly`, 1)
    await expect(
      up({ root, ...loaded(infra), out: output().write, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: expect.stringContaining(`arch.${id}.polly.localhost is routed to port 1`),
    })
    expect(infra.routeTable.get(`arch.${id}.polly`)).toBe(1)
  })

  it('C9: refuses the port of the architecture view held by another process', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
    infra.runningSupervisors.clear()
    infra.ports = listeningPorts()
    const port = Number(env(root).get('POLLY_ARCH_PORT'))
    const holder = await holdPort(port)
    await expect(
      up({ root, ...loaded(infra), out: output().write, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_CONFLICT',
      message: expect.stringMatching(new RegExp(`^port ${port} \\(POLLY_ARCH_PORT\\)`)),
    })
    expect(await accepts(port)).toBe(true)
    holder.close()
  })

  describe('C58: vendors/infra not initialised', () => {
    const saved = { ...process.env }
    beforeEach(() => {
      // Tests use a local repository as the submodule's remote.
      Object.assign(process.env, {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'protocol.file.allow',
        GIT_CONFIG_VALUE_0: 'always',
      })
    })
    afterEach(() => {
      process.env = saved
    })

    it('initialises the submodule, then goes on', async () => {
      const remote = mkdtempSync(join(tmpdir(), 'infra-remote-'))
      git(remote, 'init', '--quiet', '--bare', '--initial-branch', 'main')
      const seed = temporaryRepository('main')
      execFileSync('sh', ['-c', 'echo infra > CLAUDE.md && git add CLAUDE.md'], { cwd: seed })
      git(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'infra')
      git(seed, 'push', '--quiet', remote, 'main')
      const root = temporaryRepository()
      git(root, 'submodule', '--quiet', 'add', remote, 'vendors/infra')
      git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'submodule')
      git(root, 'submodule', '--quiet', 'deinit', '--force', 'vendors/infra')
      expect(existsSync(join(root, 'vendors/infra/CLAUDE.md'))).toBe(false)
      const infra = fakeInfrastructure()
      await up({ root, ...loaded(infra), out: output().write, warn: () => undefined })
      expect(readFileSync(join(root, 'vendors/infra/CLAUDE.md'), 'utf8')).toBe('infra\n')
      expect(infra.calls).toContain('supervisor.start')
    })
  })
})

describe('dev:url', () => {
  it('prints the URL from .env.local', async () => {
    const root = temporaryRepository()
    await up({ root, ...loaded(fakeInfrastructure()), out: output().write, warn: () => undefined })
    const out = output()
    url({ root, out: out.write })
    expect(out.lines).toEqual([env(root).get('PUBLIC_URL')])
  })

  it('refuses a worktree with no configuration', () => {
    expect(() => url({ root: temporaryRepository(), out: output().write })).toThrow(
      expect.objectContaining({ code: 'WORKTREE_NOT_CONFIGURED' }),
    )
  })
})
