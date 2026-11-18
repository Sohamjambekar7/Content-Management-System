import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { z } from 'zod';
import { MediaJob, MediaJobType } from '../models/MediaJob';
import { EditorProject } from '../models/EditorProject';
import {
  enqueueMediaJob,
  subscribeToJobProgress,
} from '../queue/media.queue';
import {
  generateAiSocialCopy,
  PhotoEditOptions,
  VideoEditOptions,
} from '../services/media-processor.service';
import {
  AppError,
  parseWithSchema,
  requireAuthUser,
  sanitizeFileName,
} from '../shared/http.util';
import logger from '../shared/logger.util';

const filterPresetSchema = z
  .enum(['none', 'vivid', 'cinematic', 'warm', 'cool', 'vintage', 'bw', 'noir'])
  .optional();

const photoOptionsSchema = z.object({
  aspectRatio: z.enum(['original', '16:9', '9:16', '1:1', '4:5', '4:3']).optional(),
  cropZoom: z.coerce.number().min(20).max(100).optional(),
  rotation: z.coerce.number().optional(),
  flipH: z.boolean().optional(),
  flipV: z.boolean().optional(),
  brightness: z.coerce.number().min(-100).max(100).optional(),
  contrast: z.coerce.number().min(-100).max(100).optional(),
  saturation: z.coerce.number().min(-100).max(100).optional(),
  exposure: z.coerce.number().min(-100).max(100).optional(),
  sharpness: z.coerce.number().min(0).max(100).optional(),
  filterPreset: filterPresetSchema,
  aiEnhance: z.boolean().optional(),
  captionText: z.string().max(120).optional(),
  captionPosition: z.enum(['top', 'center', 'bottom']).optional(),
  captionColor: z.string().max(20).optional(),
  format: z.enum(['png', 'jpeg', 'webp']).optional(),
  quality: z.coerce.number().min(50).max(100).optional(),
});

const subtitleCueSchema = z.object({
  start: z.coerce.number().min(0),
  end: z.coerce.number().min(0.1),
  text: z.string().trim().min(1).max(200),
});

const videoOptionsSchema = z.object({
  startTime: z.coerce.number().min(0).optional(),
  endTime: z.coerce.number().min(0.1).optional(),
  speed: z.coerce.number().min(0.5).max(2.0).optional(),
  aspectRatio: z.enum(['original', '16:9', '9:16', '1:1', '4:5']).optional(),
  fitMode: z.enum(['crop', 'pad']).optional(),
  brightness: z.coerce.number().min(-100).max(100).optional(),
  contrast: z.coerce.number().min(-100).max(100).optional(),
  saturation: z.coerce.number().min(-100).max(100).optional(),
  exposure: z.coerce.number().min(-100).max(100).optional(),
  sharpness: z.coerce.number().min(0).max(100).optional(),
  filterPreset: filterPresetSchema,
  fadeInSeconds: z.coerce.number().min(0).max(5).optional(),
  fadeOutSeconds: z.coerce.number().min(0).max(5).optional(),
  volume: z.coerce.number().min(0).max(200).optional(),
  muted: z.boolean().optional(),
  normalizeAudio: z.boolean().optional(),
  subtitles: z.array(subtitleCueSchema).max(100).optional(),
  subtitlePosition: z.enum(['top', 'center', 'bottom']).optional(),
});

function parseJsonField(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      throw new AppError(400, 'Invalid JSON in options payload.', 'INVALID_OPTIONS');
    }
  }
  return {};
}

async function resolveOptionalProjectId(rawProjectId: unknown, userId: number): Promise<number | null> {
  if (rawProjectId === undefined || rawProjectId === null || rawProjectId === '') return null;
  const parsedId = Number(rawProjectId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) return null;
  const project = await EditorProject.findOne({ where: { id: parsedId, userId } });
  return project ? project.id : null;
}

