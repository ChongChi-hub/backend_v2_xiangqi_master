import { Router } from 'express';
import { getUserProfile, getLeaderboard } from '../controllers/user.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { userValidation } from '../validations/user.validation';

const router = Router();

router.get('/profile', authenticateToken, getUserProfile);
router.get('/leaderboard', authenticateToken, validate(userValidation.leaderboardSchema), getLeaderboard);

export default router;

