import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../src/config/index.ts'
import { garageAdmin } from '../src/infra/garage.ts'
import type { BucketAccess } from '../src/ports/index.ts'
import { isolatedInfrastructure } from './support/isolated-infrastructure.ts'

let infra: Awaited<ReturnType<typeof isolatedInfrastructure>>

beforeAll(async () => {
  infra = await isolatedInfrastructure()
  await infra.ensureRunning()
}, 180_000)

afterAll(() => {
  infra.destroy()
})

function access(name: string): BucketAccess {
  return {
    bucket: `polly-${name}`,
    accessKeyId: `GK${name.padEnd(24, '0')}`,
    secretAccessKey: name.padEnd(64, 'f'),
  }
}

function client({ accessKeyId, secretAccessKey }: BucketAccess): S3Client {
  return new S3Client({
    endpoint: `http://127.0.0.1:${infra.garagePort}`,
    region: 'garage',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function garage(endpoint: string, payload: object): Promise<string> {
  return infra.exec('garage', ['/garage', 'json-api', endpoint, '-'], JSON.stringify(payload))
}

describe('Garage adapter', { timeout: 60_000 }, () => {
  const admin = () => garageAdmin(infra)

  it('C60: the key reads and writes objects, but cannot change the bucket settings', async () => {
    const a = access('a')
    await admin().ensure(a, 30)
    const s3 = client(a)
    await s3.send(new PutObjectCommand({ Bucket: a.bucket, Key: 'x.txt', Body: 'x' }))
    await s3.send(new DeleteObjectCommand({ Bucket: a.bucket, Key: 'x.txt' }))
    await expect(
      s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: a.bucket,
          LifecycleConfiguration: {
            Rules: [{ ID: 'x', Status: 'Disabled', Filter: {}, Expiration: { Days: 1 } }],
          },
        }),
      ),
    ).rejects.toMatchObject({ name: 'AccessDenied' })
    const info = JSON.parse(await garage('GetBucketInfo', { globalAlias: a.bucket })) as {
      lifecycleRules: { Expiration: { Days: number } }[]
    }
    expect(info.lifecycleRules.map(({ Expiration }) => Expiration.Days)).toEqual([30])
  })

  it('creating again changes nothing', async () => {
    const a = access('a')
    const before = JSON.parse(await garage('GetBucketInfo', { globalAlias: a.bucket })) as { id: string }
    await admin().ensure(a, 30)
    const after = JSON.parse(await garage('GetBucketInfo', { globalAlias: a.bucket })) as { id: string }
    expect(after.id).toBe(before.id)
  })

  it('C15: empties and deletes the bucket, deletes its keys; again changes nothing', async () => {
    const b = access('b')
    await admin().ensure(b, 30)
    await client(b).send(new PutObjectCommand({ Bucket: b.bucket, Key: 'left.txt', Body: 'left' }))
    await admin().release(b.bucket)
    await expect(garage('GetBucketInfo', { globalAlias: b.bucket })).rejects.toThrow(/NoSuchBucket/)
    await expect(garage('GetKeyInfo', { id: b.accessKeyId })).rejects.toThrow(/NoSuchAccessKey/)
    const keys = JSON.parse(await garage('ListKeys', {})) as { name: string }[]
    expect(keys.map(({ name }) => name).filter((name) => name.startsWith('polly-b'))).toEqual([])
    await expect(admin().release(b.bucket)).resolves.toBeUndefined()
  })

  it('C60: the bucket carries the expiration rule of the template, which its key cannot read', async () => {
    const template = parseEnv(readFileSync(join(import.meta.dirname, '..', 'env.template'), 'utf8'))
    expect(template.get('S3_EXPIRATION_DAYS')).toBe('30')
    // Reading the rule needs `owner`, which the worktree's key lacks.
    await expect(
      client(access('a')).send(new GetBucketLifecycleConfigurationCommand({ Bucket: access('a').bucket })),
    ).rejects.toMatchObject({ name: 'AccessDenied' })
    const info = JSON.parse(await garage('GetBucketInfo', { globalAlias: access('a').bucket })) as {
      lifecycleRules: { Expiration: { Days: number } }[]
    }
    expect(String(info.lifecycleRules[0]?.Expiration.Days)).toBe(template.get('S3_EXPIRATION_DAYS'))
  })

  // vendors/infra is private and not fetched in CI: this comparison runs
  // locally only.
  const specs = join(import.meta.dirname, '..', '..', 'vendors/infra/provision/src/specs.ts')
  it.skipIf(!existsSync(specs))(
    'the template holds the expiration declared for Polly on the platform',
    () => {
      const declared = /name: "polly",[\s\S]*?expirationDays: (\d+)/.exec(readFileSync(specs, 'utf8'))?.[1]
      const template = parseEnv(readFileSync(join(import.meta.dirname, '..', 'env.template'), 'utf8'))
      expect(template.get('S3_EXPIRATION_DAYS')).toBe(declared)
    },
  )
})
