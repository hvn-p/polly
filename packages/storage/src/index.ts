// The storage capacity: the S3 client a process builds from its
// configuration, path-style, as Garage serves buckets.

import { S3Client } from '@aws-sdk/client-s3'
import type { Config } from '@polly/platform'

export function createS3Client(config: Config): S3Client {
  return new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  })
}
