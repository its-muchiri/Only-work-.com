import { Router } from 'express';
import { asyncHandler } from '../utils/errors';
import { validate } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { authenticate } from '../middleware/auth.middleware';
import {
  authController,
  signupSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
} from '../controllers/auth.controller';

const router = Router();

router.post('/signup', authLimiter, validate(signupSchema), asyncHandler(authController.signup));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/verify-email/:token', asyncHandler(authController.verifyEmail));
router.post('/forgot-password', authLimiter, validate(forgotSchema), asyncHandler(authController.forgotPassword));
router.post('/reset-password/:token', authLimiter, validate(resetSchema), asyncHandler(authController.resetPassword));
router.get('/me', authenticate, asyncHandler(authController.me));

export default router;
