
import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { google } from 'googleapis';

const router = Router();

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Google OAuth configuration in backend/.env'
    );
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

const frontendUrl = (
  process.env.FRONTEND_URL || 'http://localhost:4200'
).split(',')[0].trim();

// Temporary storage for local development only.
// Tokens are lost when the backend restarts.
const pendingStates = new Map<string, number>();

let savedTokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
} | null = null;

router.get('/connect', (_req: Request, res: Response) => {
  try {
    const oauthClient = createOAuthClient();
    const state = randomBytes(32).toString('hex');

    pendingStates.set(state, Date.now() + 10 * 60 * 1000);

    for (const [key, expiry] of pendingStates.entries()) {
      if (expiry < Date.now()) {
        pendingStates.delete(key);
      }
    }

    const url = oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: ['https://www.googleapis.com/auth/youtube.upload'],
      state,
    });

    res.redirect(url);
  } catch (error) {
    console.error('YouTube connect error:', error);
    res.status(500).json({
      message: 'Unable to start YouTube authorization. Check backend/.env.',
    });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    if (typeof req.query.error === 'string') {
      return res.redirect(`${frontendUrl}/admin/posts?youtube=denied`);
    }

    const code = req.query.code;
    const state = req.query.state;

    if (
      typeof code !== 'string' ||
      typeof state !== 'string' ||
      !pendingStates.has(state)
    ) {
      return res.status(400).send(
        'Invalid or expired authorization state. Please connect again.'
      );
    }

    const expiresAt = pendingStates.get(state)!;
    pendingStates.delete(state);

    if (expiresAt < Date.now()) {
      return res.status(400).send(
        'Authorization expired. Please connect again.'
      );
    }

    const oauthClient = createOAuthClient();
    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.access_token && !tokens.refresh_token) {
      return res.status(400).send(
        'Google did not return usable authorization tokens.'
      );
    }

    savedTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
    };

    return res.redirect(`${frontendUrl}/admin/posts?youtube=connected`);
  } catch (error) {
    console.error('YouTube callback error:', error);
    return res.redirect(`${frontendUrl}/admin/posts?youtube=error`);
  }
});

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    connected: Boolean(
      savedTokens?.access_token || savedTokens?.refresh_token
    ),
  });
});

export default router;
