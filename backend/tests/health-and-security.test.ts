import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import { decryptSecret, encryptSecret } from '../src/shared/security.util';

describe('EASEContent API Health, Readiness & Security', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_key_for_easecontent_at_least_32_chars';
  });

  it('returns 200 on /health and /api/health with EASEContent metadata and security headers', async () => {
    const app = createApp({
      checkDatabase: async () => true,
      checkQueue: async () => ({ mode: 'in-process', healthy: true }),
      checkFfmpeg: async () => true,
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('easecontent-api');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-request-id']).toBeTruthy();

    const apiRes = await request(app).get('/api/health');
    expect(apiRes.status).toBe(200);
    expect(apiRes.body.status).toBe('ok');
  });

  it('returns 200 on /ready when database and queue are healthy', async () => {
    const app = createApp({
      checkDatabase: async () => true,
      checkQueue: async () => ({ mode: 'redis-bullmq', healthy: true }),
      checkFfmpeg: async () => true,
    });

    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database).toBe('up');
    expect(res.body.checks.queue.mode).toBe('redis-bullmq');
    expect(res.body.checks.ffmpeg).toBe('available');
  });

  it('returns 503 on /ready when database is unavailable', async () => {
    const app = createApp({
      checkDatabase: async () => false,
      checkQueue: async () => ({ mode: 'in-process', healthy: true }),
      checkFfmpeg: async () => true,
    });

    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.database).toBe('down');
  });

  it('returns structured 404 JSON on unknown routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });

  it('encrypts and decrypts OAuth tokens safely using AES-256-GCM and rejects tampering', () => {
    const secretToken = 'ya29.a0AfH6SM_test_youtube_oauth_access_token';
    const encrypted = encryptSecret(secretToken);
    expect(encrypted).not.toContain(secretToken);
    expect(decryptSecret(encrypted)).toBe(secretToken);

    const parts = encrypted.split('.');
    parts[2] = Buffer.from('tampered-payload').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
});
