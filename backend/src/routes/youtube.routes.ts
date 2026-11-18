import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import {
  disconnectYouTubeController,
  getYouTubeConnectUrlController,
  getYouTubeHistoryController,
  getYouTubeStatusController,
  uploadYouTubeVideoController,
  youtubeCallbackController,
} from '../controllers/youtube.controller';
import { getMediaStorageRoot } from '../services/media-processor.service';
import { authenticateJWT } from '../shared/auth.util';
import { AppError } from '../shared/http.util';

const router = Router();

const uploadDir = path.join(getMediaStorageRoot(), 'uploads');
const videoUpload = multer({
  dest: uploadDir,
  limits: {
    fileSize: Number(process.env.MAX_VIDEO_UPLOAD_BYTES || 512 * 1024 * 1024),
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('video/')) {
      return callback(new AppError(400, 'Please upload a valid video file.', 'INVALID_VIDEO'));
    }
    callback(null, true);
  },
});

router.post('/connect-url', authenticateJWT, getYouTubeConnectUrlController);
router.get('/callback', youtubeCallbackController);
router.get('/status', authenticateJWT, getYouTubeStatusController);
router.post('/disconnect', authenticateJWT, disconnectYouTubeController);
router.post('/upload', authenticateJWT, videoUpload.single('video'), uploadYouTubeVideoController);
router.get('/history', authenticateJWT, getYouTubeHistoryController);

export default router;
