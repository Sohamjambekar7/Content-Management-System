import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import {
  createAiVideoAnalysisJobController,
  createPhotoJobController,
  createVideoJobController,
  deleteMediaJobController,
  generateAiCopyController,
  getMediaJobController,
  listMediaJobsController,
  streamMediaJobEventsController,
  streamMediaJobOutputController,
} from '../controllers/media.controller';
import { getMediaStorageRoot } from '../services/media-processor.service';
import { authenticateJWT, authenticateJWTStream } from '../shared/auth.util';
import { AppError } from '../shared/http.util';

const router = Router();

const uploadDir = path.join(getMediaStorageRoot(), 'uploads');

const photoUpload = multer({
  dest: uploadDir,
  limits: { fileSize: Number(process.env.MAX_PHOTO_UPLOAD_BYTES || 25 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new AppError(400, 'Upload a JPG, PNG, or WebP photo.', 'UNSUPPORTED_IMAGE'));
    }
    cb(null, true);
  },
});

const videoUpload = multer({
  dest: uploadDir,
  limits: { fileSize: Number(process.env.MAX_VIDEO_UPLOAD_BYTES || 512 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new AppError(400, 'Upload a valid video file (MP4, WebM, or MOV).', 'UNSUPPORTED_VIDEO'));
    }
    cb(null, true);
  },
});

router.post('/jobs/photo', authenticateJWT, photoUpload.single('file'), createPhotoJobController);
router.post('/jobs/video', authenticateJWT, videoUpload.single('file'), createVideoJobController);
router.post('/ai/analyze', authenticateJWT, videoUpload.single('file'), createAiVideoAnalysisJobController);
router.post('/ai/copy', authenticateJWT, generateAiCopyController);
router.get('/jobs', authenticateJWT, listMediaJobsController);
router.get('/jobs/:id', authenticateJWT, getMediaJobController);
router.get('/jobs/:id/events', authenticateJWTStream, streamMediaJobEventsController);
router.get('/jobs/:id/output', authenticateJWTStream, streamMediaJobOutputController);
router.delete('/jobs/:id', authenticateJWT, deleteMediaJobController);

export default router;
