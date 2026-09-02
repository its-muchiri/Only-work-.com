import { Router } from 'express';
import { asyncHandler } from '../utils/errors';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { payoutsController, processPayoutSchema } from '../controllers/payouts.controller';

const router = Router();

router.get('/onboard/callback', asyncHandler(payoutsController.onboardCallback));
router.post('/onboard', authenticate, asyncHandler(payoutsController.onboard));
router.get('/my-payouts', authenticate, asyncHandler(payoutsController.getMyPayouts));
router.get('/pending', authenticate, requireAdmin, asyncHandler(payoutsController.getAllPending));
router.post('/process', authenticate, requireAdmin, validate(processPayoutSchema), asyncHandler(payoutsController.process));

export default router;
