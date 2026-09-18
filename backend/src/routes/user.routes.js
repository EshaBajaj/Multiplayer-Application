import { Router } from 'express';
import { getOrCreateUser, getUserById, userCreateSchema } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/users', validate(userCreateSchema), getOrCreateUser);
router.get('/users/:id', getUserById);

export default router;
