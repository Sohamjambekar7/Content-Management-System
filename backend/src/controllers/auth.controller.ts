import { Request, Response } from 'express';
import { z } from 'zod';
import { addUser, getUserByEmail, updateUser } from '../services/user.service';
import { generateToken, verifyToken, hashPassword, verifyPassword } from '../shared/auth.util';
import { addToken, deleteTokens, getToken } from '../services/token.service';
import { sendConfirmationEmail, sendForgotPasswordEmail } from '../shared/email.util';
import { parseWithSchema } from '../shared/http.util';

const passwordZodRules = z
  .string()
  .min(6)
  .max(100)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter and one number.',
  });

function getPrimaryFrontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:4200')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

export const registerController = async (req: Request, res: Response) => {
  const parsedData = parseWithSchema(
    z.object({
      name: z.string().trim().min(3).max(100),
      email: z.string().trim().email(),
      password: passwordZodRules,
    }),
    req.body,
    res
  );
  if (!parsedData) return;

  const normalizedEmail = parsedData.email.toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists.' });
  }

  const hashedPassword = await hashPassword(parsedData.password);
  const createdUser = await addUser(normalizedEmail, hashedPassword, parsedData.name);
  const safeUser = createdUser.toJSON() as unknown as Record<string, unknown>;
  delete safeUser.password;

  const token = generateToken(createdUser.id!, '1h', 'activation');

  try {
    await addToken(token, 'activation', createdUser.id!);
    await sendConfirmationEmail(normalizedEmail, token);
  } catch (error) {
    await deleteTokens(createdUser.id!);
    await createdUser.destroy();
    throw error;
  }

  return res.status(201).json(safeUser);
};

export const loginController = async (req: Request, res: Response) => {
  const parsedData = parseWithSchema(
    z.object({
      email: z.string().trim().email(),
      password: z.string().min(6).max(100),
    }),
    req.body,
    res
  );
  if (!parsedData) return;

  const email = parsedData.email.toLowerCase();
  const user = await getUserByEmail(email);

  if (!user) return res.status(400).json({ message: 'User not found.' });
  if (user.get('status') !== 'active') {
    return res.status(400).json({ message: 'Please confirm your email.' });
  }

  const passwordMatches = await verifyPassword(parsedData.password, user.password!);
  if (!passwordMatches) {
    return res.status(400).json({ message: 'Invalid password.' });
  }

  if (!user.password?.startsWith('$2')) {
    user.password = await hashPassword(parsedData.password);
    await user.save();
  }

  const accessToken = generateToken(user.get('id'), '15m', 'access');
  const refreshToken = generateToken(user.get('id'), '7d', 'refresh');

  await deleteTokens(user.get('id'));
  await addToken(refreshToken, 'refresh', user.get('id'));
  await addToken(accessToken, 'access', user.get('id'));

  const safeUser = user.toJSON() as unknown as Record<string, unknown>;
  delete safeUser.password;

  return res.status(200).json({ accessToken, refreshToken, user: safeUser });
};

export const refreshTokenController = async (req: Request, res: Response) => {
  const parsedData = parseWithSchema(z.object({ refreshToken: z.string().min(1) }), req.body, res);
  if (!parsedData) return;

  const { refreshToken } = parsedData;
  const isTokenValid = verifyToken(refreshToken);

  if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'refresh') {
    return res.status(400).json({ message: 'Invalid token or expired.' });
  }

  const dbRefreshToken = await getToken(refreshToken);
  if (!dbRefreshToken || dbRefreshToken.get('type') !== 'refresh') {
    return res.status(400).json({ message: 'Invalid token.' });
  }

  const userId = dbRefreshToken.get('userId')!;
  const accessToken = generateToken(userId, '1h', 'access');
  const newRefreshToken = generateToken(userId, '7d', 'refresh');

  await deleteTokens(userId);
  await addToken(newRefreshToken, 'refresh', userId);
  await addToken(accessToken, 'access', userId);

  return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
};

export const logoutController = async (req: Request, res: Response) => {
  const parsedData = parseWithSchema(z.object({ refreshToken: z.string().min(1) }), req.body, res);
  if (!parsedData) return;

  const { refreshToken } = parsedData;
  const isTokenValid = verifyToken(refreshToken);

  if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'refresh') {
    return res.status(400).json({ message: 'Invalid token or expired.' });
  }

  const dbRefreshToken = await getToken(refreshToken);
  if (!dbRefreshToken || dbRefreshToken.get('type') !== 'refresh') {
    return res.status(400).json({ message: 'Invalid token.' });
  }

  await deleteTokens(dbRefreshToken.get('userId')!);
  return res.status(200).json({ message: 'Logged out.' });
};

export const confirmEmailController = async (req: Request, res: Response) => {
  const { token } = req.params;
  const isTokenValid = verifyToken(token);

  if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'activation') {
    return res.status(400).json({ message: 'Invalid token or expired.' });
  }

  const dbToken = await getToken(token);
  if (!dbToken || dbToken.get('type') !== 'activation') {
    return res.status(400).json({ message: 'Invalid token.' });
  }

  const userId = dbToken.get('userId')!;
  await updateUser({ id: userId, status: 'active' });
  await deleteTokens(userId);

  return res.redirect(`${getPrimaryFrontendUrl()}/#/auth/login?confirmed=true`);
};

export const forgotPasswordController = async (req: Request, res: Response) => {
  const parsedData = parseWithSchema(z.object({ email: z.string().trim().email() }), req.body, res);
  if (!parsedData) return;

  const email = parsedData.email.toLowerCase();
  const user = await getUserByEmail(email);
  if (!user) return res.status(400).json({ message: 'User not found.' });

  const token = generateToken(user.get('id'), '1h', 'reset');
  await deleteTokens(user.get('id'));
  await addToken(token, 'reset', user.get('id'));
  await sendForgotPasswordEmail(email, token);

  return res.status(200).json({ message: 'Email sent.' });
};

export const resetPasswordController = async (req: Request, res: Response) => {
  const parsedData = parseWithSchema(
    z.object({
      token: z.string().min(1),
      password: passwordZodRules,
    }),
    req.body,
    res
  );
  if (!parsedData) return;

  const { token, password } = parsedData;
  const isTokenValid = verifyToken(token);

  if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'reset') {
    return res.status(400).json({ message: 'Invalid token or expired.' });
  }

  const dbToken = await getToken(token);
  if (!dbToken || dbToken.get('type') !== 'reset') {
    return res.status(400).json({ message: 'Invalid token.' });
  }

  const userId = dbToken.get('userId')!;
  const encryptedPassword = await hashPassword(password);
  await updateUser({ id: userId, password: encryptedPassword });
  await deleteTokens(userId);

  return res.status(200).json({ message: 'Password updated.' });
};
