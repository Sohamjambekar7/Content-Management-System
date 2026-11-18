import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import logger from './logger.util';
import { AuthRequest } from './http.util';

const ENCRYPTION_ALGO = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error('TOKEN_ENCRYPTION_KEY or JWT_SECRET must be set to encrypt credentials.');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(cipherText: string): string {
  const parts = cipherText.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = req.header('X-Request-Id') || randomUUID();
  (req as AuthRequest).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const isHealth = req.path === '/health' || req.path === '/ready' || req.path === '/api/health';
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : isHealth ? 'debug' : 'info';
    logger.log(level, 'HTTP request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userId: (req as AuthRequest).user?.id,
    });
  });

  next();
}
