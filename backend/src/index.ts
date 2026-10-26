
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import cors from 'cors';

import { connection } from './database';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import commentRoutes from './routes/comment.routes';
import postRoutes from './routes/post.routes';
import tagRoutes from './routes/tag.routes';
import editorRoutes from './routes/editor.routes';
import logger from './shared/logger.util';

const app = express();
const port = Number(process.env.PORT || 5000);

// Allowed frontend origins for local development.
// Add other trusted origins in backend/.env using FRONTEND_URL.
const defaultLocalOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([...envOrigins, ...defaultLocalOrigins])
);

app.disable('x-powered-by');

// Security headers.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// CORS configuration.
app.use(cors({
  origin(origin, callback) {
    // Allow requests without an Origin header, such as curl and Postman.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.error({
      message: 'Origin is not allowed by CORS',
      origin
    });

    return callback(new Error(`Origin is not allowed by CORS: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Basic authentication rate limiter.
const authRequests = new Map<string, {
  count: number;
  resetAt: number;
}>();

app.use('/api/auth', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const current = authRequests.get(key);

  if (!current || current.resetAt <= now) {
    authRequests.set(key, {
      count: 1,
      resetAt: now + 15 * 60 * 1000
    });
  } else if (++current.count > 100) {
    res.status(429).json({
      message: 'Too many authentication requests. Try again later.'
    });
    return;
  }

  next();
});

// Health check.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'cms-api'
  });
});

// Existing API routes.
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/editor', editorRoutes);

// Not-found handler.
app.use((_req, res) => {
  res.status(404).json({
    message: 'Endpoint not found.'
  });
});

// Error handler.
app.use((
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) {
    return next(err);
  }

  logger.error({
    message: err.message,
    stack: process.env.NODE_ENV === 'production'
      ? undefined
      : err.stack
  });

  const status =
    err.status && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  res.status(status).json({
    message: status === 500
      ? 'An unexpected server error occurred.'
      : err.message
  });
});

// Start the server only after checking the database connection.
async function start(): Promise<void> {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error(
        'Set JWT_SECRET to a random value of at least 32 characters in backend/.env.'
      );
    }

    await connection.authenticate();

    app.listen(port, () => {
      logger.info({
        message: `CMS API listening on port ${port}`
      });
    });
  } catch (error) {
    logger.error({
      message: 'API startup failed',
      stack: error instanceof Error
        ? error.stack
        : String(error)
    });

    process.exit(1);
  }
}

void start();
