import 'dotenv/config';
import { connection } from './database/connection';
import {
  closeMediaQueueResources,
  isRedisConfigured,
  startBullMqWorker,
} from './queue/media.queue';
import { checkFfmpegAvailable, getMediaStorageRoot } from './services/media-processor.service';
import logger from './shared/logger.util';

process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'easecontent-worker';

async function connectDatabaseWithRetry(maxAttempts = 10, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await connection.authenticate();
      logger.info('Worker connected to MySQL database');
      return;
    } catch (error) {
      logger.warn('Worker waiting for MySQL database...', {
        attempt,
        maxAttempts,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function startWorker(): Promise<void> {
  if (!isRedisConfigured()) {
    throw new Error(
      'REDIS_URL must be set to run the standalone EASEContent media worker process.'
    );
  }

  getMediaStorageRoot();
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    logger.warn('FFmpeg binary was not found in PATH; video/photo render jobs will fail.');
  } else {
    logger.info('FFmpeg binary verified for media worker');
  }

  await connectDatabaseWithRetry();

  const worker = startBullMqWorker();
  logger.info('EASEContent async media worker started and listening for jobs');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Worker received shutdown signal', { signal });
    await worker.close();
    await closeMediaQueueResources();
    await connection.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

startWorker().catch((error) => {
  logger.error('Failed to start EASEContent media worker', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
