# EASEContent

**EASEContent** is an integrated content management, AI-assisted photo and video editing, and direct YouTube publishing platform built with Angular 18, Tailwind CSS, Express + TypeScript, MySQL 8, Redis/BullMQ, and FFmpeg.

---

## Key Capabilities

- **Content Workspace & Publishing:** Manage articles, categories, tags, and comment moderation with JWT access/refresh sessions and bcrypt password security.
- **AI Photo & Video Creative Studio (`/editor`):**
  - **Photo Editing:** Interactive Fabric.js canvas, crop & aspect-ratio presets (`Original`, `16:9`, `9:16`, `1:1`, `4:5`, `4:3`), rotate/flip, brightness/contrast/saturation/exposure/sharpness adjustments, LUT/filter presets, text & shape overlays, browser AI portrait background blur (MediaPipe), browser AI background removal (RMBG-1.4), async server AI Smart Enhance, and PNG/JPEG/WebP quality export controls.
  - **Video Editing:** Timeline trimming, playback speed (`0.5x–2x`), aspect-ratio framing (`9:16` Shorts/Reels, `16:9` YouTube, `1:1`, `4:5`, `Original`) with crop/letterbox modes, volume/mute/audio normalization (`loudnorm`), color filters/LUTs, fade-in/fade-out transitions, live timed subtitles/captions overlay burned into MP4 exports, and AI video helpers (**AI Smart Trim** via silence detection, **AI Highlight Finder** via scene detection, **AI Auto-Captions**, and **AI Title & Description Generator**).
  - **Async Background Rendering:** Heavy FFmpeg rendering and AI analysis run asynchronously via BullMQ + Redis workers (with an automatic in-process async fallback for single-machine local dev) and stream live progress over Server-Sent Events (SSE) with instant preview playback before publishing.
- **Email-Bound YouTube Publishing:**
  - Directly publish rendered MP4s or uploaded videos from the Creative Studio modal via the **YouTube Data API v3**.
  - OAuth tokens are encrypted at rest (AES-256-GCM) and **strictly verified against the logged-in user's EASEContent email** (`login_hint` + Google `userinfo` verification) to prevent cross-account uploads and prompt re-authorization if missing, expired, or mismatched.
  - Every upload is saved to the user's EASEContent publish history with its YouTube link, visibility status, and channel metadata.

---

## Architecture Overview

```text
┌───────────────────────────┐         ┌──────────────────────────────┐
│  web (Angular 18 + Nginx) │──/api──▶│  api (Express + TypeScript)  │
│  Port 8080 -> 80          │◀──SSE───│  Port 5000 · /health /ready  │
└───────────────────────────┘         └───────┬──────────────┬───────┘
                                              │              │
                                              ▼              ▼
                                     ┌────────────┐   ┌─────────────┐
                                     │  MySQL 8   │   │   Redis 7   │
                                     │  Metadata  │   │ BullMQ + Pub│
                                     └────────────┘   └──────┬──────┘
                                                             │
                                                             ▼
                                     ┌──────────────────────────────┐
                                     │  worker (Node 20 + FFmpeg)   │
                                     │  Async Video/Photo & AI Jobs │
                                     │  Shared Volume: /storage     │
                                     └──────────────────────────────┘
```

### Repository Structure

- `frontend/` — Angular 18 application (`public`, `admin`, and lazy-loaded `features/media-studio` at `/editor`) + multi-stage Nginx `Dockerfile`.
- `backend/` — Express/TypeScript API (`src/index.ts`), standalone BullMQ worker (`src/worker.ts`), Sequelize models, FFmpeg media processor, email-bound YouTube OAuth service, Vitest test suite (`tests/`), and multi-stage `Dockerfile` (`api` and `worker` targets).
- `database/` — Additive MySQL 8+ migrations for editor projects, export history, async media jobs, encrypted YouTube OAuth accounts, and YouTube publish history.
- `.github/workflows/` — `ci.yml` (lint, typecheck, test, build, Docker validation) and `cd.yml` (GHCR container image publishing and automated deployment).
- `docker-compose.yml` — Full local/self-hosted orchestration (`mysql`, `redis`, `api`, `worker`, `web`).

---

## Local Development Setup

### Prerequisites

- **Node.js 20+** and **npm**
- **MySQL 8+**
- **FFmpeg** and **FFprobe** installed in `PATH` (required for server-side photo/video rendering and AI trim/highlight analysis)
- **Redis 7+** *(optional for local dev — if `REDIS_URL` is empty, the API uses its built-in in-process async worker)*

### 1. Configure Environment Variables

