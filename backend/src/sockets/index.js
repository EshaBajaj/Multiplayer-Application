import { Server } from 'socket.io';
import { registerRoomHandlers } from './roomSocket.js';
import logger from '../utils/logger.js';

let io = null;

export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 New Socket client connected: ${socket.id}`);

    // Register room & presence handlers
    registerRoomHandlers(io, socket);

    socket.on('ping_check', (data, callback) => {
      if (callback) callback({ pong: true, time: Date.now() });
    });

    socket.on('error', (err) => {
      logger.error(`Socket error on [${socket.id}]:`, err);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocketIO first.');
  }
  return io;
}

export default {
  initSocketIO,
  getIO,
};
