<<<<<<< HEAD

=======
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
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

<<<<<<< HEAD
// Allowed frontend origins for local development.
// FRONTEND_URL in backend/.env can add other trusted origins.
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

=======
// Allowed origins from environment variable, plus common local development ports (Vite: 5173, React: 3000, Angular: 4200)
const defaultLocalOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4200'];
const envOrigins = (process.env.FRONTEND_URL || '').split(',').map(v => v.trim()).filter(Boolean);
const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultLocalOrigins]));

app.disable('x-powered-by');
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

<<<<<<< HEAD
// CORS: allow only explicitly listed origins.
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
=======
app.use(cors({ 
  origin(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  }, 
  credentials: true 
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

<<<<<<< HEAD
// Authentication rate limiter.
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
=======
const authRequests = new Map<string, { count: number; resetAt: number }>();
app.use('/api/auth', (req, res, next) => {
  const key = req.ip || 'unknown'; const now = Date.now(); const current = authRequests.get(key);
  if (!current || current.resetAt <= now) authRequests.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else if (++current.count > 100) { res.status(429).json({ message: 'Too many authentication requests. Try again later.' }); return; }
  next();
});

app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'cms-api' }));
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/editor', editorRoutes);

<<<<<<< HEAD
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
  _next: NextFunction
) => {
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
=======
app.use((_req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ message: err.message, stack: process.env.NODE_ENV === 'production' ? undefined : err.stack });
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ message: status === 500 ? 'An unexpected server error occurred.' : err.message });
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
});

async function start() {
  try {
<<<<<<< HEAD
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
=======
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters in backend/.env.');
    await connection.authenticate();
    app.listen(port, () => logger.info({ message: `CMS API listening on port ${port}` }));
  } catch (error) {
    logger.error({ message: 'API startup failed', stack: error instanceof Error ? error.stack : String(error) });
    process.exit(1);
  }
}
void start();
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
