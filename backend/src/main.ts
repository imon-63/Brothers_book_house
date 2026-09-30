// OpenTelemetry must patch http/express/pg before anything else loads.
import { shutdownTelemetry } from './instrumentation';

import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);
  const prefix = config.get('API_PREFIX');

  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1); // behind nginx / load balancer → real client IP for throttling & audit
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id'],
  });

  app.setGlobalPrefix(prefix, { exclude: ['metrics'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (!config.isProduction || config.get('SWAGGER_ENABLED')) {
    const doc = new DocumentBuilder()
      .setTitle('Cholo API · চলো')
      .setDescription('Commerce API for the Cholo storefront and admin studio')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, doc), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();
  process.once('beforeExit', () => void shutdownTelemetry());

  await app.listen(config.get('PORT'), '0.0.0.0');
  app.get(Logger).log(`Cholo API listening on :${config.get('PORT')}/${prefix}/v1`, 'Bootstrap');
}

void bootstrap();
