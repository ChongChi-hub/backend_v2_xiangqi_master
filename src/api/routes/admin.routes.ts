import { Router } from 'express';
import { getDashboardStats, getUsersList, getMatchesList } from '../controllers/admin.controller';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware';

const router = Router();

// Apply auth and admin check to all admin routes
router.use(authenticateToken, authorizeAdmin);

router.get('/stats', getDashboardStats);
router.get('/users', getUsersList);
router.get('/matches', getMatchesList);

export default router;
