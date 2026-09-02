import { Router } from 'express';
import { asyncHandler } from '../utils/errors';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminController, updateUserSchema } from '../controllers/admin.controller';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/users', asyncHandler(adminController.getUsers));
router.patch('/users/:id', validate(updateUserSchema), asyncHandler(adminController.updateUser));
router.get('/analytics', asyncHandler(adminController.getAnalytics));
router.get('/submissions', asyncHandler(adminController.getAllSubmissions));
router.get('/payouts', asyncHandler(adminController.getAllPayouts));

export default router;
