# syntax=docker/dockerfile:1.7

# ---- Stage 1: Build TypeScript backend & worker ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: Production runtime base (includes FFmpeg for media processing) ----
FROM node:20-alpine AS runtime-base
WORKDIR /app

RUN apk add --no-cache ffmpeg tzdata curl

ENV NODE_ENV=production \
    PORT=5000 \
    MEDIA_STORAGE_DIR=/app/storage/media

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/storage/media/uploads /app/storage/media/outputs /app/storage/media/tmp \
    && chown -R node:node /app

USER node

# ---- Stage 3a: API Server ----
FROM runtime-base AS api
ENV SERVICE_NAME=easecontent-api
EXPOSE 5000
HEALTHCHECK --interval=20s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/health || exit 1
CMD ["node", "dist/index.js"]

# ---- Stage 3b: Async Media Worker ----
FROM runtime-base AS worker
ENV SERVICE_NAME=easecontent-worker
CMD ["node", "dist/worker.js"]
