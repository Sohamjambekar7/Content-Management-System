import { randomBytes } from 'crypto';
import fs from 'fs';
import type { google as GoogleApisType } from 'googleapis';
import { User } from '../models/User';
import { YouTubeAccount } from '../models/YouTubeAccount';
import { YouTubePublishRecord } from '../models/YouTubePublishRecord';
import { ExportHistory } from '../models/ExportHistory';
import { MediaJob } from '../models/MediaJob';
import { AppError } from '../shared/http.util';
import { decryptSecret, encryptSecret } from '../shared/security.util';
import logger from '../shared/logger.util';

export interface YouTubeConnectionStatus {
  connected: boolean;
  status: 'connected' | 'not_connected' | 'mismatch' | 'expired' | 'revoked';
  needsReauth: boolean;
  sessionEmail: string;
  connectedEmail: string | null;
  channelId: string | null;
  channelTitle: string | null;
  reason?: string;
}

interface PendingOAuthState {
  userId: number;
  userEmail: string;
  returnPath: string;
  expiresAt: number;
}

const pendingStates = new Map<string, PendingOAuthState>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function verifyEmailsMatch(sessionEmail: string, googleEmail: string | null | undefined): boolean {
  const expected = normalizeEmail(sessionEmail);
  const actual = normalizeEmail(googleEmail);
  return Boolean(expected && actual && expected === actual);
}

export function isYouTubeOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

function getGoogle(): typeof GoogleApisType {
  // Lazy-load googleapis on first YouTube OAuth/upload call to keep API cold start fast.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('googleapis') as typeof import('googleapis')).google;
}

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(
      503,
      'YouTube OAuth is not configured on this server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
      'YOUTUBE_NOT_CONFIGURED'
    );
  }

  const google = getGoogle();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [key, entry] of pendingStates.entries()) {
    if (entry.expiresAt <= now) {
      pendingStates.delete(key);
    }
  }
}

export function sanitizeReturnPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '/editor';
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/editor';
  return trimmed.slice(0, 120);
}

export function buildAuthorizationUrlForUser(
  user: User,
  returnPath = '/editor'
): { authUrl: string; expectedEmail: string } {
  const sessionEmail = normalizeEmail(user.email);
  if (!sessionEmail) {
    throw new AppError(400, 'Your EASEContent account does not have an email address.', 'EMAIL_REQUIRED');
  }

  const oauthClient = createOAuthClient();
  purgeExpiredStates();

  const state = randomBytes(32).toString('hex');
  pendingStates.set(state, {
    userId: user.id!,
    userEmail: sessionEmail,
    returnPath: sanitizeReturnPath(returnPath),
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const authUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: true,
    login_hint: sessionEmail,
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'openid',
      'email',
      'profile',
    ],
    state,
  });

  return { authUrl, expectedEmail: sessionEmail };
}

export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<
  | { ok: true; returnPath: string; googleEmail: string; channelTitle: string | null }
  | { ok: false; reason: 'invalid_state' | 'email_mismatch' | 'token_error'; returnPath: string; expectedEmail?: string; actualEmail?: string }
