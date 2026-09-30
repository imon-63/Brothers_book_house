import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './utils/create-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health/live → 200 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok', uptime: expect.any(Number) });
  });

  it('GET /api/v1/health/ready → database is up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
    expect(res.body.info.heap.status).toBe('up');
  });

  it('unknown route → 404 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/definitely-not-here').expect(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 404, code: 'http.404', instance: '/api/v1/definitely-not-here' });
  });
});
