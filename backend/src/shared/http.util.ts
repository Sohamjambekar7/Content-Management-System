import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodTypeDef, ZodError } from 'zod';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: User;
  requestId?: string;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function formatZodError(error: ZodError): {
  message: string;
  issues: Array<{ path: string; message: string }>;
} {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  const first = issues[0];
  const message = first
    ? first.path
      ? `${first.path}: ${first.message}`
      : first.message
    : 'Validation failed.';
  return { message, issues };
}

export function parseWithSchema<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  payload: unknown,
  res: Response
): T | null {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const formatted = formatZodError(parsed.error);
    res.status(400).json({
      success: false,
      message: formatted.message,
      issues: formatted.issues,
    });
    return null;
  }
  return parsed.data;
}

export function requireAuthUser(req: Request): User {
  const user = (req as AuthRequest).user;
  if (!user || !user.id) {
    throw new AppError(401, 'Authentication required.', 'AUTH_REQUIRED');
  }
  return user;
}

export function sanitizeFileName(name: string, fallback = 'media'): string {
  const cleaned = (name || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }

    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.baseUrl}${req.path}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      if (buckets.size > 5000) {
        for (const [k, v] of buckets.entries()) {
          if (v.resetAt <= now) buckets.delete(k);
        }
      }
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: options.message || 'Too many requests. Please try again shortly.',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
