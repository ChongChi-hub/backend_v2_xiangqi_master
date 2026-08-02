import { Router } from 'express';
import { getUserProfile, getLeaderboard, savePveMatch, uploadAvatar, getHistory } from '../controllers/user.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { userValidation } from '../validations/user.validation';
import { uploadAvatar as multerUpload } from '../../utils/cloudinary';

const router = Router();

router.get('/profile', authenticateToken, getUserProfile);
router.get('/history', authenticateToken, getHistory);
router.get('/leaderboard', authenticateToken, validate(userValidation.leaderboardSchema), getLeaderboard);
router.post('/pve-match', authenticateToken, savePveMatch);
router.post('/upload-avatar', authenticateToken, multerUpload.single('avatar'), uploadAvatar);

export default router;
