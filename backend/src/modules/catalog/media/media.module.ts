import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import express from 'express';
import { MediaService } from './application/media.service';
import { MediaAdminController } from './controllers/media.admin.controller';
import { LocalDiskStorage, UPLOADS_DIR, UPLOADS_ROUTE } from './storage/local-disk.storage';
import { StorageDriver } from './storage/storage.driver';

/**
 * Uploads. The StorageDriver binding is the only place that decides where
 * bytes go; swap LocalDiskStorage for S3Storage in production.
 */
@Module({
  controllers: [MediaAdminController],
  providers: [MediaService, LocalDiskStorage, { provide: StorageDriver, useExisting: LocalDiskStorage }],
  exports: [MediaService],
})
export class MediaModule implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly storage: StorageDriver,
  ) {}

  /**
   * Serve ./uploads at /uploads (outside the /api prefix) for the local driver.
   * Runs before Nest registers its 404 handler, so the route is reachable.
   */
  onModuleInit() {
    const app = this.adapterHost?.httpAdapter?.getInstance?.() as express.Express | undefined;
    if (!app || this.storage.name !== 'local' || typeof app.use !== 'function') return;
    app.use(
      UPLOADS_ROUTE,
      express.static(UPLOADS_DIR, {
        index: false,
        dotfiles: 'deny',
        fallthrough: false,
        immutable: true,
        maxAge: '365d',
        setHeaders: (res) => {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // storefront on another origin
        },
      }),
    );
  }
}
