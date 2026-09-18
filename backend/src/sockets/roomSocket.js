import db from '../db/index.js';
import logger from '../utils/logger.js';
import SpinStateMachine from '../services/spinStateMachine.js';

/**
 * Helper to fetch complete room state snapshot from PostgreSQL
 */
export async function getAuthoritativeRoomState(roomId) {
  const roomRes = await db.query(
    `SELECT r.*, u.username AS owner_username, u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url
     FROM rooms r
     JOIN users u ON r.owner_id = u.id
     WHERE r.id = $1`,
    [roomId]
  );

  if (roomRes.rows.length === 0) return null;
  const room = roomRes.rows[0];

  const membersRes = await db.query(
    `SELECT rm.id AS membership_id, rm.role, rm.is_online, rm.joined_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url, u.virtual_points
     FROM room_members rm
     JOIN users u ON rm.user_id = u.id
     WHERE rm.room_id = $1 AND rm.is_online = true
     ORDER BY rm.role DESC, rm.joined_at ASC`,
    [roomId]
  );

  const spinRes = await db.query(
    `SELECT * FROM spins 
     WHERE room_id = $1 AND status IN ('WAITING', 'RUNNING')
     ORDER BY created_at DESC LIMIT 1`,
    [roomId]
  );

  const draftsRes = await db.query(
    `SELECT rsd.id AS share_id, rsd.shared_at,
            d.id AS draft_id, d.title, d.duration_ms, d.file_url, d.effect_applied,
            u.id AS user_id, u.username, u.display_name, u.avatar_url
     FROM room_shared_drafts rsd
     JOIN drafts d ON rsd.draft_id = d.id
     JOIN users u ON rsd.shared_by = u.id
     WHERE rsd.room_id = $1
     ORDER BY rsd.shared_at DESC LIMIT 10`,
    [roomId]
  );

  return {
    room,
    participants: membersRes.rows,
    active_spin: spinRes.rows[0] || null,
    shared_drafts: draftsRes.rows,
    timestamp: new Date().toISOString(),
  };
}

