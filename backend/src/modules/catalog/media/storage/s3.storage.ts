import { Injectable, NotImplementedException } from '@nestjs/common';
import { StorageDriver } from './storage.driver';

/**
 * S3 / Cloudflare R2 / MinIO driver — not wired yet.
 *
 * TODO(storage): add `@aws-sdk/client-s3`, env vars (S3_BUCKET, S3_REGION,
 * S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL) to
 * src/config/env.ts, then implement:
 *   put    → PutObjectCommand({ Bucket, Key, Body, ContentType, CacheControl: 'public, max-age=31536000, immutable' })
 *   delete → DeleteObjectCommand({ Bucket, Key })
 * and bind it in MediaModule (`{ provide: StorageDriver, useClass: S3Storage }`) when STORAGE_DRIVER=s3.
 */
@Injectable()
export class S3Storage extends StorageDriver {
  readonly name = 's3';

  put(_key: string, _body: Buffer, _contentType: string): Promise<{ url: string }> {
    throw new NotImplementedException('S3 storage driver is not configured');
  }

  delete(_key: string): Promise<void> {
    throw new NotImplementedException('S3 storage driver is not configured');
  }
}
