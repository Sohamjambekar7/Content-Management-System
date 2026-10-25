# ContentDesk CMS

An Angular 18 + TypeScript + Tailwind CSS frontend with an Express/TypeScript API and MySQL persistence. This repository is the cleaned-up, deployable starting point for the supplied CMS project.

## Requirements

- Node.js 20 LTS or newer (use the same major version locally and in deployment)
- npm
- MySQL 8+

## 1. Configure MySQL

Create a database and a dedicated user; do not deploy with the MySQL `root` account. Example (change credentials):

```sql
CREATE DATABASE cms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cms_user'@'localhost' IDENTIFIED BY 'replace_with_a_long_random_password';
GRANT ALL PRIVILEGES ON cms_db.* TO 'cms_user'@'localhost';
FLUSH PRIVILEGES;
```

For a brand-new empty database only, run `npm run db:init` from `backend/` to create missing tables. This does not modify existing tables. Do not use schema sync as a substitute for reviewed production migrations. Use the schema already supplied by your project/database. See [`database/README.md`](database/README.md) for the reported `Posts.categoryId` mismatch and a migration. Back up your data before applying schema changes.

## 2. Start the API

```bash
cd backend
copy .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
npm ci
```

Edit `backend/.env` with your database credentials, a strong random `JWT_SECRET` of at least 32 characters, and your frontend/backend URLs. Email confirmation and password reset require a working Resend API key and a sender address/domain verified with Resend; set `EMAIL_FROM` to a sender address/domain verified with Resend before production. Never commit `.env`.

Then run:

```bash
npm run dev
```

API health check: `http://localhost:5000/api/health`. For production: `npm run build` then `npm start`. `npm start` runs compiled JavaScript from `dist/index.js`; do not run TypeScript source with `node`.

## 3. Start the Angular frontend

Open a second terminal:

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:4200`. Development API URL is in `src/environments/environment.development.ts`. For production, replace `BACKEND_API_URL` in `src/environments/environment.ts` with the public HTTPS API URL, then build:

```bash
npm run build
```

Deploy the Angular `dist/frontend/browser` output to a static host (for example, Nginx, Netlify, or Cloudflare Pages). Deploy the Node API to a Node host or container and MySQL to a managed database. Set `FRONTEND_URL` to the exact deployed frontend origin in the backend environment. Both hosts must use HTTPS in production.

## 4. Deploy checklist

- [ ] Use production secrets in host environment variables; never upload `.env`.
- [ ] Rotate any credentials or API keys that were previously included in an archive or Git history.
- [ ] Back up MySQL and apply/review migrations before release.
- [ ] Configure a verified email sender and Resend API key if using email confirmation/reset.
- [ ] Set `NODE_ENV=production`, `JWT_SECRET`, `FRONTEND_URL`, and database environment variables.
- [ ] Set Angular `BACKEND_API_URL` to the HTTPS API domain and rebuild.
- [ ] Test registration, email confirmation, login/logout, create/edit/delete posts, categories, tags, comments, and public post listing.
- [ ] Confirm `/api/health` responds and review host logs.

## Architecture

- `frontend/`: Angular standalone components, routing, reactive forms, API services, auth guard/interceptors, Tailwind CSS and Angular Material.
- `backend/`: Express REST API, Zod request validation, Sequelize models/services, JWT sessions and bcrypt password hashing.
- `database/`: migration notes and SQL for the known missing category foreign key.

## Important notes

This is a source-level remediation, not a claim of a verified zero-error production deployment. The environment used to prepare this archive has no npm network access and the original archive did not include installable dependencies, so run `npm ci`, `npm run typecheck`, and `npm run build` on your machine before deployment. Fix any schema-specific migration differences against your real MySQL database.


## AI Photo & Video Editor

- Visit `/#/editor` to open the new standalone editor. Existing routes and admin/public modules remain unchanged.
- Photo canvas controls (brightness, contrast, sharpening and centered crop) and PNG/JPG export run in-browser. Background removal uses `@huggingface/transformers` with RMBG-1.4; the initial model download requires a network connection and may be large. Browser caching can avoid repeated downloads. It is not guaranteed to work offline before the model is cached or on browsers without suitable WASM/WebGPU support.
- Video preview, aspect-ratio framing, trim controls and WebM recording use browser APIs. Browser canvas recording does not preserve original audio and is not an MP4 encoder; exported output is WebM. A production-grade MP4/audio-preserving pipeline would require a separately integrated browser encoder such as FFmpeg.wasm, with substantial download/performance costs.
- Native `navigator.share()` is attempted on supported mobile browsers. Instagram/YouTube control the final upload/publish step; the editor does not use private APIs or publish directly to accounts. Desktop users can prepare metadata and download a file for manual upload.
- The `/api/editor` endpoints require the existing JWT bearer token and persist only project/export metadata, never media bytes. Run the additive SQL migration in `database/migrations/` after checking your existing `Users` table naming.
- Install frontend dependencies with `npm install` (the frontend lockfile was omitted because the new Transformers dependency could not be resolved in this offline environment; commit the generated lockfile after a network-enabled install) before running `npm run build`. Validate `npm run typecheck` and `npm run build` for the backend, and `npm run build` for the frontend in your deployment environment.
