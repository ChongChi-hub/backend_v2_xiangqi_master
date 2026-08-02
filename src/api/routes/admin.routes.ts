import { Router } from 'express';
import { getDashboardStats, getUsersList, getMatchesList, getBotSettings, updateBotSetting } from '../controllers/admin.controller';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware';

const router = Router();

// Apply auth and admin check to all admin routes
router.use(authenticateToken, authorizeAdmin);

router.get('/stats', getDashboardStats);
router.get('/users', getUsersList);
router.get('/matches', getMatchesList);
router.get('/bot-settings', getBotSettings);
router.put('/bot-settings/:difficulty', updateBotSetting);

export default router;
