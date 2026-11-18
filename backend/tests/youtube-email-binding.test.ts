import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index';
import {
  normalizeEmail,
  sanitizeReturnPath,
  verifyEmailsMatch,
} from '../src/services/youtube.service';

describe('YouTube Email-Bound OAuth & Route Protection', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_key_for_easecontent_at_least_32_chars';
  });

  it('matches identical emails case-insensitively and ignores outer whitespace', () => {
    expect(normalizeEmail('  Creator@Example.COM ')).toBe('creator@example.com');
    expect(verifyEmailsMatch('creator@example.com', 'Creator@Example.com')).toBe(true);
  });

  it('rejects mismatched or missing emails to prevent cross-account YouTube uploads', () => {
    expect(verifyEmailsMatch('creator@example.com', 'other@example.com')).toBe(false);
    expect(verifyEmailsMatch('creator@example.com', '')).toBe(false);
    expect(verifyEmailsMatch('creator@example.com', null)).toBe(false);
    expect(verifyEmailsMatch('', 'creator@example.com')).toBe(false);
  });

  it('sanitizes OAuth return paths to prevent open redirects', () => {
    expect(sanitizeReturnPath('/editor')).toBe('/editor');
    expect(sanitizeReturnPath('/admin/posts')).toBe('/admin/posts');
    expect(sanitizeReturnPath('https://evil.example/phish')).toBe('/editor');
    expect(sanitizeReturnPath('//evil.example/phish')).toBe('/editor');
    expect(sanitizeReturnPath(undefined)).toBe('/editor');
  });

  it('requires JWT authentication on YouTube status, connect-url, upload, and history routes', async () => {
    const app = createApp();

    const statusRes = await request(app).get('/api/youtube/status');
    expect(statusRes.status).toBe(401);

    const connectRes = await request(app).post('/api/youtube/connect-url').send({ returnPath: '/editor' });
    expect(connectRes.status).toBe(401);

    const uploadRes = await request(app).post('/api/youtube/upload').send({ title: 'Test' });
    expect(uploadRes.status).toBe(401);

    const historyRes = await request(app).get('/api/youtube/history');
    expect(historyRes.status).toBe(401);
  });

  it('requires JWT authentication on Media job and AI endpoints', async () => {
    const app = createApp();

    const jobsRes = await request(app).get('/api/media/jobs');
    expect(jobsRes.status).toBe(401);

    const copyRes = await request(app).post('/api/media/ai/copy').send({ topic: 'Launch Day' });
    expect(copyRes.status).toBe(401);
  });
});
