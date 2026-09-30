import { ClassSerializerInterceptor, ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';

/** Seeded by prisma/seed (non-production). */
export const ADMIN = { identifier: 'admin@cholo.shop', password: 'admin123' };
export const CUSTOMER = { identifier: '01711111111', password: '123456' };

/**
 * Boots the real AppModule the way main.ts does (prefix, URI versioning,
 * validation, serializer) minus the process-level bits (listen, swagger, helmet).
 */
export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['metrics'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  await app.init();
  return app;
}
