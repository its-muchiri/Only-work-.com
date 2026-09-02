import { Router } from 'express';
import { asyncHandler } from '../utils/errors';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import { uploadLimiter } from '../middleware/rateLimit.middleware';
import {
  usersController,
  updateProfileSchema,
  changePasswordSchema,
} from '../controllers/users.controller';

const router = Router();

router.use(authenticate);

router.get('/me', asyncHandler(usersController.getMe));
router.patch('/me', validate(updateProfileSchema), asyncHandler(usersController.updateMe));
router.post('/me/avatar', uploadLimiter, upload.single('avatar'), asyncHandler(usersController.uploadAvatar));
router.post('/me/change-password', validate(changePasswordSchema), asyncHandler(usersController.changePassword));
router.get('/me/stats', asyncHandler(usersController.getMyStats));
router.get('/me/submissions', asyncHandler(usersController.getMySubmissions));
router.get('/me/notifications', asyncHandler(usersController.getMyNotifications));
router.get('/me/earnings/monthly', asyncHandler(usersController.getMonthlyEarnings));
router.patch('/me/notifications/:id/read', asyncHandler(usersController.markNotificationRead));
router.post('/me/notifications/read-all', asyncHandler(usersController.markAllNotificationsRead));

export default router;
