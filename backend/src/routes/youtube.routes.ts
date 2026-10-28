
import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { google } from 'googleapis';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = Router();

const frontendUrl = (
  process.env.FRONTEND_URL || 'http://localhost:4200'
).split(',')[0].trim();

const uploadDirectory = path.resolve(process.cwd(), 'uploads');

fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  dest: uploadDirectory,
  limits: {
    fileSize: 512 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('video/')) {
      return callback(new Error('Please upload a video file.'));
    }

    callback(null, true);
  },
});

type YouTubeTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
};

const pendingStates = new Map<string, number>();

// Temporary local-development storage.
// These tokens are lost when the backend restarts.
let savedTokens: YouTubeTokens | null = null;

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Google OAuth settings in backend/.env'
    );
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

function getAuthorizedClient() {
  if (
    !savedTokens ||
    (!savedTokens.access_token && !savedTokens.refresh_token)
  ) {
    throw new Error(
      'YouTube is not connected. Connect your Google account first.'
    );
  }

  const oauthClient = createOAuthClient();
  oauthClient.setCredentials(savedTokens);

  oauthClient.on('tokens', (tokens) => {
    savedTokens = {
      ...savedTokens,
      ...tokens,
    };
  });

  return oauthClient;
}

// Start OAuth authorization.
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

    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
      ],
      state,
    });

    res.redirect(authorizationUrl);
  } catch (error) {
    console.error('YouTube connect error:', error);
    res.status(500).json({
      message: 'Unable to start YouTube authorization.',
    });
  }
});

// OAuth callback.
router.get('/callback', async (req: Request, res: Response) => {
  try {
    if (typeof req.query.error === 'string') {
      return res.redirect(
        `${frontendUrl}/admin/posts?youtube=denied`
      );
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

    return res.redirect(
      `${frontendUrl}/admin/posts?youtube=connected`
    );
  } catch (error) {
    console.error('YouTube callback error:', error);
    return res.redirect(
      `${frontendUrl}/admin/posts?youtube=error`
    );
  }
});

// Check connection status.
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    connected: Boolean(
      savedTokens?.access_token || savedTokens?.refresh_token
    ),
  });
});

// Upload a video to YouTube.
// Multipart fields: video, title, description, privacyStatus.
router.post(
  '/upload',
  (req: Request, res: Response, next) => {
    try {
      getAuthorizedClient();
      next();
    } catch (error) {
      res.status(401).json({
        message:
          error instanceof Error
            ? error.message
            : 'YouTube authorization required.',
      });
    }
  },
  upload.single('video'),
  async (req: Request, res: Response) => {
    const file = req.file;

    try {
      if (!file) {
        return res.status(400).json({
          message: 'Please select a video file.',
        });
      }

      const title =
        typeof req.body.title === 'string'
          ? req.body.title.trim()
          : '';

      const description =
        typeof req.body.description === 'string'
          ? req.body.description.trim()
          : '';

      const privacyStatus = req.body.privacyStatus || 'private';

      if (!title) {
        return res.status(400).json({
          message: 'Video title is required.',
        });
      }

      if (title.length > 100) {
        return res.status(400).json({
          message: 'Video title must be 100 characters or fewer.',
        });
      }

      if (!['private', 'unlisted', 'public'].includes(privacyStatus)) {
        return res.status(400).json({
          message: 'Invalid visibility setting.',
        });
      }

      const oauthClient = getAuthorizedClient();

      const youtube = google.youtube({
        version: 'v3',
        auth: oauthClient,
      });

      const result = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description,
            categoryId: '22',
          },
          status: {
            privacyStatus,
          },
        },
        media: {
          body: fs.createReadStream(file.path),
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Video uploaded to YouTube.',
        videoId: result.data.id,
        videoUrl: result.data.id
          ? `https://www.youtube.com/watch?v=${result.data.id}`
          : null,
        privacyStatus,
      });
    } catch (error) {
      console.error('YouTube upload error:', error);

      return res.status(500).json({
        success: false,
        message:
          'YouTube upload failed. Check the backend terminal for details.',
      });
    } finally {
      if (file?.path) {
        fs.promises.unlink(file.path).catch(() => undefined);
      }
    }
  }
);

export default router;
