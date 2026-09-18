import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.url}:`, err);

  // PostgreSQL violation
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Conflict: A record with this unique value already exists.',
      detail: err.detail,
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: 'Invalid reference: Target entity does not exist.',
      detail: err.detail,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
};
