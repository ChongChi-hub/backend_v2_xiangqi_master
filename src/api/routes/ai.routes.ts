import { Router } from 'express';
import { getAIMove, getAIHint, validateAIMove } from '../controllers/ai.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { aiValidation } from '../validations/ai.validation';

const router = Router();

router.post('/move', authenticateToken, validate(aiValidation.moveSchema), getAIMove);
router.post('/hint', authenticateToken, validate(aiValidation.fenSchema), getAIHint);
router.post('/validate', authenticateToken, validate(aiValidation.moveSchema), validateAIMove);

export default router;
