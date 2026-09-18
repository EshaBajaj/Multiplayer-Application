import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import healthRoutes from './routes/health.routes.js';
import userRoutes from './routes/user.routes.js';
import roomRoutes from './routes/room.routes.js';
import draftRoutes from './routes/draft.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file hosting for uploaded audio drafts
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Static files for public browser portal
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Clean URLs for the web portal
const webClientPath = path.resolve(publicDir, 'index.html');
app.get(['/', '/arena', '/studio', '/app', '/portal'], (req, res) => {
  res.sendFile(webClientPath);
});

// Routes
app.use('/', healthRoutes);
app.use('/api', healthRoutes);
app.use('/api', userRoutes);
app.use('/api', roomRoutes);
app.use('/api', draftRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.url} - Endpoint not found`,
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
