import { Request, Response } from "express";
import { z } from "zod";
import { addUser, getUserByEmail, updateUser } from "../services/user.service";
import { generateToken, verifyToken, hashPassword, verifyPassword } from "../shared/auth.util";
import { addToken, deleteTokens, getToken } from "../services/token.service";
import { sendConfirmationEmail, sendForgotPasswordEmail } from "../shared/email.util";

const passwordZodRules = z.string().min(6).max(100).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter and one number.'
});

export const registerController = async (req: Request, res: Response) => {
    const schema = z.object({
        name: z.string().min(3).max(100),
        email: z.string().email(),
        password: passwordZodRules
    });

    const parsedData = schema.safeParse(req.body);

    if (!parsedData.success) {
        return res.status(400).json(parsedData.error);
    }

    let { email, password, name } = parsedData.data;

    const existingUser = await getUserByEmail(email);

    if (existingUser) {
        return res.status(400).json({ message: 'User already exists.' });
    }

    password = await hashPassword(password);

    const createdUser = await addUser(email.trim().toLowerCase(), password, name.trim());
    const safeUser = createdUser.toJSON() as unknown as Record<string, unknown>;
    delete safeUser.password;

    const token = generateToken(createdUser.id!, '1h', 'activation');

    try {
        await addToken(token, 'activation', createdUser.id!);
        await sendConfirmationEmail(email.trim().toLowerCase(), token);
    } catch (error) {
        await deleteTokens(createdUser.id!);
        await createdUser.destroy();
        throw error;
    }

    return res.status(201).json(safeUser);
};

export const loginController = async (req: Request, res: Response) => {
    const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6).max(100)
    });

    const parsedData = schema.safeParse(req.body);

    if (!parsedData.success)
        return res.status(400).json(parsedData.error);

    const { password } = parsedData.data;
    const email = parsedData.data.email.trim().toLowerCase();

    const user = await getUserByEmail(email);

    if (!user)
        return res.status(400).json({ message: 'User not found.' });

    if (user.get('status') !== 'active') {
        return res.status(400).json({ message: 'Please confirm your email.' });
    }

    const passwordMatches = await verifyPassword(password, user.password!);

    if (!passwordMatches) {
        return res.status(400).json({ message: 'Invalid password.' });
    }

    if (!user.password?.startsWith('$2')) {
        user.password = await hashPassword(password);
        await user.save();
    }

    const accessToken = generateToken(user.get('id'), '15m', 'access');
    const refreshToken = generateToken(user.get('id'), '7d', 'refresh');

    await deleteTokens(user.get('id'));

    await addToken(refreshToken, 'refresh', user.get('id'));
    await addToken(accessToken, 'access', user.get('id'));

    const safeUser = user.toJSON() as unknown as Record<string, unknown>;
    delete safeUser.password;
    const session = { accessToken, refreshToken, user: safeUser };

    return res.status(200).json(session);
};

export const refreshTokenController = async (req: Request, res: Response) => {
    const schema = z.object({
        refreshToken: z.string()
    });

    const parsedData = schema.safeParse(req.body);

    if (!parsedData.success)
        return res.status(400).json(parsedData.error);

    const { refreshToken } = parsedData.data;
    const isTokenValid = verifyToken(refreshToken);

    if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'refresh') {
        return res.status(400).json({ message: 'Invalid token or expired.' });
    }

    const dbRefreshToken = await getToken(refreshToken);

    if (!dbRefreshToken || dbRefreshToken.get('type') !== 'refresh')
        return res.status(400).json({ message: 'Invalid token.' });

    const userId = dbRefreshToken.get('userId');

    const accessToken = generateToken(userId!, '1h', 'access');
    const newRefreshToken = generateToken(userId!, '7d', 'refresh');

    await deleteTokens(userId!);
    await addToken(newRefreshToken, 'refresh', userId!);
    await addToken(accessToken, 'access', userId!);

    return res.status(200).json({
        accessToken,
        refreshToken: newRefreshToken
    });
};

export const logoutController = async (req: Request, res: Response) => {
    const schema = z.object({
        refreshToken: z.string()
    });

    const parsedData = schema.safeParse(req.body);

    if (!parsedData.success)
        return res.status(400).json(parsedData.error);

    const { refreshToken } = parsedData.data;
    const isTokenValid = verifyToken(refreshToken);

    if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'refresh') {
        return res.status(400).json({ message: 'Invalid token or expired.' });
    }

    const dbRefreshToken = await getToken(refreshToken);

    if (!dbRefreshToken || dbRefreshToken.get('type') !== 'refresh') {
        return res.status(400).json({ message: 'Invalid token.' });
    }

    const userId = dbRefreshToken.get('userId');
    await deleteTokens(userId!);

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

    const userId = dbToken.get('userId');

    await updateUser({
        id: userId!,
        status: 'active'
    });

    await deleteTokens(userId!);

    res.redirect(process.env.FRONTEND_URL + '#/auth/login');
};

export const forgotPasswordController = async (req: Request, res: Response) => {
    const schema = z.object({
        email: z.string().email(),
    });

    const parsedData = schema.safeParse(req.body);

    if (!parsedData.success)
        return res.status(400).json(parsedData.error);

    const email = parsedData.data.email.trim().toLowerCase();
    const user = await getUserByEmail(email);

    if (!user)
        return res.status(400).json({ message: 'User not found.' });

    const token = generateToken(user.get('id'), '1h', 'reset');

    await deleteTokens(user.get('id'));
    await addToken(token, 'reset', user.get('id'));
    await sendForgotPasswordEmail(email, token);

    return res.status(200).json({ message: 'Email sent.' });
};

export const resetPasswordController = async (req: Request, res: Response) => {
    const schema = z.object({
        token: z.string(),
        password: passwordZodRules
    });

    const parsedData = schema.safeParse(req.body);

    if (!parsedData.success)
        return res.status(400).json(parsedData.error);

    const { token, password } = parsedData.data;
    const isTokenValid = verifyToken(token);

    if (!isTokenValid || typeof isTokenValid === 'string' || isTokenValid.tokenType !== 'reset') {
        return res.status(400).json({ message: 'Invalid token or expired.' });
    }

    const dbToken = await getToken(token);

    if (!dbToken || dbToken.get('type') !== 'reset') {
        return res.status(400).json({ message: 'Invalid token.' });
    }

    const userId = dbToken.get('userId');
    const encryptedPassword = await hashPassword(password);

    await updateUser({
        id: userId!,
        password: encryptedPassword
    });

    await deleteTokens(userId!);

    return res.status(200).json({ message: 'Password updated.' });
};