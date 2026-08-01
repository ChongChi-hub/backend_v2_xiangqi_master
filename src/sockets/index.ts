import { Server, Socket } from 'socket.io';
import { handleRoomEvents } from './room.handler';
import { handleGameEvents } from './game.handler';

// Store connected users mapping (socket.id -> userId)
export const connectedUsers = new Map<string, string>();

export const initSockets = (io: Server) => {
  io.use((socket, next) => {
    // In a real app, you would verify the JWT token here
    const token = socket.handshake.auth.token;
    if (token) {
      // Decode token and get userId...
      // For now, we'll just accept a userId directly for simplicity
      const userId = socket.handshake.auth.userId;
      if (userId) {
        socket.data.userId = userId;
        return next();
      }
    }
    return next(new Error('Authentication error'));
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
