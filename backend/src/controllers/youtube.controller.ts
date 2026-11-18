import fs from 'fs';
import { Request, Response } from 'express';
import { z } from 'zod';
import {
  buildAuthorizationUrlForUser,
  disconnectYouTubeForUser,
  getYouTubeStatusForUser,
  handleOAuthCallback,
  listYouTubePublishHistory,
  resolveVideoFileForUpload,
  uploadVideoToYouTubeForUser,
} from '../services/youtube.service';
import { AppError, parseWithSchema, requireAuthUser } from '../shared/http.util';
import logger from '../shared/logger.util';

function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:4200')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

const uploadBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Video title is required.')
    .max(100, 'Video title must be 100 characters or fewer.'),
  description: z
    .string()
    .max(5000, 'Caption / description must be 5000 characters or fewer.')
    .optional()
    .default(''),
  privacyStatus: z.enum(['private', 'unlisted', 'public']).optional().default('private'),
  mediaJobId: z.string().trim().min(1).max(64).optional(),
  projectId: z.coerce.number().int().positive().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
});

function parseTags(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((t) => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 30);
  }
  return raw
    .split(/[,\n]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 30);
}

export async function getYouTubeConnectUrlController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const returnPath = typeof req.body?.returnPath === 'string' ? req.body.returnPath : '/editor';
  const result = buildAuthorizationUrlForUser(user, returnPath);
  res.json({ success: true, ...result });
}

export async function youtubeCallbackController(req: Request, res: Response): Promise<void> {
  const frontendUrl = getFrontendBaseUrl();

  if (typeof req.query.error === 'string') {
    res.redirect(`${frontendUrl}/#/editor?youtube=denied`);
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';

  if (!code || !state) {
    res.redirect(`${frontendUrl}/#/editor?youtube=invalid_state`);
    return;
  }

  try {
    const outcome = await handleOAuthCallback(code, state);
    if (!outcome.ok) {
      const params = new URLSearchParams({ youtube: outcome.reason });
      if (outcome.expectedEmail) params.set('expected', outcome.expectedEmail);
      if (outcome.actualEmail) params.set('actual', outcome.actualEmail);
      res.redirect(`${frontendUrl}/#${outcome.returnPath}?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams({ youtube: 'connected' });
    if (outcome.channelTitle) params.set('channel', outcome.channelTitle);
    res.redirect(`${frontendUrl}/#${outcome.returnPath}?${params.toString()}`);
  } catch (error) {
    logger.error('YouTube OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.redirect(`${frontendUrl}/#/editor?youtube=error`);
  }
}

export async function getYouTubeStatusController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const status = await getYouTubeStatusForUser(user);
  res.json({ success: true, ...status });
}

export async function disconnectYouTubeController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  await disconnectYouTubeForUser(user);
  res.json({ success: true, message: 'YouTube account disconnected.' });
}

export async function uploadYouTubeVideoController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const uploadedFile = req.file;

  try {
    const parsed = parseWithSchema(uploadBodySchema, req.body, res);
    if (!parsed) return;

    let videoFilePath: string;
    let resolvedProjectId: number | null = parsed.projectId ?? null;
    let resolvedMediaJobId: string | null = parsed.mediaJobId ?? null;

    if (parsed.mediaJobId) {
      const resolved = await resolveVideoFileForUpload(user.id!, parsed.mediaJobId);
      videoFilePath = resolved.filePath;
      if (!resolvedProjectId && resolved.job.projectId) {
        resolvedProjectId = resolved.job.projectId;
      }
    } else if (uploadedFile) {
      videoFilePath = uploadedFile.path;
      resolvedMediaJobId = null;
    } else {
      throw new AppError(
        400,
        'Provide either a rendered mediaJobId or upload a video file to publish.',
        'VIDEO_REQUIRED'
      );
    }

    const hashtagsFromDescription = (parsed.description.match(/#[a-zA-Z0-9_]+/g) || []).map((h) =>
      h.slice(1)
    );
    const mergedTags = Array.from(new Set([...parseTags(parsed.tags), ...hashtagsFromDescription]));

    const result = await uploadVideoToYouTubeForUser({
      user,
      videoFilePath,
      title: parsed.title,
      description: parsed.description,
      privacyStatus: parsed.privacyStatus,
      tags: mergedTags,
      projectId: resolvedProjectId,
      mediaJobId: resolvedMediaJobId,
    });

    res.status(201).json({
      success: true,
      message: 'Video uploaded to YouTube successfully.',
      videoId: result.videoId,
      videoUrl: result.videoUrl,
      privacyStatus: result.privacyStatus,
      channelTitle: result.channelTitle,
      publishRecord: result.publishRecord,
    });
  } finally {
    if (uploadedFile?.path) {
      fs.promises.unlink(uploadedFile.path).catch(() => undefined);
    }
  }
}

export async function getYouTubeHistoryController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const history = await listYouTubePublishHistory(user.id!);
  res.json({ success: true, history });
}