export function registerRoomHandlers(io, socket) {
  /**
   * 1. JOIN ROOM & STATE SYNC
   * Handles user joining a room or reconnecting to synchronize latest state.
   */
  socket.on('join_room', async ({ room_id, user_id }, callback) => {
    try {
      if (!room_id || !user_id) {
        if (callback) callback({ success: false, error: 'room_id and user_id are required' });
        return;
      }

      logger.info(`Socket [${socket.id}] User [${user_id}] joining Room [${room_id}]`);

      // Update DB presence
      await db.query(
        `INSERT INTO room_members (room_id, user_id, role, is_online, joined_at, left_at)
         VALUES ($1, $2, 'PARTICIPANT', true, NOW(), NULL)
         ON CONFLICT (room_id, user_id)
         DO UPDATE SET is_online = true, left_at = NULL`,
        [room_id, user_id]
      );

      // Store context on socket
      socket.data.roomId = room_id;
      socket.data.userId = user_id;
      socket.join(`room:${room_id}`);

      // Fetch latest state snapshot
      const roomState = await getAuthoritativeRoomState(room_id);

      // Emit full room_state directly to joining/reconnecting socket
      socket.emit('room_state', roomState);

      // Broadcast user_joined to all other participants in the room
      const userRes = await db.query('SELECT id, username, display_name, avatar_url, virtual_points FROM users WHERE id = $1', [user_id]);
      const joinedUser = userRes.rows[0];

      socket.to(`room:${room_id}`).emit('user_joined', {
        user: joinedUser,
        participants: roomState.participants,
        timestamp: new Date().toISOString(),
      });

      if (callback) callback({ success: true, roomState });
    } catch (err) {
      logger.error('Error in join_room socket handler:', err);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  /**
   * 2. GET ROOM STATE (Explicit Reconnect / Refresh)
   */
  socket.on('get_room_state', async ({ room_id }, callback) => {
    try {
      const targetRoomId = room_id || socket.data.roomId;
      if (!targetRoomId) {
        if (callback) callback({ success: false, error: 'room_id is required' });
        return;
      }

      const roomState = await getAuthoritativeRoomState(targetRoomId);
      socket.emit('room_state', roomState);
      if (callback) callback({ success: true, roomState });
    } catch (err) {
      logger.error('Error in get_room_state socket handler:', err);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  /**
   * 3. SHARE DRAFT IN ROOM
   */
  socket.on('share_draft', async ({ room_id, draft_id, user_id }, callback) => {
    try {
      const targetRoomId = room_id || socket.data.roomId;
      const targetUserId = user_id || socket.data.userId;

      if (!targetRoomId || !draft_id || !targetUserId) {
        if (callback) callback({ success: false, error: 'room_id, draft_id and user_id are required' });
        return;
      }

      // Check draft
      const draftRes = await db.query('SELECT * FROM drafts WHERE id = $1', [draft_id]);
      if (draftRes.rows.length === 0) {
        if (callback) callback({ success: false, error: 'Draft not found.' });
        return;
      }
      const draft = draftRes.rows[0];

      // Save shared record in DB
      const shareRes = await db.query(
        `INSERT INTO room_shared_drafts (room_id, draft_id, shared_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [targetRoomId, draft_id, targetUserId]
      );

      const userRes = await db.query('SELECT id, username, display_name, avatar_url FROM users WHERE id = $1', [targetUserId]);
      const sender = userRes.rows[0];

      const sharedDraftPayload = {
        share_id: shareRes.rows[0].id,
        room_id: targetRoomId,
        draft_id: draft.id,
        title: draft.title,
        duration_ms: draft.duration_ms,
        file_url: draft.file_url,
        effect_applied: draft.effect_applied,
        shared_by: targetUserId,
        user: sender,
        shared_at: shareRes.rows[0].shared_at,
      };

      // Broadcast draft_shared to the entire room (including sender)
      io.to(`room:${targetRoomId}`).emit('draft_shared', sharedDraftPayload);

      if (callback) callback({ success: true, shared_draft: sharedDraftPayload });
    } catch (err) {
      logger.error('Error in share_draft socket handler:', err);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  /**
   * 4. LEAVE ROOM
   */
  socket.on('leave_room', async ({ room_id, user_id }, callback) => {
    try {
      const targetRoomId = room_id || socket.data.roomId;
      const targetUserId = user_id || socket.data.userId;

      if (!targetRoomId || !targetUserId) {
        if (callback) callback({ success: false, error: 'room_id and user_id are required' });
        return;
      }

      logger.info(`Socket User [${targetUserId}] left Room [${targetRoomId}]`);

      // Update DB presence
      await db.query(
        `UPDATE room_members
         SET is_online = false, left_at = NOW()
         WHERE room_id = $1 AND user_id = $2`,
        [targetRoomId, targetUserId]
      );

      socket.leave(`room:${targetRoomId}`);
      // Edge Case 4 & 6: Update active spin state machine if a spin is running
      await SpinStateMachine.handleParticipantLeave(targetRoomId, targetUserId, io);

      const roomState = await getAuthoritativeRoomState(targetRoomId);

      // Broadcast user_left event to remaining members
      socket.to(`room:${targetRoomId}`).emit('user_left', {
        user_id: targetUserId,
        participants: roomState ? roomState.participants : [],
        timestamp: new Date().toISOString(),
      });

      if (callback) callback({ success: true });
    } catch (err) {
      logger.error('Error in leave_room socket handler:', err);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  /**
   * 5. DISCONNECT & CLEANUP
   */
  socket.on('disconnect', async (reason) => {
    try {
      const { roomId, userId } = socket.data;
      if (roomId && userId) {
        logger.info(`Socket [${socket.id}] disconnected (${reason}). Updating presence for user [${userId}] in room [${roomId}]`);

        await db.query(
          `UPDATE room_members
           SET is_online = false, left_at = NOW()
           WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );

        // Edge Case 4 & 6: Update active spin state machine if running
        await SpinStateMachine.handleParticipantLeave(roomId, userId, io);

        const roomState = await getAuthoritativeRoomState(roomId);

        // Broadcast user_left with disconnect reason
        socket.to(`room:${roomId}`).emit('user_left', {
          user_id: userId,
          reason,
          participants: roomState ? roomState.participants : [],
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error('Error in socket disconnect cleanup:', err);
    }
  });

  /**
   * 6. START SPIN WHEEL (Section C)
   */
  socket.on('start_spin', async ({ room_id, user_id, interval_ms }, callback) => {
    try {
      const targetRoomId = room_id || socket.data.roomId;
      const targetUserId = user_id || socket.data.userId;

      if (!targetRoomId || !targetUserId) {
        if (callback) callback({ success: false, error: 'room_id and user_id are required' });
        return;
      }

      const result = await SpinStateMachine.startSpin(targetRoomId, targetUserId, io, {
        intervalMs: interval_ms || 5000,
      });

      if (callback) callback({ success: true, spin: result.spin });
    } catch (err) {
      logger.error('Error in start_spin socket handler:', err.message);
      if (callback) callback({ success: false, error: err.message, code: err.code });
      else socket.emit('spin_error', { error: err.message, code: err.code });
    }
  });
}
