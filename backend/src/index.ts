import 'dotenv/config';
import 'express-async-errors';

import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';

import { connection } from './database/connection';
import categoryRoutes from './routes/category.routes';
import tagRoutes from './routes/tag.routes';
import postRoutes from './routes/post.routes';
import commentRoutes from './routes/comment.routes';
import authRoutes from './routes/auth.routes';
import editorRoutes from './routes/editor.routes';
import mediaRoutes from './routes/media.routes';
import youtubeRoutes from './routes/youtube.routes';
import { checkQueueReadiness, closeMediaQueueResources } from './queue/media.queue';
import { checkFfmpegAvailable, getMediaStorageRoot } from './services/media-processor.service';
import { isYouTubeOAuthConfigured } from './services/youtube.service';
import { AppError, AuthRequest } from './shared/http.util';
import logger from './shared/logger.util';
import { requestLoggerMiddleware, securityHeadersMiddleware } from './shared/security.util';

const SERVICE_VERSION = '2.0.0';
const startedAt = Date.now();

export interface AppDependencies {
  checkDatabase?: () => Promise<boolean>;
  checkQueue?: () => Promise<{ mode: 'redis-bullmq' | 'in-process'; healthy: boolean }>;
  checkFfmpeg?: () => Promise<boolean>;
}

export function createApp(deps: AppDependencies = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const defaultDevOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:4200', 'http://127.0.0.1:4200', 'http://localhost:8080'];

  const permittedOrigins = new Set([...defaultDevOrigins, ...allowedOrigins]);

  app.use(securityHeadersMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/+$/, '');
        if (permittedOrigins.has(normalized)) return callback(null, true);
        return callback(new AppError(403, `CORS blocked origin: ${origin}`, 'CORS_BLOCKED'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const checkDb =
    deps.checkDatabase ||
    (async () => {
      try {
        await connection.authenticate();
        return true;
      } catch {
        return false;
      }
    });
  const checkQueue = deps.checkQueue || checkQueueReadiness;
  const checkFfmpeg = deps.checkFfmpeg || checkFfmpegAvailable;

  // Liveness endpoint (/health and /api/health)
  const livenessHandler = (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      status: 'ok',
      service: 'easecontent-api',
      version: SERVICE_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/health', livenessHandler);
  app.get('/api/health', livenessHandler);

  // Readiness endpoint (/ready and /api/ready)
  const readinessHandler = async (_req: Request, res: Response) => {
    const [dbHealthy, queueStatus, ffmpegAvailable] = await Promise.all([
      checkDb(),
      checkQueue(),
      checkFfmpeg(),
    ]);

    const ready = dbHealthy && queueStatus.healthy;
    res.status(ready ? 200 : 503).json({
      success: ready,
      status: ready ? 'ready' : 'not_ready',
      service: 'easecontent-api',
      version: SERVICE_VERSION,
      checks: {
        database: dbHealthy ? 'up' : 'down',
        queue: {
          mode: queueStatus.mode,
          status: queueStatus.healthy ? 'up' : 'down',
        },
        ffmpeg: ffmpegAvailable ? 'available' : 'unavailable',
        youtubeOAuth: isYouTubeOAuthConfigured() ? 'configured' : 'not_configured',
      },
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/ready', readinessHandler);
  app.get('/api/ready', readinessHandler);

  // EASEContent CMS & Studio API routes
  app.use('/api/categories', categoryRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/editor', editorRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/youtube', youtubeRoutes);

  // Handle unknown routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      code: 'ROUTE_NOT_FOUND',
      message: 'API route not found.',
    });
  });

  // Central error handler
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as AuthRequest).requestId;

    if (res.headersSent) return;

    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Uploaded file exceeds the maximum allowed size.'
          : error.message;
      res.status(400).json({ success: false, code: error.code, message, requestId });
      return;
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error('Application error', {
          requestId,
          code: error.code,
          message: error.message,
          stack: error.stack,
        });
      }
      res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
        requestId,
      });
      return;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const statusCode =
      'statusCode' in err && typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;

    logger.error('Unhandled API error', {
      requestId,
      statusCode,
      message: err.message,
      stack: err.stack,
    });

    res.status(statusCode).json({
      success: false,
      code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      message: statusCode >= 500 ? 'Internal server error.' : err.message,
      requestId,
    });
  });

  return app;
}

async function connectDatabaseWithRetry(maxAttempts = 8, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await connection.authenticate();
      logger.info('Connected to MySQL database');
      if (process.env.DB_AUTO_SYNC === 'true') {
        await connection.sync();
        logger.info('Database schema synchronized (DB_AUTO_SYNC=true)');
      }
      return;
    } catch (error) {
      logger.warn('Waiting for MySQL database connection...', {
        attempt,
        maxAttempts,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function startServer(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }

  getMediaStorageRoot();
  await connectDatabaseWithRetry();

  const PORT = Number(process.env.PORT || 5000);
  const app = createApp();
  const server = app.listen(PORT, () => {
    logger.info('EASEContent API server listening', { port: PORT, version: SERVICE_VERSION });
  });

  const shutdown = async (signal: string) => {
    logger.info('Received shutdown signal; closing EASEContent API server', { signal });
    server.close(async () => {
      await closeMediaQueueResources();
      await connection.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (require.main === module) {
  startServer().catch((error: unknown) => {
    logger.error('Failed to start EASEContent API server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export default createApp;
