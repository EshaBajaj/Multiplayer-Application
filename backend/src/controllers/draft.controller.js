import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { z } from 'zod';
import db from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.wav';
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
}).single('audio');

export const createDraft = async (req, res, next) => {
  try {
    const { user_id, title, duration_ms, effect_applied } = req.body;

    if (!user_id || !title) {
      return res.status(400).json({
        success: false,
        error: 'user_id and title are required fields.',
      });
    }

    // Determine file_url
    let fileUrl = '';
    if (req.file) {
      const host = req.get('host');
      const protocol = req.protocol;
      fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    } else if (req.body.file_url) {
      fileUrl = req.body.file_url;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either an audio file attachment or file_url is required.',
      });
    }

    const duration = parseInt(duration_ms || '0', 10);
    const effect = effect_applied || 'NONE';

    const insertRes = await db.query(
      `INSERT INTO drafts (user_id, title, duration_ms, file_url, effect_applied)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, title, duration, fileUrl, effect]
    );

    res.status(201).json({
      success: true,
      draft: insertRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

export const getDraftById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT d.*, u.username, u.display_name
       FROM drafts d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found.' });
    }

    res.status(200).json({ success: true, draft: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

export const getUserDrafts = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const result = await db.query(
      `SELECT * FROM drafts WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    res.status(200).json({ success: true, drafts: result.rows });
  } catch (err) {
    next(err);
  }
};
