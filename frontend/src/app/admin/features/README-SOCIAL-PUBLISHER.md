# Updated Posts page — Social Publisher

This ZIP updates the `posts/posts-list/` files in the supplied `posts.zip`. It changes the `/admin/posts` screen into a responsive social publishing workspace with:

- image/video selection and preview
- Instagram caption and YouTube title/description/visibility fields
- Instagram and YouTube destination selection
- browser-local draft fields (the selected media file must be selected again after reloading)
- publishing request status and visible server/API errors
- responsive styling

## Important: publishing requires backend work

The supplied ZIP contains only the Angular Posts feature. It does **not** contain the Express backend, API routes, authentication/OAuth handlers, file storage, or environment configuration. Therefore, no frontend-only ZIP can honestly guarantee live posting to Instagram or YouTube.

The UI submits `multipart/form-data` to:

`POST /api/social-publishing/publish`

Form fields:
- `media`: uploaded image/video file
- `caption`: Instagram caption
- `platforms`: JSON string such as `{"instagram":true,"youtube":false}`
- `youtubeTitle`
- `youtubeDescription`
- `youtubePrivacy`: `private`, `unlisted`, or `public`

A successful response should be JSON with `success: true` and a message, or a `results` object with a per-platform `success` and `message`. The UI reports endpoint errors rather than claiming publication succeeded.

The backend still needs to:
1. Authenticate and authorize the current CMS user.
2. Validate file type, file size, metadata and selected destinations.
3. Store media safely. For Instagram's publishing API, media generally needs to be accessible to Meta at a public URL during publishing.
4. Connect an eligible Instagram Professional (Business/Creator) account with the required Meta app permissions and OAuth token.
5. Connect YouTube using Google OAuth and the YouTube Data API `youtube.upload` scope; upload the video server-side.
6. Keep client secrets and access/refresh tokens on the server, never in Angular code.
7. Return accurate per-platform success/failure statuses.

Official documentation:
- YouTube video upload API: https://developers.google.com/youtube/v3/docs/videos/insert
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing

## Install / replace

1. Back up your current `frontend/src/app/admin/features/posts/` folder.
2. Extract this ZIP. It contains the same `posts/` folder layout as the supplied archive.
3. Copy the extracted `posts/` folder into the corresponding location in your project, replacing the existing files.
4. Confirm `HttpClient` is configured in your Angular app (typically `provideHttpClient()` in `app.config.ts`, or `HttpClientModule` in the root module). Existing service-based projects commonly already have this.
5. Run your existing frontend build command and fix any project-specific integration issues before deployment.
6. Until the backend endpoint is implemented and platform OAuth is configured, the page will show a clear error when Publish is clicked; it will not publish directly from the browser.

## Scope of this ZIP

The original post editor and routes are retained. The `/admin/posts` listing screen is replaced with the social publishing workspace. Existing add/edit routes remain in the supplied files.
