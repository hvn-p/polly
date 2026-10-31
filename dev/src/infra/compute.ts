// The machine's compute services: one container per fingerprint of
// services/compute, its image built from the sources of the first worktree
// that needs it. Each worktree using one is recorded in the project's
// machine directory, and the container stops once none remains.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Refusal } from '@polly/platform'
import { lock } from '../machine/index.ts'
import type { ComputeServices } from '../ports/index.ts'
import { run } from './compose.ts'

const SOURCES = 'services/compute'
const READY_TIMEOUT_MS = 30_000

export interface ComputeSettings {
  // The compose project the services belong to: polly-dev, or a test's own.
  project: string
  machineDirectory: string
}

export function computeServices(settings: ComputeSettings): ComputeServices {
  const prefix = `${settings.project}-compute-`
  const label = `polly.compute.project=${settings.project}`
  const image = (fingerprint: string) => `${settings.project}-compute:${fingerprint}`
  const users = (fingerprint: string) => join(settings.machineDirectory, 'compute-users', fingerprint)
  const docker = (...args: string[]) => run('docker', args)
  const urlOf = async (fingerprint: string) => {
    const published = await docker('port', `${prefix}${fingerprint}`, '8000/tcp').catch(() => '')
    const address = published.trim().split('\n')[0]
    return address === undefined || address === '' ? undefined : `http://${address}`
  }
  const start = async (fingerprint: string, sources: string | undefined) => {
    const present = await docker('image', 'inspect', image(fingerprint)).then(
      () => true,
      () => false,
    )
    if (!present) {
      if (sources === undefined) {
        throw new Refusal(
          'UNKNOWN_COMPUTE_VERSION',
          `this machine has no compute service ${fingerprint}; start it from a worktree whose ${SOURCES} has that fingerprint`,
        )
      }
      await docker('build', '--quiet', '--tag', image(fingerprint), join(sources, SOURCES))
    }
    await docker(
      'run',
      '--detach',
      '--rm',
      '--name',
      `${prefix}${fingerprint}`,
      '--label',
      label,
      '--env',
      `POLLY_COMPUTE_FINGERPRINT=${fingerprint}`,
      '--publish',
      '127.0.0.1::8000',
      image(fingerprint),
    )
    const url = await urlOf(fingerprint)
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (
      !(await fetch(`${url}/version`).then(
        (r) => r.ok,
        () => false,
      ))
    ) {
      if (Date.now() > deadline) {
        throw new Error(`the compute service ${fingerprint} did not answer at ${url}`)
      }
      await sleep(200)
    }
    return String(url)
  }
  // One change to the services at a time on the machine.
  const exclusive = async <T>(change: () => Promise<T>): Promise<T> => {
    mkdirSync(settings.machineDirectory, { recursive: true })
    const held = await lock(join(settings.machineDirectory, 'compute.lock'))
    try {
      return await change()
    } finally {
      await held.release()
    }
  }
  return {
    fingerprintOf: async (root) => {
      const listed = await run('git', [
        '-C',
        root,
        'ls-files',
        '-co',
        '--exclude-standard',
        '-z',
        '--',
        SOURCES,
      ])
      const hash = createHash('sha256')
      for (const path of listed
        .split('\0')
        .filter((file) => file !== '' && existsSync(join(root, file)))
        .sort()) {
        hash
          .update(`${path}\0`)
          .update(readFileSync(join(root, path)))
          .update('\0')
      }
      return hash.digest('hex').slice(0, 12)
    },
    use: (fingerprint, identity, sources) =>
      exclusive(async () => {
        const running = await urlOf(fingerprint)
        const url = running ?? (await start(fingerprint, sources))
        mkdirSync(users(fingerprint), { recursive: true })
        writeFileSync(join(users(fingerprint), identity), '')
        const names = await docker('ps', '--filter', `label=${label}`, '--format', '{{.Names}}')
        const others = names
          .split('\n')
          .filter((name) => name.startsWith(prefix) && name !== `${prefix}${fingerprint}`)
          .map((name) => name.slice(prefix.length))
        return { url, started: running === undefined, others }
      }),
    release: (fingerprint, identity) =>
      exclusive(async () => {
        rmSync(join(users(fingerprint), identity), { force: true })
        if (!existsSync(users(fingerprint)) || readdirSync(users(fingerprint)).length === 0) {
          await docker('rm', '--force', `${prefix}${fingerprint}`).catch(() => undefined)
        }
      }),
  }
}