function serializeJob(job: MediaJob) {
  return {
    id: job.id,
    projectId: job.projectId,
    mediaType: job.mediaType,
    jobType: job.jobType,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    originalFileName: job.originalFileName,
    outputMimeType: job.outputMimeType,
    outputUrl: job.status === 'completed' && job.outputPath ? `/api/media/jobs/${job.id}/output` : null,
    width: job.width,
    height: job.height,
    durationSeconds: job.durationSeconds ? Number(job.durationSeconds) : null,
    fileSizeBytes: job.fileSizeBytes ? Number(job.fileSizeBytes) : null,
    options: job.options,
    resultMetadata: job.resultMetadata,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function createPhotoJobController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const file = req.file;
  if (!file) {
    throw new AppError(400, 'Upload an image file (JPG, PNG, or WebP).', 'FILE_REQUIRED');
  }

  const rawOptions = parseJsonField(req.body?.options);
  const options = parseWithSchema(photoOptionsSchema, rawOptions, res);
  if (!options) {
    fs.promises.unlink(file.path).catch(() => undefined);
    return;
  }

  const projectId = await resolveOptionalProjectId(req.body?.projectId, user.id!);
  const jobId = randomUUID();
  const jobType: MediaJobType = options.aiEnhance ? 'photo-ai-enhance' : 'photo-render';

  const job = await MediaJob.create({
    id: jobId,
    userId: user.id!,
    projectId,
    mediaType: 'photo',
    jobType,
    status: 'queued',
    progress: 0,
    stage: 'Queued for photo rendering',
    originalFileName: file.originalname.slice(0, 255),
    inputPath: file.path,
    options: options as PhotoEditOptions as Record<string, unknown>,
    resultMetadata: {},
  } as MediaJob);

  await enqueueMediaJob(job.id);
  res.status(202).json({ success: true, job: serializeJob(job) });
}

export async function createVideoJobController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const file = req.file;
  if (!file) {
    throw new AppError(400, 'Upload a video file (MP4, WebM, or MOV).', 'FILE_REQUIRED');
  }

  const rawOptions = parseJsonField(req.body?.options);
  const options = parseWithSchema(videoOptionsSchema, rawOptions, res);
  if (!options) {
    fs.promises.unlink(file.path).catch(() => undefined);
    return;
  }

  const projectId = await resolveOptionalProjectId(req.body?.projectId, user.id!);
  const jobId = randomUUID();

  const job = await MediaJob.create({
    id: jobId,
    userId: user.id!,
    projectId,
    mediaType: 'video',
    jobType: 'video-render',
    status: 'queued',
    progress: 0,
    stage: 'Queued for video transcoding',
    originalFileName: file.originalname.slice(0, 255),
    inputPath: file.path,
    options: options as VideoEditOptions as Record<string, unknown>,
    resultMetadata: {},
  } as MediaJob);

  await enqueueMediaJob(job.id);
  res.status(202).json({ success: true, job: serializeJob(job) });
}

export async function createAiVideoAnalysisJobController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const file = req.file;
  if (!file) {
    throw new AppError(400, 'Upload a video file to run AI analysis.', 'FILE_REQUIRED');
  }

  const parsed = parseWithSchema(
    z.object({
      mode: z.enum(['smart-trim', 'highlights', 'auto-caption']),
      topic: z.string().max(160).optional(),
    }),
    { mode: req.body?.mode, topic: req.body?.topic },
    res
  );
  if (!parsed) {
    fs.promises.unlink(file.path).catch(() => undefined);
    return;
  }

  const jobType: MediaJobType =
    parsed.mode === 'smart-trim'
      ? 'video-smart-trim'
      : parsed.mode === 'highlights'
        ? 'video-highlights'
        : 'video-auto-caption';

  const job = await MediaJob.create({
    id: randomUUID(),
    userId: user.id!,
    projectId: null,
    mediaType: 'video',
    jobType,
    status: 'queued',
    progress: 0,
    stage: `Queued for AI ${parsed.mode}`,
    originalFileName: file.originalname.slice(0, 255),
    inputPath: file.path,
    options: { mode: parsed.mode, topic: parsed.topic || '' },
    resultMetadata: {},
  } as unknown as MediaJob);

  await enqueueMediaJob(job.id);
  res.status(202).json({ success: true, job: serializeJob(job) });
}

