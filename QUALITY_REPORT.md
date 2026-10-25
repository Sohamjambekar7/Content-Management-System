# Source review and remediation report

## Reviewed

- Angular application routes, standalone UI components, forms, services, auth guard/interceptors, environment configuration, Tailwind/PostCSS configuration, and Angular build configuration.
- Express API entry point, routes, controllers, services, Sequelize models/database setup, JWT/password utilities, email helpers, and package/build configuration.
- Existing backend error log and project Dockerfiles.

## High-impact changes

- Replaced the mismatched Tailwind v4 PostCSS plugin dependency with the Tailwind v3 PostCSS configuration already used by this Angular project.
- Fixed backend development/start scripts so TypeScript is compiled or run through `tsx`; corrected the Docker API port.
- Added `/api/health`, startup database authentication, controlled CORS, basic security headers, JSON request-size limits, authentication-request throttling, and JSON error responses.
- Changed password storage to bcrypt (cost factor 12), with a compatibility check that upgrades old JWT-encoded password records after a successful login.
- Added explicit access/refresh/activation/reset token purposes, access-token revocation checks, and frontend automatic refresh/retry behavior.
- Removed hard-coded category owner ID, implemented category update/delete, enforced category/tag ownership on content operations, and added a post-owner comments moderation view.
- Added a database initialization command for an empty database and a reviewed migration note for the logged `Posts.categoryId` schema mismatch.
- Updated admin/public shell and article cards, responsive table wrappers, form validation feedback, loading states, and inline auth messages.
- Added environment templates, Docker ignore files, deployment instructions, and removed the original `.env`, error log, Git history, and dependency folders from this delivery archive.

## Validation performed here

- Parsed package JSON, lockfile JSON, Angular JSON, TypeScript configuration JSONC, and PostCSS configuration.
- Ran TypeScript syntax diagnostics on backend and frontend sources; no TypeScript parser/syntax diagnostics were reported.
- A full dependency-aware Angular/Node build could not be run because npm registry access is unavailable in the preparation environment and project dependencies are not installed here.

## Must verify before deployment

1. Run `npm ci`, `npm run typecheck`, and `npm run build` in `backend/` on your machine.
2. Run `npm ci` and `npm run build` in `frontend/`.
3. Back up MySQL and compare the migration in `database/README.md` with the real table names/foreign keys before applying it.
4. Set production secrets, a verified email sender/domain, and the deployed frontend/API URLs.
5. Exercise registration/email confirmation, login, token refresh, post/category/tag CRUD, comments moderation, and public post display against your database.

A zero-error deployment cannot be honestly guaranteed without running the full build against the actual database and deployment environment.
