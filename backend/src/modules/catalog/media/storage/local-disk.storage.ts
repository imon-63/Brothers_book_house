import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AppConfig } from '@/config/app-config.service';
import { StorageDriver } from './storage.driver';

/** Public URL prefix the files are served under (see MediaModule). */
export const UPLOADS_ROUTE = '/uploads';
export const UPLOADS_DIR = resolve(process.cwd(), 'uploads');

/** Dev/single-node driver: writes to ./uploads, served statically at /uploads. */
@Injectable()
export class LocalDiskStorage extends StorageDriver {
  readonly name = 'local';
  private readonly logger = new Logger(LocalDiskStorage.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async put(key: string, body: Buffer, _contentType: string) {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' }); // never overwrite an existing object
    return { url: `${this.config.get('PUBLIC_API_URL').replace(/\/+$/, '')}${UPLOADS_ROUTE}/${key}` };
  }

  async delete(key: string) {
    try {
      await rm(this.pathOf(key), { force: true });
    } catch (err) {
      this.logger.warn({ err, key }, 'could not delete upload');
    }
  }

  /** Resolve inside UPLOADS_DIR only (defence in depth — keys are generated server-side). */
  private pathOf(key: string) {
    const path = resolve(UPLOADS_DIR, key);
    if (!path.startsWith(UPLOADS_DIR + sep)) throw new Error(`invalid storage key: ${key}`);
    return path;
  }
}
