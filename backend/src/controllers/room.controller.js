import { z } from 'zod';
import db from '../db/index.js';
import SpinStateMachine from '../services/spinStateMachine.js';
import { getIO } from '../sockets/index.js';

export const createRoomSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(128),
    owner_id: z.string().uuid(),
    max_participants: z.number().int().min(3).max(20).optional().default(20),
  }),
});

export const joinLeaveRoomSchema = z.object({
  body: z.object({
    user_id: z.string().uuid(),
  }),
});

export const shareDraftSchema = z.object({
  body: z.object({
    draft_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }),
});

export const createRoom = async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { title, owner_id, max_participants } = req.body;

    await client.query('BEGIN');

    // 1. Verify owner exists
    const userRes = await client.query('SELECT id, username, display_name FROM users WHERE id = $1', [owner_id]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Owner user not found.' });
    }

    // 2. Insert room
    const roomRes = await client.query(
      `INSERT INTO rooms (title, owner_id, max_participants, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING *`,
      [title, owner_id, max_participants || 20]
    );
    const room = roomRes.rows[0];

    // 3. Insert owner as HOST in room_members
    await client.query(
      `INSERT INTO room_members (room_id, user_id, role, is_online)
       VALUES ($1, $2, 'HOST', true)`,
      [room.id, owner_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      room: {
        ...room,
        owner: userRes.rows[0],
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

export const listRooms = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        r.id,
        r.title,
        r.owner_id,
        r.status,
        r.max_participants,
        r.created_at,
        u.username AS owner_username,
        u.display_name AS owner_display_name,
        u.avatar_url AS owner_avatar_url,
        COUNT(rm.id) FILTER (WHERE rm.is_online = true) AS online_participants_count,
        EXISTS (
          SELECT 1 FROM spins s 
          WHERE s.room_id = r.id AND s.status IN ('WAITING', 'RUNNING')
        ) AS has_active_spin
      FROM rooms r
      JOIN users u ON r.owner_id = u.id
      LEFT JOIN room_members rm ON r.id = rm.room_id
      WHERE r.status = 'ACTIVE'
      GROUP BY r.id, u.id
      ORDER BY r.created_at DESC;
    `;

    const result = await db.query(query);
    res.status(200).json({ success: true, rooms: result.rows });
  } catch (err) {
    next(err);
  }
};

export const getRoomDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch room & owner
    const roomRes = await db.query(
      `SELECT r.*, u.username AS owner_username, u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url
       FROM rooms r
       JOIN users u ON r.owner_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (roomRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }

    const room = roomRes.rows[0];

    // Fetch active participants
    const membersRes = await db.query(
      `SELECT rm.id AS membership_id, rm.role, rm.is_online, rm.joined_at,
              u.id AS user_id, u.username, u.display_name, u.avatar_url, u.virtual_points
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = $1 AND rm.is_online = true
       ORDER BY rm.role DESC, rm.joined_at ASC`,
      [id]
    );

    // Fetch active spin if any
    const spinRes = await db.query(
      `SELECT * FROM spins 
       WHERE room_id = $1 AND status IN ('WAITING', 'RUNNING')
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    // Fetch shared drafts
    const draftsRes = await db.query(
      `SELECT rsd.id AS share_id, rsd.shared_at,
              d.id AS draft_id, d.title, d.duration_ms, d.file_url, d.effect_applied,
              u.id AS user_id, u.username, u.display_name, u.avatar_url
       FROM room_shared_drafts rsd
       JOIN drafts d ON rsd.draft_id = d.id
       JOIN users u ON rsd.shared_by = u.id
       WHERE rsd.room_id = $1
       ORDER BY rsd.shared_at DESC LIMIT 20`,
      [id]
    );

    res.status(200).json({
      success: true,
      room,
      participants: membersRes.rows,
      shared_drafts: draftsRes.rows,
      active_spin: spinRes.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
};

export const joinRoom = async (req, res, next) => {
  try {
    const { id: room_id } = req.params;
    const { user_id } = req.body;

    // Check room
    const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [room_id]);
    if (roomRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }
    const room = roomRes.rows[0];

    if (room.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: 'Room is closed.' });
    }

    // Check capacity
    const countRes = await db.query(
      'SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND is_online = true AND user_id != $2',
      [room_id, user_id]
    );
    const onlineCount = parseInt(countRes.rows[0].count, 10);

    if (onlineCount >= room.max_participants) {
      return res.status(400).json({ success: false, error: `Room is full (Maximum ${room.max_participants} users).` });
    }

    // Role assignment: if user is owner, role is HOST, else PARTICIPANT
    const role = room.owner_id === user_id ? 'HOST' : 'PARTICIPANT';

    // Upsert member
    const upsertRes = await db.query(
      `INSERT INTO room_members (room_id, user_id, role, is_online, joined_at, left_at)
       VALUES ($1, $2, $3, true, NOW(), NULL)
       ON CONFLICT (room_id, user_id) 
       DO UPDATE SET is_online = true, left_at = NULL, role = EXCLUDED.role
       RETURNING *`,
      [room_id, user_id, role]
    );

    // Get user details
    const userRes = await db.query('SELECT id, username, display_name, avatar_url, virtual_points FROM users WHERE id = $1', [user_id]);

    res.status(200).json({
      success: true,
      membership: upsertRes.rows[0],
      user: userRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

export const leaveRoom = async (req, res, next) => {
  try {
    const { id: room_id } = req.params;
    const { user_id } = req.body;

    const updateRes = await db.query(
      `UPDATE room_members
       SET is_online = false, left_at = NOW()
       WHERE room_id = $1 AND user_id = $2
       RETURNING *`,
      [room_id, user_id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User is not a member of this room.' });
    }

    res.status(200).json({
      success: true,
      message: 'Left room successfully.',
      membership: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

export const shareDraftToRoom = async (req, res, next) => {
  try {
    const { id: room_id } = req.params;
    const { draft_id, user_id } = req.body;

    // Check room
    const roomRes = await db.query('SELECT id, status FROM rooms WHERE id = $1', [room_id]);
    if (roomRes.rows.length === 0 || roomRes.rows[0].status !== 'ACTIVE') {
      return res.status(404).json({ success: false, error: 'Active room not found.' });
    }

    // Check draft
    const draftRes = await db.query('SELECT * FROM drafts WHERE id = $1', [draft_id]);
    if (draftRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found.' });
    }
    const draft = draftRes.rows[0];

    // Record shared draft
    const shareRes = await db.query(
      `INSERT INTO room_shared_drafts (room_id, draft_id, shared_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [room_id, draft_id, user_id]
    );

    // Get user details
    const userRes = await db.query('SELECT username, display_name FROM users WHERE id = $1', [user_id]);

    res.status(201).json({
      success: true,
      shared_draft: {
        id: shareRes.rows[0].id,
        room_id,
        draft_id,
        title: draft.title,
        duration_ms: draft.duration_ms,
        file_url: draft.file_url,
        effect_applied: draft.effect_applied,
        shared_by: user_id,
        shared_by_username: userRes.rows[0]?.username,
        shared_by_display_name: userRes.rows[0]?.display_name,
        shared_at: shareRes.rows[0].shared_at,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getRoomSharedDrafts = async (req, res, next) => {
  try {
    const { id: room_id } = req.params;

    const result = await db.query(
      `SELECT rsd.id AS share_id, rsd.shared_at,
              d.id AS draft_id, d.title, d.duration_ms, d.file_url, d.effect_applied,
              u.id AS user_id, u.username, u.display_name, u.avatar_url
       FROM room_shared_drafts rsd
       JOIN drafts d ON rsd.draft_id = d.id
       JOIN users u ON rsd.shared_by = u.id
       WHERE rsd.room_id = $1
       ORDER BY rsd.shared_at DESC`,
      [room_id]
    );

    res.status(200).json({
      success: true,
      drafts: result.rows,
    });
  } catch (err) {
    next(err);
  }
};

export const startRoomSpin = async (req, res, next) => {
  try {
    const { id: room_id } = req.params;
    const { user_id, interval_ms } = req.body;

    const io = getIO();
    const result = await SpinStateMachine.startSpin(room_id, user_id, io, {
      intervalMs: interval_ms || 5000,
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    }
    next(err);
  }
};

