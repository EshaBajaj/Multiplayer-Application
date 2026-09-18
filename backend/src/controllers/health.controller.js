import db from '../db/index.js';

export const getHealth = async (req, res, next) => {
  try {
    const dbHealth = await db.checkHealth();
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbHealth,
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: err.message,
      },
    });
  }
};