export async function generateAiCopyController(req: Request, res: Response): Promise<void> {
  requireAuthUser(req);
  const parsed = parseWithSchema(
    z.object({
      topic: z.string().trim().min(1).max(160),
      mediaType: z.enum(['photo', 'video']).default('video'),
      durationSeconds: z.coerce.number().min(0).optional(),
      captionHints: z.array(z.string().max(200)).max(10).optional(),
      tone: z.string().max(60).optional(),
    }),
    req.body,
    res
  );
  if (!parsed) return;

  const result = await generateAiSocialCopy(parsed);
  res.json({ success: true, ...result });
}

export async function listMediaJobsController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const jobs = await MediaJob.findAll({
    where: { userId: user.id! },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json({ success: true, jobs: jobs.map(serializeJob) });
}

export async function getMediaJobController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const job = await MediaJob.findOne({ where: { id: req.params.id, userId: user.id! } });
  if (!job) {
    throw new AppError(404, 'Media job not found.', 'JOB_NOT_FOUND');
  }
  res.json({ success: true, job: serializeJob(job) });
}

export async function streamMediaJobEventsController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const job = await MediaJob.findOne({ where: { id: req.params.id, userId: user.id! } });
  if (!job) {
    throw new AppError(404, 'Media job not found.', 'JOB_NOT_FOUND');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    outputUrl: job.status === 'completed' && job.outputPath ? `/api/media/jobs/${job.id}/output` : null,
    width: job.width,
    height: job.height,
    durationSeconds: job.durationSeconds ? Number(job.durationSeconds) : null,
    fileSizeBytes: job.fileSizeBytes ? Number(job.fileSizeBytes) : null,
    resultMetadata: job.resultMetadata,
    errorMessage: job.errorMessage,
  });

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    res.end();
    return;
  }

  const unsubscribe = subscribeToJobProgress(job.id, (event) => {
    sendEvent(event);
    if (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled') {
      cleanup();
      res.end();
    }
  });

  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', cleanup);
}

export async function streamMediaJobOutputController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const job = await MediaJob.findOne({ where: { id: req.params.id, userId: user.id! } });
  if (!job) {
    throw new AppError(404, 'Media job not found.', 'JOB_NOT_FOUND');
  }
  if (job.status !== 'completed' || !job.outputPath || !fs.existsSync(job.outputPath)) {
    throw new AppError(404, 'Rendered media output is not available yet.', 'OUTPUT_NOT_READY');
  }

  const stat = await fs.promises.stat(job.outputPath);
  const total = stat.size;
  const mimeType = job.outputMimeType || 'application/octet-stream';
  const ext = path.extname(job.outputPath) || (job.mediaType === 'video' ? '.mp4' : '.png');
  const downloadName = `${sanitizeFileName(job.originalFileName || 'easecontent-export')}${ext}`;

  if (req.query.download === '1' || req.query.download === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  }

  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }
    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Math.min(Number.parseInt(match[2], 10), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(end - start + 1));
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(job.outputPath, { start, end }).pipe(res);
    return;
  }

  res.status(200);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(total));
  res.setHeader('Content-Type', mimeType);
  fs.createReadStream(job.outputPath).pipe(res);
}

export async function deleteMediaJobController(req: Request, res: Response): Promise<void> {
  const user = requireAuthUser(req);
  const job = await MediaJob.findOne({ where: { id: req.params.id, userId: user.id! } });
  if (!job) {
    throw new AppError(404, 'Media job not found.', 'JOB_NOT_FOUND');
  }

  if (job.inputPath) fs.promises.unlink(job.inputPath).catch(() => undefined);
  if (job.outputPath) fs.promises.unlink(job.outputPath).catch(() => undefined);

  await job.destroy();
  logger.info('Deleted media job and assets', { jobId: job.id, userId: user.id });
  res.json({ success: true, message: 'Media job deleted.' });
}
