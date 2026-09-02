import { Router } from 'express';
import { asyncHandler } from '../utils/errors';
import { validate } from '../middleware/validate.middleware';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { upload } from '../middleware/upload.middleware';
import { uploadLimiter } from '../middleware/rateLimit.middleware';
import {
  tasksController,
  createTaskSchema,
  updateTaskSchema,
  submitSchema,
  reviewSchema,
} from '../controllers/tasks.controller';

const router = Router();

router.get('/', optionalAuth, asyncHandler(tasksController.getAll));
router.get('/mine', authenticate, asyncHandler(tasksController.getMyTasks));
router.get('/:id', optionalAuth, asyncHandler(tasksController.getOne));

router.post(
  '/',
  authenticate,
  requireAdmin,
  uploadLimiter,
  upload.single('attachment'),
  validate(createTaskSchema),
  asyncHandler(tasksController.create),
);

router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validate(updateTaskSchema),
  asyncHandler(tasksController.update),
);

router.delete('/:id', authenticate, requireAdmin, asyncHandler(tasksController.cancel));

router.post('/:id/claim', authenticate, asyncHandler(tasksController.claim));

router.post(
  '/:id/submit',
  authenticate,
  uploadLimiter,
  upload.single('attachment'),
  validate(submitSchema),
  asyncHandler(tasksController.submit),
);

router.patch('/:id/review', authenticate, requireAdmin, validate(reviewSchema), asyncHandler(tasksController.review));

export default router;
