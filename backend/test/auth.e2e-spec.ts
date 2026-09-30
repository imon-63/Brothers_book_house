import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN, CUSTOMER, createApp } from './utils/create-app';

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number; tokenType: 'Bearer' };

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  const login = async (body: { identifier: string; password: string }) => {
    const res = await http().post('/api/v1/auth/login').send(body).expect(200);
    return res;
  };

  describe('login', () => {
    it('seeded OWNER can log in with email and gets a token pair + httpOnly refresh cookie', async () => {
      const res = await login(ADMIN);
      const t = res.body as Tokens;
      expect(t.tokenType).toBe('Bearer');
      expect(t.accessToken.split('.')).toHaveLength(3);
      expect(t.refreshToken.length).toBeGreaterThan(40);
      expect(t.expiresIn).toBeGreaterThan(0);
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('cholo_rt='));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('seeded customer can log in with a BD phone number', async () => {
      const { body } = await login(CUSTOMER);
      const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
      expect(me.body).toMatchObject({ role: 'CUSTOMER', phone: '+8801711111111' });
      expect(me.body.customer).toEqual(expect.objectContaining({ id: expect.any(String) }));
    });

    it('unknown account → 401 with the generic credentials error', async () => {
      const res = await http().post('/api/v1/auth/login').send({ identifier: 'nobody@example.com', password: 'whatever1' }).expect(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({ status: 401, code: 'auth.invalid_credentials' });
      expect(typeof res.body.detail).toBe('string');
    });
  });

  describe('me', () => {
    it('401 problem+json without a token', async () => {
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({ status: 401, instance: '/api/v1/auth/me' });
      expect(res.body.code).toEqual(expect.any(String));
    });

    it('401 with a forged token', async () => {
      await http().get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });

    it('returns the OWNER profile with a valid access token', async () => {
      const { body } = await login(ADMIN);
      const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
      expect(me.body).toMatchObject({ email: 'admin@cholo.shop', role: 'OWNER', status: 'ACTIVE' });
      expect(me.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('refresh rotation', () => {
    it('rotates the refresh token and rejects reuse of the old one', async () => {
      const first = (await login(ADMIN)).body as Tokens;

      const rotated = await http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      const second = rotated.body as Tokens;
      expect(second.refreshToken).not.toBe(first.refreshToken);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${second.accessToken}`).expect(200);

      // replaying the rotated-out token is treated as theft → 401 and every session revoked
      const reuse = await http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      expect(reuse.body.code).toBe('auth.refresh_reused');
      await http().post('/api/v1/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
    });

    it('401 when no refresh token is supplied', async () => {
      const res = await http().post('/api/v1/auth/refresh').send({}).expect(401);
      expect(res.body.code).toBe('auth.refresh_missing');
    });
  });

  describe('validation errors', () => {
    it('400 validation.failed with field messages (problem+json)', async () => {
      const res = await http().post('/api/v1/auth/login').send({ identifier: 'admin@cholo.shop' }).expect(400);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body).toMatchObject({ type: 'about:blank', title: 'BAD_REQUEST', status: 400, code: 'validation.failed', instance: '/api/v1/auth/login' });
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.join(' ')).toMatch(/password/);
    });

    it('rejects properties that are not in the DTO (forbidNonWhitelisted)', async () => {
      const res = await http().post('/api/v1/auth/login').send({ ...ADMIN, role: 'OWNER' }).expect(400);
      expect(res.body.code).toBe('validation.failed');
      expect(res.body.errors.join(' ')).toMatch(/role/);
    });
  });
});
