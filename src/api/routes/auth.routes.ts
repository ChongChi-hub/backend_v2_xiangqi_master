import { Router } from 'express';
import { loginUser, registerUser } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { authValidation } from '../validations/auth.validation';

const router = Router();

router.post('/login', validate(authValidation.loginSchema), loginUser);
router.post('/register', validate(authValidation.registerSchema), registerUser);

export default router;
