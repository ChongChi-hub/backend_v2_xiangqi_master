import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { handleRoomEvents } from './room.handler';
import { handleGameEvents } from './game.handler';

// Store connected users mapping (socket.id -> userId)
export const connectedUsers = new Map<string, string>();

export const initSockets = (io: Server) => {
  io.use((socket, next) => {
    // Bug #2 Fix: Verify JWT token thực sự - không tin tưởng userId từ client
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next(new Error('Server configuration error'));
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as { userId: string };
      if (!decoded.userId) {
        return next(new Error('Authentication error: Invalid token payload'));
      }
      socket.data.userId = decoded.userId;
      return next();
    } catch {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    connectedUsers.set(socket.id, userId);
    console.log(`User ${userId} connected with socket ${socket.id}`);

    // Register event handlers
    handleRoomEvents(io, socket);
    handleGameEvents(io, socket);

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.id);
      console.log(`User ${userId} disconnected`);
    });
  });
};
