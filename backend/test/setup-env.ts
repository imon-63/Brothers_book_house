/**
 * e2e environment. Runs before any module is loaded.
 *  • NODE_ENV=test → OpenTelemetry SDK stays off, no OWNER bootstrap, JSON logs.
 *  • DATABASE_URL must point at a migrated + seeded database
 *    (CI: postgres service container; locally: your dev DB from backend/.env).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load backend/.env for local runs without overriding what CI already exported.
const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

process.env.NODE_ENV = 'test';
process.env.OTEL_ENABLED = 'false';
process.env.LOG_LEVEL = process.env.E2E_LOG_LEVEL ?? 'warn';
process.env.JWT_ACCESS_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for e2e tests (migrated + seeded database)');
}
