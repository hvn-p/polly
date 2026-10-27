// A worktree's bucket and key in the shared Garage, set up as the platform's
// provisioner sets up an application (vendors/infra): an expiration rule, and
// a key that reads and writes but is not `owner`, so it cannot lift the rule.
// Administration goes through `garage json-api` inside the container; the
// key's secret only travels on stdin.

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3'
import { releaseKeyOf } from '../identity/index.ts'
import type { ComposeInfrastructure } from './compose.ts'
import type { BucketAccess, GarageAdmin } from './ports.ts'

interface BucketInfo {
  id: string
  lifecycleRules?: unknown[]
  keys: { accessKeyId: string; permissions: { read: boolean; write: boolean; owner: boolean } }[]
}

function lifecycle(expirationDays: number) {
  return [
    {
      ID: 'expire',
      Status: 'Enabled',
      Expiration: { Days: expirationDays },
      // Abandoned multipart uploads would otherwise stay forever.
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
  ]
}

export function garageAdmin(compose: Pick<ComposeInfrastructure, 'exec' | 'garagePort'>): GarageAdmin {
  const api = async <T>(endpoint: string, payload: object): Promise<T> =>
    JSON.parse(
      await compose.exec('garage', ['/garage', 'json-api', endpoint, '-'], JSON.stringify(payload)),
    ) as T
  // undefined when the object does not exist.
  const find = async <T>(endpoint: string, payload: object): Promise<T | undefined> => {
    try {
      return await api<T>(endpoint, payload)
    } catch (error) {
      if (error instanceof Error && /NoSuch(Bucket|AccessKey)/.test(error.message)) {
        return undefined
      }
      throw error
    }
  }

  const ensureKey = async ({ bucket, accessKeyId, secretAccessKey }: BucketAccess) => {
    if ((await find('GetKeyInfo', { id: accessKeyId })) === undefined) {
      await api('ImportKey', { name: bucket, accessKeyId, secretAccessKey })
    }
  }

  const empty = async (
    bucket: string,
    { accessKeyId, secretAccessKey }: { accessKeyId: string; secretAccessKey: string },
  ) => {
    const s3 = new S3Client({
      endpoint: `http://127.0.0.1:${compose.garagePort}`,
      region: 'garage',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    })
    let page: ListObjectsV2CommandOutput
    do {
      page = await s3.send(new ListObjectsV2Command({ Bucket: bucket }))
      const objects = (page.Contents ?? []).flatMap(({ Key }) => (Key === undefined ? [] : [{ Key }]))
      if (objects.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }))
      }
    } while (page.IsTruncated === true)
    s3.destroy()
  }

  return {
    ensure: async (access, expirationDays) => {
      const bucket =
        (await find<BucketInfo>('GetBucketInfo', { globalAlias: access.bucket })) ??
        (await api<BucketInfo>('CreateBucket', { globalAlias: access.bucket }))
      const rules = lifecycle(expirationDays)
      if (JSON.stringify(bucket.lifecycleRules ?? []) !== JSON.stringify(rules)) {
        await api('UpdateBucket', { id: bucket.id, body: { lifecycleRules: rules } })
      }
      await ensureKey(access)
      const permissions = bucket.keys.find(
        ({ accessKeyId }) => accessKeyId === access.accessKeyId,
      )?.permissions
      if (permissions?.read !== true || permissions.write !== true) {
        await api('AllowBucketKey', {
          bucketId: bucket.id,
          accessKeyId: access.accessKeyId,
          permissions: { read: true, write: true, owner: false },
        })
      }
      if (permissions?.owner === true) {
        await api('DenyBucketKey', {
          bucketId: bucket.id,
          accessKeyId: access.accessKeyId,
          permissions: { read: false, write: false, owner: true },
        })
      }
    },
    release: async (bucketName) => {
      const bucket = await find<BucketInfo>('GetBucketInfo', { globalAlias: bucketName })
      if (bucket !== undefined) {
        // A bucket must be empty to be deleted: a key of the release's own
        // empties it, since the worktree's may already be gone.
        const releaseKey = await api<{ accessKeyId: string; secretAccessKey: string }>('CreateKey', {
          name: releaseKeyOf(bucketName),
        })
        await api('AllowBucketKey', {
          bucketId: bucket.id,
          accessKeyId: releaseKey.accessKeyId,
          permissions: { read: true, write: true, owner: false },
        })
        await empty(bucketName, releaseKey)
        await api('CleanupIncompleteUploads', { bucketId: bucket.id, olderThanSecs: 0 })
        await api('DeleteBucket', { id: bucket.id })
      }
      const keys = await api<{ id: string; name: string }[]>('ListKeys', {})
      for (const key of keys.filter(({ name }) => name === bucketName || name === releaseKeyOf(bucketName))) {
        await api('DeleteKey', { id: key.id })
      }
    },
  }
}
