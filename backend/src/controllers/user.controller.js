import { z } from 'zod';
import db from '../db/index.js';

export const userCreateSchema = z.object({
  body: z.object({
    username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain alphanumeric characters, dots, dashes, and underscores'),
    display_name: z.string().min(1).max(128).optional(),
    avatar_url: z.string().url().optional().or(z.literal('')),
  }),
});

export const getOrCreateUser = async (req, res, next) => {
  try {
    const { username, display_name, avatar_url } = req.body;
    const finalDisplayName = display_name || username;
    const finalAvatar = avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

    // Upsert or fetch existing user
    const selectRes = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (selectRes.rows.length > 0) {
      return res.status(200).json({
        success: true,
        user: selectRes.rows[0],
        is_new: false,
      });
    }

    const insertRes = await db.query(
      `INSERT INTO users (username, display_name, avatar_url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [username, finalDisplayName, finalAvatar]
    );

    res.status(201).json({
      success: true,
      user: insertRes.rows[0],
      is_new: true,
    });
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.status(200).json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};
