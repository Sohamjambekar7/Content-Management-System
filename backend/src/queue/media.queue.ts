import { EventEmitter } from 'events';
import fs from 'fs';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MediaJob, MediaJobStatus } from '../models/MediaJob';
import { ExportHistory } from '../models/ExportHistory';
import {
  analyzeVideoForAi,
  PhotoEditOptions,
  processPhotoJob,
  processVideoJob,
  VideoEditOptions,
} from '../services/media-processor.service';
import logger from '../shared/logger.util';

export const MEDIA_QUEUE_NAME = 'easecontent-media-jobs';
const PROGRESS_CHANNEL = 'easecontent:media:progress';

export interface MediaJobProgressEvent {
  jobId: string;
  status: MediaJobStatus;
  progress: number;
  stage: string;
  outputUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  resultMetadata?: Record<string, unknown>;
  errorMessage?: string | null;
}

const localEvents = new EventEmitter();
localEvents.setMaxListeners(200);

let bullQueue: Queue | null = null;
let redisPub: IORedis | null = null;
let redisSub: IORedis | null = null;
let redisSubInitialized = false;

const inProcessQueue: string[] = [];
let activeInProcessWorkers = 0;
const maxLocalConcurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 2));

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0);
}

export function createRedisConnection(label: string): IORedis {
  const url = process.env.REDIS_URL!;
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (err) => {
    logger.warn('Redis connection error', { label, error: err.message });
  });
  return client;
}

