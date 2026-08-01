import { Server, Socket } from 'socket.io';
import prisma from '../utils/prisma';

// In-memory queue for matchmaking
const matchmakingQueue: Array<{ userId: string, socketId: string }> = [];

export const handleRoomEvents = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  socket.on('join_room', async (roomId: string) => {
    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
    io.to(roomId).emit('user_joined', { userId });
  });

  socket.on('leave_room', (roomId: string) => {
    socket.leave(roomId);
    console.log(`User ${userId} left room ${roomId}`);
    io.to(roomId).emit('user_left', { userId });
  });

  socket.on('find_match', async () => {
    console.log(`User ${userId} is looking for a match...`);
    
    // Simple matchmaking logic
    const existingPlayerIndex = matchmakingQueue.findIndex(p => p.userId === userId);
    if (existingPlayerIndex === -1) {
      matchmakingQueue.push({ userId, socketId: socket.id });
    }

    if (matchmakingQueue.length >= 2) {
      const player1 = matchmakingQueue.shift()!;
      const player2 = matchmakingQueue.shift()!;

      try {
        // Create match in DB
        const match = await prisma.match.create({
          data: {
            redPlayerId: player1.userId,
            blackPlayerId: player2.userId,
            timeControl: 15 * 60, // 15 minutes
            initialFen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'
          }
        });

        // Notify players
        const roomId = `match_${match.id}`;
        
        // Use io.sockets.sockets to force both sockets to join the new room
        const socket1 = io.sockets.sockets.get(player1.socketId);
        const socket2 = io.sockets.sockets.get(player2.socketId);
        
        if (socket1) socket1.join(roomId);
        if (socket2) socket2.join(roomId);

        io.to(roomId).emit('match_found', {
          matchId: match.id,
          redPlayerId: match.redPlayerId,
          blackPlayerId: match.blackPlayerId,
          fen: match.initialFen
        });

        console.log(`Match created: ${match.id} between ${player1.userId} and ${player2.userId}`);
      } catch (error) {
        console.error('Error creating match:', error);
      }
    }
  });

  socket.on('cancel_find_match', () => {
    const index = matchmakingQueue.findIndex(p => p.userId === userId);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      console.log(`User ${userId} cancelled matchmaking`);
    }
  });
};
