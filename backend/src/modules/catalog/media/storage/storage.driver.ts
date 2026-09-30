/**
 * Where uploaded files live. Rows (MediaAsset) only keep the key + public URL,
 * never the bytes, so switching driver (local disk → S3/R2/MinIO) is a
 * provider swap in MediaModule.
 */
export abstract class StorageDriver {
  /** Human name for logs/health ("local", "s3"). */
  abstract readonly name: string;
  /** Store `body` under `key` and return the URL clients should load it from. */
  abstract put(key: string, body: Buffer, contentType: string): Promise<{ url: string }>;
  /** Remove an object; missing objects are not an error. */
  abstract delete(key: string): Promise<void>;
}