function getBullQueue(): Queue {
  if (!bullQueue) {
    bullQueue = new Queue(MEDIA_QUEUE_NAME, {
      connection: createRedisConnection('bullmq-queue'),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return bullQueue;
}

async function publishProgress(event: MediaJobProgressEvent): Promise<void> {
  localEvents.emit(`job:${event.jobId}`, event);
  if (isRedisConfigured()) {
    try {
      if (!redisPub) {
        redisPub = createRedisConnection('progress-pub');
      }
      await redisPub.publish(PROGRESS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      logger.warn('Failed to publish Redis progress event', {
        jobId: event.jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function ensureRedisSubscriber(): void {
  if (!isRedisConfigured() || redisSubInitialized) return;
  redisSubInitialized = true;
  redisSub = createRedisConnection('progress-sub');
  redisSub.subscribe(PROGRESS_CHANNEL).catch((err) => {
    logger.warn('Failed to subscribe to Redis progress channel', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
  redisSub.on('message', (_channel, raw) => {
    try {
      const event = JSON.parse(raw) as MediaJobProgressEvent;
      if (event?.jobId) {
        localEvents.emit(`job:${event.jobId}`, event);
      }
    } catch {
      // ignore malformed messages
    }
  });
}

export function subscribeToJobProgress(
  jobId: string,
  handler: (event: MediaJobProgressEvent) => void
): () => void {
  ensureRedisSubscriber();
  const key = `job:${jobId}`;
  localEvents.on(key, handler);
  return () => {
    localEvents.off(key, handler);
  };
}

export async function checkQueueReadiness(): Promise<{
  mode: 'redis-bullmq' | 'in-process';
  healthy: boolean;
}> {
  if (!isRedisConfigured()) {
    return { mode: 'in-process', healthy: true };
  }
  try {
    if (!redisPub) {
      redisPub = createRedisConnection('health-check');
    }
    const pong = await redisPub.ping();
    return { mode: 'redis-bullmq', healthy: pong === 'PONG' };
  } catch {
    return { mode: 'redis-bullmq', healthy: false };
  }
}

export async function executeMediaJob(jobId: string): Promise<void> {
  const job = await MediaJob.findByPk(jobId);
  if (!job) {
    logger.warn('Media job record not found during execution', { jobId });
    return;
  }

  if (job.status === 'cancelled') {
    logger.info('Skipping cancelled media job', { jobId });
    return;
  }

  const updateProgress = async (progress: number, stage: string): Promise<void> => {
    await job.update({ status: 'processing', progress, stage });
    await publishProgress({
      jobId: job.id,
      status: 'processing',
      progress,
      stage,
    });
  };

  try {
    await updateProgress(5, 'Worker picked up job');

    if (!job.inputPath || !fs.existsSync(job.inputPath)) {
      throw new Error('Source media file is missing from storage.');
    }

    if (job.jobType === 'photo-render' || job.jobType === 'photo-ai-enhance') {
      const options: PhotoEditOptions = {
        ...(job.options as PhotoEditOptions),
        aiEnhance: job.jobType === 'photo-ai-enhance' || Boolean(job.options?.aiEnhance),
      };

      const result = await processPhotoJob(job.inputPath, job.id, options, updateProgress);

      await job.update({
        status: 'completed',
        progress: 100,
        stage: 'Completed',
        outputPath: result.outputPath,
        outputMimeType: result.mimeType,
        width: result.width || null,
        height: result.height || null,
        durationSeconds: null,
        fileSizeBytes: result.fileSizeBytes,
        resultMetadata: result.metadata,
        errorMessage: null,
      });

      await ExportHistory.create({
        userId: job.userId,
        projectId: job.projectId,
        format: String(result.metadata.format || 'png'),
        width: result.width || undefined,
        height: result.height || undefined,
        platform: 'studio-render',
        metadata: { mediaJobId: job.id, ...result.metadata },
      } as unknown as ExportHistory).catch((err) => {
        logger.warn('Could not persist photo render export history', {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await publishProgress({
        jobId: job.id,
        status: 'completed',
        progress: 100,
        stage: 'Completed',
        outputUrl: `/api/media/jobs/${job.id}/output`,
        width: result.width,
        height: result.height,
        fileSizeBytes: result.fileSizeBytes,
        resultMetadata: result.metadata,
      });
    } else if (job.jobType === 'video-render') {
      const options = job.options as VideoEditOptions;
      const result = await processVideoJob(job.inputPath, job.id, options, updateProgress);

      await job.update({
        status: 'completed',
        progress: 100,
        stage: 'Completed',
        outputPath: result.outputPath,
        outputMimeType: result.mimeType,
        width: result.width || null,
        height: result.height || null,
        durationSeconds: result.durationSeconds,
        fileSizeBytes: result.fileSizeBytes,
        resultMetadata: result.metadata,
        errorMessage: null,
      });

      await ExportHistory.create({
        userId: job.userId,
        projectId: job.projectId,
        format: 'mp4',
        width: result.width || undefined,
        height: result.height || undefined,
        durationSeconds: result.durationSeconds ?? undefined,
        platform: 'studio-render',
        metadata: { mediaJobId: job.id, ...result.metadata },
      } as unknown as ExportHistory).catch((err) => {
        logger.warn('Could not persist video render export history', {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await publishProgress({
        jobId: job.id,
        status: 'completed',
        progress: 100,
        stage: 'Completed',
        outputUrl: `/api/media/jobs/${job.id}/output`,
        width: result.width,
        height: result.height,
        durationSeconds: result.durationSeconds,
        fileSizeBytes: result.fileSizeBytes,
        resultMetadata: result.metadata,
      });
    } else if (
      job.jobType === 'video-smart-trim' ||
      job.jobType === 'video-highlights' ||
      job.jobType === 'video-auto-caption'
    ) {
      const mode =
        job.jobType === 'video-smart-trim'
          ? 'smart-trim'
          : job.jobType === 'video-highlights'
            ? 'highlights'
            : 'auto-caption';
      await updateProgress(40, `Running AI ${mode} analysis`);
      const analysis = await analyzeVideoForAi(
        job.inputPath,
        mode,
        typeof job.options?.topic === 'string' ? job.options.topic : job.originalFileName || undefined
      );

      await job.update({
        status: 'completed',
        progress: 100,
        stage: 'AI analysis complete',
        resultMetadata: analysis,
        errorMessage: null,
      });

      await publishProgress({
        jobId: job.id,
        status: 'completed',
        progress: 100,
        stage: 'AI analysis complete',
        resultMetadata: analysis,
      });
    } else {
      throw new Error(`Unsupported media job type: ${job.jobType}`);
    }

    // Clean up temporary input upload once finished to keep disk usage bounded
    if (job.inputPath) {
      fs.promises.unlink(job.inputPath).catch(() => undefined);
    }

    logger.info('Media job completed', { jobId: job.id, jobType: job.jobType, userId: job.userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media processing failed.';
    logger.error('Media job failed', { jobId: job.id, jobType: job.jobType, error: message });
    await job.update({
      status: 'failed',
      stage: 'Failed',
      errorMessage: message,
    });
    await publishProgress({
      jobId: job.id,
      status: 'failed',
      progress: job.progress,
      stage: 'Failed',
      errorMessage: message,
    });
  }
}

function drainInProcessQueue(): void {
  while (activeInProcessWorkers < maxLocalConcurrency && inProcessQueue.length > 0) {
    const nextJobId = inProcessQueue.shift();
    if (!nextJobId) break;
    activeInProcessWorkers += 1;
    void executeMediaJob(nextJobId).finally(() => {
      activeInProcessWorkers -= 1;
      drainInProcessQueue();
    });
  }
}

export async function enqueueMediaJob(jobId: string): Promise<void> {
  if (isRedisConfigured()) {
    const queue = getBullQueue();
    await queue.add('process-media', { jobId }, { jobId });
    logger.info('Media job enqueued in BullMQ', { jobId });
    return;
  }

  inProcessQueue.push(jobId);
  logger.info('Media job enqueued in local async worker', { jobId });
  setImmediate(() => drainInProcessQueue());
}

export function startBullMqWorker(): Worker {
  const worker = new Worker(
    MEDIA_QUEUE_NAME,
    async (bullJob) => {
      const { jobId } = bullJob.data as { jobId: string };
      await executeMediaJob(jobId);
    },
    {
      connection: createRedisConnection('bullmq-worker'),
      concurrency: maxLocalConcurrency,
    }
  );

  worker.on('completed', (job) => {
    logger.info('BullMQ worker finished job', { bullJobId: job.id });
  });
  worker.on('failed', (job, err) => {
    logger.error('BullMQ worker job failed', { bullJobId: job?.id, error: err.message });
  });

  return worker;
}

export async function closeMediaQueueResources(): Promise<void> {
  await Promise.allSettled([
    bullQueue?.close(),
    redisPub?.quit(),
    redisSub?.quit(),
  ]);
  bullQueue = null;
  redisPub = null;
  redisSub = null;
  redisSubInitialized = false;
}
