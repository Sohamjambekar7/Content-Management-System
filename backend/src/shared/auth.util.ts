import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Token } from '../models/Token';
import { AuthRequest } from './http.util';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
  }
  return value;
}

export type TokenPurpose = 'access' | 'refresh' | 'activation' | 'reset';

export function generateToken(
  userId: number,
  expiresIn: SignOptions['expiresIn'] = '1h',
  purpose: TokenPurpose = 'access'
): string {
  return jwt.sign({ userId, tokenType: purpose }, secret(), { expiresIn });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compare(password, storedHash);
  }
  // One-time compatibility for older records that stored a reversible JWT-signed password.
  const legacy = verifyToken(storedHash);
  return typeof legacy === 'string' && legacy === password;
}

export function verifyToken(token: string): string | JwtPayload | null {
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | undefined {
  return req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim() || undefined;
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }
  authenticateJWTCommon(req, res, next, token);
}

/**
 * Allows JWT authentication via Authorization header OR `?token=` query parameter,
 * specifically for browser media elements (<video>, <img>) and EventSource (SSE)
 * that cannot attach custom Authorization headers.
 */
export function authenticateJWTStream(req: Request, res: Response, next: NextFunction): void {
  const headerToken = extractBearerToken(req);
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : undefined;
  const token = headerToken || queryToken;
  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }
  authenticateJWTCommon(req, res, next, token);
}

export function authenticateJWTOptional(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }
  authenticateJWTCommon(req, res, next, token);
}

function authenticateJWTCommon(req: Request, res: Response, next: NextFunction, token: string): void {
  const payload = verifyToken(token);
  if (
    !payload ||
    typeof payload === 'string' ||
    typeof payload.userId !== 'number' ||
    payload.tokenType !== 'access'
  ) {
    res.status(401).json({ success: false, message: 'Invalid or expired access token.' });
    return;
  }

  Token.findOne({ where: { token, type: 'access', userId: payload.userId } })
    .then(async (storedToken) => {
      if (!storedToken) {
        res.status(401).json({ success: false, message: 'Access token has been revoked.' });
        return;
      }
      const user = await User.findByPk(payload.userId);
      if (!user) {
        res.status(401).json({ success: false, message: 'User account was not found.' });
        return;
      }
      (req as AuthRequest).user = user;
      next();
    })
    .catch(next);
}
