import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Token } from '../models/Token';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
  return value;
}

export type TokenPurpose = 'access' | 'refresh' | 'activation' | 'reset';

export function generateToken(userId: number, expiresIn: SignOptions['expiresIn'] = '1h', purpose: TokenPurpose = 'access'): string {
  return jwt.sign({ userId, tokenType: purpose }, secret(), { expiresIn });
}

export async function hashPassword(password: string): Promise<string> { return bcrypt.hash(password, 12); }

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) return bcrypt.compare(password, storedHash);
  // One-time compatibility for older records that stored a reversible JWT-signed password.
  const legacy = verifyToken(storedHash);
  return typeof legacy === 'string' && legacy === password;
}

export function verifyToken(token: string): string | JwtPayload | null {
  try { return jwt.verify(token, secret()); } catch { return null; }
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ message: 'Authentication required.' }); return; }
  authenticateJWTCommon(req, res, next, token);
}

export function authenticateJWTOptional(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) { next(); return; }
  authenticateJWTCommon(req, res, next, token);
}

function authenticateJWTCommon(req: Request, res: Response, next: NextFunction, token: string): void {
  const payload = verifyToken(token);
  if (!payload || typeof payload === 'string' || typeof payload.userId !== 'number' || payload.tokenType !== 'access') {
    res.status(401).json({ message: 'Invalid or expired access token.' }); return;
  }
  Token.findOne({ where: { token, type: 'access', userId: payload.userId } }).then(async storedToken => {
    if (!storedToken) { res.status(401).json({ message: 'Access token has been revoked.' }); return; }
    const user = await User.findByPk(payload.userId);
    if (!user) { res.status(401).json({ message: 'User account was not found.' }); return; }
    (req as Request & { user?: User }).user = user;
    next();
  }).catch(next);
}
