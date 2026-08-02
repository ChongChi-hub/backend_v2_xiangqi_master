import { Server, Socket } from 'socket.io';
import prisma from '../utils/prisma';

// In-memory queue for matchmaking
const matchmakingQueue: Array<{ userId: string; socketId: string }> = [];

// Private Rooms store
interface PrivateRoom {
  roomCode: string;
  hostId: string;
  hostUsername: string;
  guestId: string | null;
  guestUsername: string | null;
  settings: {
    totalRounds: number;
    timeControl: number;
    hostSide: 'random' | 'red' | 'black';
  };
  status: 'WAITING' | 'READY';
  createdAt: number;
}
export const privateRooms = new Map<string, PrivateRoom>();

const generateRoomCode = (): string => {
  let code: string;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (privateRooms.has(code));
  return code;
};

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

  // --- Private Room Events ---

  socket.on('create_private_room', async (settings: { totalRounds: number; timeControl: number; hostSide: 'random' | 'red' | 'black' }) => {
    const code = generateRoomCode();
    
    // Fetch host username
    const hostUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    
    const room: PrivateRoom = {
      roomCode: code,
      hostId: userId,
      hostUsername: hostUser?.username || 'Kỳ Thủ',
      guestId: null,
      guestUsername: null,
      settings,
      status: 'WAITING',
      createdAt: Date.now(),
    };
    
    privateRooms.set(code, room);
    socket.join(`room_${code}`);
    console.log(`User ${userId} created private room ${code}`);
    socket.emit('private_room_created', { roomCode: code });
  });

  socket.on('join_private_room', async (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (!room) {
      socket.emit('private_room_error', { message: 'Phòng không tồn tại hoặc đã bị hủy.' });
      return;
    }
    if (room.status !== 'WAITING' || room.guestId !== null) {
      if (room.hostId === userId || room.guestId === userId) {
        // Rejoin
        socket.join(`room_${data.roomCode}`);
        socket.emit('private_room_joined', { roomCode: data.roomCode });
        return;
      }
      socket.emit('private_room_error', { message: 'Phòng đã đầy hoặc đã bắt đầu.' });
      return;
    }

    // Assign guest
    const guestUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    room.guestId = userId;
    room.guestUsername = guestUser?.username || 'Kỳ Thủ Khách';
    room.status = 'READY';

    socket.join(`room_${data.roomCode}`);
    console.log(`User ${userId} joined private room ${data.roomCode}`);

    // Resolve sides
    let hostAssignedSide = room.settings.hostSide;
    if (hostAssignedSide === 'random') {
      hostAssignedSide = Math.random() > 0.5 ? 'red' : 'black';
    }
    const guestAssignedSide = hostAssignedSide === 'red' ? 'black' : 'red';

    io.to(`room_${data.roomCode}`).emit('private_room_ready', {
      roomCode: data.roomCode,
      settings: room.settings,
      host: {
        id: room.hostId,
        username: room.hostUsername,
        side: hostAssignedSide,
      },
      guest: {
        id: room.guestId,
        username: room.guestUsername,
        side: guestAssignedSide,
      }
    });
  });

  socket.on('cancel_private_room', (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.hostId === userId) {
      privateRooms.delete(data.roomCode);
      io.to(`room_${data.roomCode}`).emit('private_room_cancelled');
      console.log(`Private room ${data.roomCode} cancelled by host ${userId}`);
    }
  });

  socket.on('leave_private_room', (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    socket.leave(`room_${data.roomCode}`);
    if (room) {
      if (room.hostId === userId) {
        // Host leaves, close room
        privateRooms.delete(data.roomCode);
        io.to(`room_${data.roomCode}`).emit('private_room_cancelled');
        console.log(`Private room ${data.roomCode} closed because host ${userId} left`);
      } else if (room.guestId === userId) {
        // Guest leaves, room goes back to WAITING
        room.guestId = null;
        room.guestUsername = null;
        room.status = 'WAITING';
        io.to(`room_${data.roomCode}`).emit('private_room_guest_left');
        console.log(`Guest ${userId} left private room ${data.roomCode}, back to WAITING`);
      }
    }
  });

  socket.on('private_make_move', (data: { roomCode: string; fen: string; moveStr: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.status === 'READY') {
      socket.to(`room_${data.roomCode}`).emit('move_made', {
        playerId: userId,
        fen: data.fen,
        moveStr: data.moveStr,
      });
    }
  });

  // --- End Private Room Events ---

  socket.on('find_match', async () => {
    console.log(`User ${userId} is looking for a match...`);

    // Simple matchmaking logic
    const existingPlayerIndex = matchmakingQueue.findIndex((p) => p.userId === userId);
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
            initialFen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
          },
        });

        // Fetch usernames for both players
        const [redUser, blackUser] = await Promise.all([
          prisma.user.findUnique({ where: { id: player1.userId }, select: { username: true } }),
          prisma.user.findUnique({ where: { id: player2.userId }, select: { username: true } }),
        ]);

        // Notify players
        const roomId = `match_${match.id}`;

        const socket1 = io.sockets.sockets.get(player1.socketId);
        const socket2 = io.sockets.sockets.get(player2.socketId);

        if (socket1) socket1.join(roomId);
        if (socket2) socket2.join(roomId);

        io.to(roomId).emit('match_found', {
          matchId: match.id,
          redPlayerId: match.redPlayerId,
          redUsername: redUser?.username || 'Kỳ Thủ Đỏ',
          blackPlayerId: match.blackPlayerId,
          blackUsername: blackUser?.username || 'Kỳ Thủ Đen',
          fen: match.initialFen,
        });

        console.log(
          `Match created: ${match.id} between ${redUser?.username || player1.userId} (Red) and ${
            blackUser?.username || player2.userId
          } (Black)`
        );
      } catch (error) {
        console.error('Error creating match:', error);
      }
    }
  });

  socket.on('cancel_find_match', () => {
    const index = matchmakingQueue.findIndex((p) => p.userId === userId);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      console.log(`User ${userId} cancelled matchmaking`);
    }
  });
};

export const handlePrivateRoomDisconnect = (io: Server, userId: string) => {
  for (const [code, room] of privateRooms.entries()) {
    if (room.hostId === userId) {
      privateRooms.delete(code);
      io.to(`room_${code}`).emit('private_room_cancelled');
      console.log(`Private room ${code} closed because host ${userId} disconnected`);
    } else if (room.guestId === userId) {
      room.guestId = null;
      room.guestUsername = null;
      room.status = 'WAITING';
      io.to(`room_${code}`).emit('private_room_guest_left');
      console.log(`Guest ${userId} disconnected from private room ${code}, back to WAITING`);
    }
  }
};