> {
  purgeExpiredStates();
  const pending = pendingStates.get(state);
  if (!pending) {
    return { ok: false, reason: 'invalid_state', returnPath: '/editor' };
  }
  pendingStates.delete(state);

  const oauthClient = createOAuthClient();
  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.access_token && !tokens.refresh_token) {
    return { ok: false, reason: 'token_error', returnPath: pending.returnPath };
  }

  oauthClient.setCredentials(tokens);

  // Verify the authorized Google account email against the logged-in EASEContent user's email
  const google = getGoogle();
  const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
  const userInfoResp = await oauth2.userinfo.get();
  const googleEmail = normalizeEmail(userInfoResp.data.email);

  if (!verifyEmailsMatch(pending.userEmail, googleEmail)) {
    logger.warn('YouTube OAuth email mismatch prevented cross-account link', {
      userId: pending.userId,
      expectedEmail: pending.userEmail,
      actualEmail: googleEmail,
    });

    await YouTubeAccount.upsert({
      userId: pending.userId,
      userEmail: pending.userEmail,
      googleEmail: googleEmail || null,
      channelId: null,
      channelTitle: null,
      accessTokenEnc: null,
      refreshTokenEnc: null,
      scope: null,
      tokenType: null,
      expiryDate: null,
      status: 'mismatch',
    } as YouTubeAccount);

    return {
      ok: false,
      reason: 'email_mismatch',
      returnPath: pending.returnPath,
      expectedEmail: pending.userEmail,
      actualEmail: googleEmail || 'unknown',
    };
  }

  // Fetch the user's YouTube channel metadata (best-effort)
  let channelId: string | null = null;
  let channelTitle: string | null = null;
  try {
    const youtube = google.youtube({ version: 'v3', auth: oauthClient });
    const channelRes = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });
    const firstChannel = channelRes.data.items?.[0];
    if (firstChannel) {
      channelId = firstChannel.id || null;
      channelTitle = firstChannel.snippet?.title || null;
    }
  } catch (err) {
    logger.warn('Could not read YouTube channel snippet during OAuth callback', {
      userId: pending.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const existing = await YouTubeAccount.findOne({ where: { userId: pending.userId } });
  const encryptedAccess = tokens.access_token ? encryptSecret(tokens.access_token) : null;
  const encryptedRefresh = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : existing?.refreshTokenEnc || null;

  await YouTubeAccount.upsert({
    userId: pending.userId,
    userEmail: pending.userEmail,
    googleEmail,
    channelId,
    channelTitle,
    accessTokenEnc: encryptedAccess,
    refreshTokenEnc: encryptedRefresh,
    scope: tokens.scope || null,
    tokenType: tokens.token_type || null,
    expiryDate: tokens.expiry_date || null,
    status: 'connected',
  } as YouTubeAccount);

  logger.info('YouTube account linked and verified for user email', {
    userId: pending.userId,
    email: pending.userEmail,
    channelTitle,
  });

  return {
    ok: true,
    returnPath: pending.returnPath,
    googleEmail,
    channelTitle,
  };
}

export async function getYouTubeStatusForUser(user: User): Promise<YouTubeConnectionStatus> {
  const sessionEmail = normalizeEmail(user.email);
  const account = await YouTubeAccount.findOne({ where: { userId: user.id! } });

  if (!account) {
    return {
      connected: false,
      status: 'not_connected',
      needsReauth: true,
      sessionEmail,
      connectedEmail: null,
      channelId: null,
      channelTitle: null,
      reason: `Connect your Google/YouTube account signed in as ${sessionEmail} before publishing.`,
    };
  }

  if (
    account.status === 'mismatch' ||
    !verifyEmailsMatch(sessionEmail, account.userEmail) ||
    !verifyEmailsMatch(sessionEmail, account.googleEmail)
  ) {
    return {
      connected: false,
      status: 'mismatch',
      needsReauth: true,
      sessionEmail,
      connectedEmail: account.googleEmail || null,
      channelId: null,
      channelTitle: null,
      reason: `Connected Google account (${account.googleEmail || 'different account'}) does not match your EASEContent login email (${sessionEmail}). Re-authorize with ${sessionEmail} to prevent cross-account uploads.`,
    };
  }

  if (account.status === 'revoked') {
    return {
      connected: false,
      status: 'revoked',
      needsReauth: true,
      sessionEmail,
      connectedEmail: account.googleEmail || null,
      channelId: account.channelId || null,
      channelTitle: account.channelTitle || null,
      reason: 'YouTube access was revoked. Please re-authorize your account.',
    };
  }

  const hasAccess = Boolean(account.accessTokenEnc);
  const hasRefresh = Boolean(account.refreshTokenEnc);
  const isExpired = Boolean(account.expiryDate && Number(account.expiryDate) <= Date.now() + 60_000);

  if (account.status === 'expired' || (!hasAccess && !hasRefresh) || (isExpired && !hasRefresh)) {
    return {
      connected: false,
      status: 'expired',
      needsReauth: true,
      sessionEmail,
      connectedEmail: account.googleEmail || null,
      channelId: account.channelId || null,
      channelTitle: account.channelTitle || null,
      reason: 'Your YouTube authorization token has expired. Please re-authorize to continue uploading.',
    };
  }

  return {
    connected: true,
    status: 'connected',
    needsReauth: false,
    sessionEmail,
    connectedEmail: account.googleEmail || sessionEmail,
    channelId: account.channelId || null,
    channelTitle: account.channelTitle || null,
  };
}

export async function disconnectYouTubeForUser(user: User): Promise<void> {
  await YouTubeAccount.destroy({ where: { userId: user.id! } });
  logger.info('Disconnected YouTube account for user', { userId: user.id, email: user.email });
}

async function getAuthorizedOAuthClientForUser(user: User): Promise<{
  oauthClient: ReturnType<typeof createOAuthClient>;
  account: YouTubeAccount;
}> {
  const sessionEmail = normalizeEmail(user.email);
  const account = await YouTubeAccount.findOne({ where: { userId: user.id! } });

  if (!account) {
    throw new AppError(
      401,
      `YouTube is not connected for ${sessionEmail}. Connect your account first.`,
      'YOUTUBE_REAUTH_REQUIRED'
    );
  }

  if (
    account.status === 'mismatch' ||
    !verifyEmailsMatch(sessionEmail, account.userEmail) ||
    !verifyEmailsMatch(sessionEmail, account.googleEmail)
  ) {
    throw new AppError(
      409,
      `Account mismatch: YouTube authorization must belong to ${sessionEmail}. Re-authorize with that email.`,
      'YOUTUBE_EMAIL_MISMATCH'
    );
  }

  let accessToken: string | undefined;
  let refreshToken: string | undefined;

  try {
    accessToken = account.accessTokenEnc ? decryptSecret(account.accessTokenEnc) : undefined;
    refreshToken = account.refreshTokenEnc ? decryptSecret(account.refreshTokenEnc) : undefined;
  } catch {
    await account.update({ status: 'expired', accessTokenEnc: null, refreshTokenEnc: null });
    throw new AppError(
      401,
      'Stored YouTube credentials could not be decrypted. Please reconnect your YouTube account.',
      'YOUTUBE_REAUTH_REQUIRED'
    );
  }

  if (!accessToken && !refreshToken) {
    await account.update({ status: 'expired' });
    throw new AppError(
      401,
      'YouTube authorization expired. Please re-authorize your account.',
      'YOUTUBE_REAUTH_REQUIRED'
    );
  }

  const oauthClient = createOAuthClient();
  oauthClient.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    scope: account.scope || undefined,
    token_type: account.tokenType || undefined,
    expiry_date: account.expiryDate ? Number(account.expiryDate) : undefined,
  });

  oauthClient.on('tokens', (newTokens) => {
    const updates: Partial<YouTubeAccount> = { status: 'connected' };
    if (newTokens.access_token) updates.accessTokenEnc = encryptSecret(newTokens.access_token);
    if (newTokens.refresh_token) updates.refreshTokenEnc = encryptSecret(newTokens.refresh_token);
    if (newTokens.expiry_date) updates.expiryDate = newTokens.expiry_date;
    void account.update(updates).catch((err) => {
      logger.warn('Failed to persist refreshed YouTube tokens', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  // Proactively refresh if expired or expiring within 60 seconds
  if (account.expiryDate && Number(account.expiryDate) <= Date.now() + 60_000) {
    try {
      await oauthClient.getAccessToken();
    } catch {
      await account.update({ status: 'expired' });
      throw new AppError(
        401,
        'Your YouTube session expired. Please re-authorize with your EASEContent email.',
        'YOUTUBE_REAUTH_REQUIRED'
      );
    }
  }

  return { oauthClient, account };
}

export async function uploadVideoToYouTubeForUser(params: {
  user: User;
  videoFilePath: string;
  title: string;
  description: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  tags?: string[];
  projectId?: number | null;
  mediaJobId?: string | null;
}): Promise<{
  videoId: string | null;
  videoUrl: string | null;
  privacyStatus: 'private' | 'unlisted' | 'public';
  channelTitle: string | null;
  publishRecord: YouTubePublishRecord;
}> {
  const { user, videoFilePath, title, description, privacyStatus, tags, projectId, mediaJobId } = params;
  const sessionEmail = normalizeEmail(user.email);

  if (!fs.existsSync(videoFilePath)) {
    throw new AppError(400, 'The video file selected for upload could not be found.', 'VIDEO_NOT_FOUND');
  }

  const { oauthClient, account } = await getAuthorizedOAuthClientForUser(user);
  const google = getGoogle();
  const youtube = google.youtube({ version: 'v3', auth: oauthClient });

  const publishRecord = await YouTubePublishRecord.create({
    userId: user.id!,
    userEmail: sessionEmail,
    projectId: projectId ?? null,
    mediaJobId: mediaJobId ?? null,
    title,
    description,
    privacyStatus,
    channelId: account.channelId || null,
    channelTitle: account.channelTitle || null,
    status: 'uploading',
    metadata: { tags: tags || [] },
  } as unknown as YouTubePublishRecord);

  try {
    const result = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags: tags && tags.length > 0 ? tags.slice(0, 30) : undefined,
          categoryId: '22',
        },
        status: {
          privacyStatus,
        },
      },
      media: {
        body: fs.createReadStream(videoFilePath),
      },
    });

    const videoId = result.data.id || null;
    const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;

    await publishRecord.update({
      videoId,
      videoUrl,
      status: 'published',
      errorMessage: null,
    });

    // Save to unified EASEContent export/publish history as well
    await ExportHistory.create({
      userId: user.id!,
      projectId: projectId ?? null,
      format: 'mp4',
      platform: 'youtube',
      metadata: {
        youtubePublishRecordId: publishRecord.id,
        mediaJobId: mediaJobId ?? null,
        videoId,
        videoUrl,
        title,
        privacyStatus,
        channelTitle: account.channelTitle || null,
        userEmail: sessionEmail,
      },
    } as unknown as ExportHistory).catch((err) => {
      logger.warn('Failed to write YouTube publish record to export_history', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info('Uploaded video to YouTube', {
      userId: user.id,
      email: sessionEmail,
      videoId,
      privacyStatus,
    });

    return {
      videoId,
      videoUrl,
      privacyStatus,
      channelTitle: account.channelTitle || null,
      publishRecord,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'YouTube upload failed.';
    const isAuthFailure = /invalid_grant|unauthorized|invalid credentials|401/i.test(message);

    if (isAuthFailure) {
      await account.update({ status: 'expired' });
    }

    await publishRecord.update({
      status: 'failed',
      errorMessage: message.slice(0, 1000),
    });

    if (isAuthFailure) {
      throw new AppError(
        401,
        'Your YouTube authorization is no longer valid. Please re-authorize with your EASEContent email.',
        'YOUTUBE_REAUTH_REQUIRED'
      );
    }

    throw new AppError(502, `YouTube upload failed: ${message}`, 'YOUTUBE_UPLOAD_FAILED');
  }
}

export async function resolveVideoFileForUpload(
  userId: number,
  mediaJobId: string
): Promise<{ filePath: string; job: MediaJob }> {
  const job = await MediaJob.findOne({ where: { id: mediaJobId, userId } });
  if (!job) {
    throw new AppError(404, 'Rendered media job not found for your account.', 'JOB_NOT_FOUND');
  }
  if (job.mediaType !== 'video' || job.status !== 'completed' || !job.outputPath || !fs.existsSync(job.outputPath)) {
    throw new AppError(
      400,
      'Rendered video is not ready yet. Wait for rendering to finish before publishing.',
      'VIDEO_NOT_READY'
    );
  }
  return { filePath: job.outputPath, job };
}

export async function listYouTubePublishHistory(userId: number): Promise<YouTubePublishRecord[]> {
  return YouTubePublishRecord.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
}
