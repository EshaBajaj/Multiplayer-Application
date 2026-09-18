import { Router } from 'express';
import { createDraft, getDraftById, getUserDrafts, uploadMiddleware } from '../controllers/draft.controller.js';

const router = Router();

router.post('/drafts/upload', uploadMiddleware, createDraft);
router.post('/drafts', uploadMiddleware, createDraft);
router.get('/drafts/:id', getDraftById);
router.get('/users/:userId/drafts', getUserDrafts);

export default router;
