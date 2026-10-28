
import 'dotenv/config';
import 'express-async-errors';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import categoryRoutes from './routes/category.routes';
import tagRoutes from './routes/tag.routes';
import postRoutes from './routes/post.routes';
import commentRoutes from './routes/comment.routes';
import authRoutes from './routes/auth.routes';
import editorRoutes from './routes/editor.routes';
import youtubeRoutes from './routes/youtube.routes';

const app = express();

const PORT = Number(process.env.PORT || 5000);

const allowedOrigins = (
  process.env.FRONTEND_URL || 'http://localhost:4200'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:5173',
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as local API tools.
      if (!origin) {
        return callback(null, true);
      }

      const permittedOrigins = [
        ...new Set([...defaultOrigins, ...allowedOrigins]),
      ];

      if (permittedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'CMS API is running',
  });
});

// Existing CMS API routes
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/editor', editorRoutes);

// YouTube OAuth and publishing routes
app.use('/api/youtube', youtubeRoutes);

// Handle unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
  });
});

// Central error handler
app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error('API error:', error.message);

    if (res.headersSent) {
      return;
    }

    const statusCode =
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode >= 500
          ? 'Internal server error'
          : error.message,
    });
  }
);

async function startServer(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be configured with at least 32 characters in backend/.env'
    );
  }

  // Start listening. Keep your existing database connection
  // check here if your project uses one during startup.
  app.listen(PORT, () => {
    console.log(`CMS API listening on port ${PORT}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Failed to start CMS API:', error);
  process.exit(1);
});

export default app;
