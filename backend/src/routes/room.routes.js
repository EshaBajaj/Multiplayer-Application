import { Router } from 'express';
import {
  createRoom,
  listRooms,
  getRoomDetails,
  joinRoom,
  leaveRoom,
  shareDraftToRoom,
  getRoomSharedDrafts,
  startRoomSpin,
  createRoomSchema,
  joinLeaveRoomSchema,
  shareDraftSchema,
} from '../controllers/room.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/rooms', validate(createRoomSchema), createRoom);
router.get('/rooms', listRooms);
router.get('/rooms/:id', getRoomDetails);
router.post('/rooms/:id/join', validate(joinLeaveRoomSchema), joinRoom);
router.post('/rooms/:id/leave', validate(joinLeaveRoomSchema), leaveRoom);
router.post('/rooms/:id/drafts', validate(shareDraftSchema), shareDraftToRoom);
router.get('/rooms/:id/drafts', getRoomSharedDrafts);
router.post('/rooms/:id/spins', startRoomSpin);

export default router;