Copy the environment templates and fill in your credentials:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Set at minimum:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET` (at least 32 random characters)
- `TOKEN_ENCRYPTION_KEY` (at least 32 random characters for encrypting YouTube OAuth tokens)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (for YouTube publishing)

### 2. Initialize Database

Create the MySQL database and initialize tables:

```sql
CREATE DATABASE easecontent CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
cd backend
npm ci
npm run db:init
```

For existing production databases, review and run the additive SQL migrations in `database/migrations/` instead of auto-syncing.

### 3. Run the Backend API (and Optional Worker)

```bash
cd backend
npm run dev
```

If `REDIS_URL` is configured, start the standalone worker in another terminal:

```bash
cd backend
npm run dev:worker
```

Verify health endpoints:
- Liveness: `GET http://localhost:5000/health` (and `/api/health`)
- Readiness (MySQL + Queue + FFmpeg): `GET http://localhost:5000/ready` (and `/api/ready`)

### 4. Run the Angular Frontend

```bash
cd frontend
npm ci
npm start
```

Open `http://localhost:4200`. Register/sign in and navigate to `/#/editor` for the AI Creative Studio or `/#/admin` for the workspace dashboard.

### 5. Run Tests & Builds

```bash
# Backend typecheck, build, and Vitest test suite (including FFmpeg integration tests)
cd backend
npm run lint
npm run build
npm test

# Frontend production build
cd ../frontend
npm run build -- --configuration production
```

---

## YouTube OAuth Setup (Email-Bound Publishing)

EASEContent enforces that the Google account authorized for YouTube uploads **matches the logged-in user's EASEContent email**.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project.
2. Enable the **YouTube Data API v3**.
3. Configure the **OAuth consent screen**:
   - Add scopes:
     - `https://www.googleapis.com/auth/youtube.upload`
     - `https://www.googleapis.com/auth/youtube.readonly`
     - `openid`, `email`, `profile`
   - While in Testing mode, add your EASEContent login email(s) under **Test users**.
4. Create **Credentials → OAuth 2.0 Client ID (Web application)**:
   - Authorized redirect URIs:
     - Local dev: `http://localhost:5000/api/youtube/callback`
     - Docker Compose: `http://localhost:8080/api/youtube/callback`
     - Production: `https://<your-domain>/api/youtube/callback`
5. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` to `.env` / `backend/.env`.
6. In the EASEContent Creative Studio (`/editor`), click **Publish to YouTube** → **Connect YouTube**, sign in with the **same email** used for EASEContent, enter a title and multi-line caption/description, and upload!

---

## Docker & Docker Compose Usage

Run the complete stack (`web`, `api`, `worker`, `mysql`, `redis`) with one command:

```bash
cp .env.example .env
# Edit .env with strong passwords, JWT_SECRET, TOKEN_ENCRYPTION_KEY, and Google OAuth credentials
docker compose up -d --build
```

- Web App (via Nginx reverse proxy): `http://localhost:8080`
- API Health: `http://localhost:8080/health`
- API Readiness: `http://localhost:8080/ready`
- View logs: `docker compose logs -f api worker`
- Stop stack: `docker compose down`

---

## CI/CD with GitHub Actions

### Continuous Integration (`.github/workflows/ci.yml`)
Triggered on pull requests and pushes to `main` and `develop`:
1. **`backend-ci`:** Installs FFmpeg + Node 20, runs `npm ci`, `npm run lint`, `npm run build`, and `npm test` (Vitest + Supertest + FFmpeg pipeline tests).
2. **`frontend-ci`:** Installs Node 20, runs `npm ci`, TypeScript typecheck, and `ng build --configuration production`.
3. **`docker-build-validation`:** Validates `docker-compose.yml` and builds `api`, `worker`, and `web` Docker images with Buildx layer caching.

### Continuous Deployment (`.github/workflows/cd.yml`)
Triggered on pushes to `main`, semver tags (`v*.*.*`), or manual `workflow_dispatch`:
1. Builds and pushes container images to GitHub Container Registry (`ghcr.io/<owner>/easecontent-{api,worker,web}`).
2. Runs automated rollout when repository deployment secrets are configured:
   - **SSH Compose Deploy:** `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, optional `DEPLOY_PATH` (default `/opt/easecontent`).
   - **Webhook Deploy (alternative):** `DEPLOY_WEBHOOK_URL` and `DEPLOY_WEBHOOK_TOKEN`.
   - **Optional Build Variable:** `PUBLIC_API_URL` (repository variable; leave empty when serving API via Nginx `/api`).
