import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env';

/** Typed facade over @nestjs/config — inject this, never read process.env. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  get isTest() {
    return this.get('NODE_ENV') === 'test';
  }
}
