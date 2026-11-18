import { Router } from 'express';
import {
  confirmEmailController,
  forgotPasswordController,
  loginController,
  logoutController,
  refreshTokenController,
  registerController,
  resetPasswordController,
} from '../controllers/auth.controller';
import { createRateLimiter } from '../shared/http.util';

const router = Router();

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 40,
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

router.post('/register', authRateLimit, registerController);
router.post('/login', authRateLimit, loginController);
router.post('/refresh_token', refreshTokenController);
router.post('/logout', logoutController);
router.get('/confirm-email/:token', confirmEmailController);
router.post('/forgot-password', authRateLimit, forgotPasswordController);
router.post('/reset-password', authRateLimit, resetPasswordController);

export default router;
