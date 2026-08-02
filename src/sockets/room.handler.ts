import { Server, Socket } from 'socket.io';
import prisma from '../utils/prisma';

// In-memory queue for matchmaking
const matchmakingQueue: Array<{ userId: string; socketId: string }> = [];

const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// Private Rooms store
export interface PrivateRoom {
  roomCode: string;
  hostId: string;
  hostUsername: string;
  guestId: string | null;
  guestUsername: string | null;
  settings: {
    totalRounds: number;
    hostSide: 'random' | 'red' | 'black';
  };
  state: {
    status: 'WAITING' | 'PLAYING' | 'BETWEEN_ROUNDS' | 'FINISHED' | 'CLOSED';
    currentRound: number;
    score: {
      host: number;
      guest: number;
      draws: number;
    };
    hostReady: boolean;
    guestReady: boolean;
    hostAssignedSide: 'red' | 'black' | null;
    guestAssignedSide: 'red' | 'black' | null;
    currentFen: string;
    turn: 'red' | 'black';
    drawOfferBy: string | null;
    roundStartedAt: number | null;
  };
  createdAt: number;
}
export const privateRooms = new Map<string, PrivateRoom>();

export const broadcastRoomState = (io: Server, roomCode: string, room: PrivateRoom) => {
  io.to(`room_${roomCode}`).emit('private_room_state_update', room);
};

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

  socket.on('create_private_room', async (settings: { totalRounds: number; hostSide: 'random' | 'red' | 'black' }) => {
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
      state: {
        status: 'WAITING',
        currentRound: 1,
        score: { host: 0, guest: 0, draws: 0 },
        hostReady: false,
        guestReady: false,
        hostAssignedSide: null,
        guestAssignedSide: null,
        currentFen: INITIAL_FEN,
        turn: 'red',
        drawOfferBy: null,
        roundStartedAt: null,
      },
      createdAt: Date.now(),
    };
    
    privateRooms.set(code, room);
    socket.join(`room_${code}`);
    console.log(`User ${userId} created private room ${code}`);
    io.to(`room_${code}`).emit('private_room_created', { roomCode: code });
    broadcastRoomState(io, code, room);
  });

  socket.on('join_private_room', async (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (!room) {
      socket.emit('private_room_error', { message: 'Phòng không tồn tại hoặc đã kết thúc.' });
      return;
    }
    
    if (room.hostId === userId) {
      // Host rejoining
      socket.join(`room_${data.roomCode}`);
      broadcastRoomState(io, data.roomCode, room);
      return;
    }

    if (room.guestId && room.guestId !== userId) {
      socket.emit('private_room_error', { message: 'Phòng đã đủ người.' });
      return;
    }

    // New guest joining
    const guestUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    room.guestId = userId;
    room.guestUsername = guestUser?.username || 'Kỳ Thủ Khách';
    
    socket.join(`room_${data.roomCode}`);
    console.log(`User ${userId} joined private room ${data.roomCode}`);
    
    // If it's the first time, auto-ready both and start round 1 logic
    if (room.state.status === 'WAITING' && room.guestId) {
      room.state.hostReady = true;
      room.state.guestReady = true;
      
      // Assign sides
      let redPlayerId = room.hostId;
      if (room.settings.hostSide === 'random') {
        redPlayerId = Math.random() > 0.5 ? room.hostId : room.guestId;
      } else if (room.settings.hostSide === 'black') {
        redPlayerId = room.guestId;
      }
      
      room.state.hostAssignedSide = (redPlayerId === room.hostId) ? 'red' : 'black';
      room.state.guestAssignedSide = (redPlayerId === room.guestId) ? 'red' : 'black';
      
      room.state.status = 'PLAYING';
      room.state.roundStartedAt = Date.now();
      room.state.currentFen = INITIAL_FEN;
      room.state.turn = 'red';
    }

    broadcastRoomState(io, data.roomCode, room);
  });

  socket.on('cancel_private_room', (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.hostId === userId) {
      room.state.status = 'CLOSED';
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
        if (room.state.status === 'WAITING') {
          room.state.status = 'CLOSED';
          privateRooms.delete(data.roomCode);
          io.to(`room_${data.roomCode}`).emit('private_room_cancelled');
        } else if (room.state.status === 'PLAYING' || room.state.status === 'BETWEEN_ROUNDS') {
          if (room.state.status === 'PLAYING' && room.guestId) {
            const duration = Math.floor((Date.now() - (room.state.roundStartedAt || Date.now())) / 1000);
            const redPlayerId = room.state.hostAssignedSide === 'red' ? room.hostId : room.guestId;
            const blackPlayerId = room.state.hostAssignedSide === 'black' ? room.hostId : room.guestId;
            prisma.match.create({
              data: {
                redPlayerId, blackPlayerId, winnerId: room.guestId, timeControl: duration, initialFen: INITIAL_FEN, status: 'FINISHED', endedAt: new Date()
              }
            }).catch(console.error);
          }
          room.state.score.guest += room.settings.totalRounds; // Instantly win the series
          room.state.status = 'FINISHED';
          broadcastRoomState(io, data.roomCode, room);
        }
      } else if (room.guestId === userId) {
        if (room.state.status === 'WAITING') {
          room.guestId = null;
          room.guestUsername = null;
          io.to(`room_${data.roomCode}`).emit('private_room_guest_left');
          broadcastRoomState(io, data.roomCode, room);
        } else if (room.state.status === 'PLAYING' || room.state.status === 'BETWEEN_ROUNDS') {
          if (room.state.status === 'PLAYING' && room.guestId) {
            const duration = Math.floor((Date.now() - (room.state.roundStartedAt || Date.now())) / 1000);
            const redPlayerId = room.state.hostAssignedSide === 'red' ? room.hostId : room.guestId;
            const blackPlayerId = room.state.hostAssignedSide === 'black' ? room.hostId : room.guestId;
            prisma.match.create({
              data: {
                redPlayerId, blackPlayerId, winnerId: room.hostId, timeControl: duration, initialFen: INITIAL_FEN, status: 'FINISHED', endedAt: new Date()
              }
            }).catch(console.error);
          }
          room.state.score.host += room.settings.totalRounds; // Instantly win the series
          room.state.status = 'FINISHED';
          broadcastRoomState(io, data.roomCode, room);
        }
      }
    }
  });

  socket.on('private_make_move', (data: { roomCode: string; fen: string; moveStr: string; nextTurn: 'red' | 'black' }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.state.status === 'PLAYING') {
      room.state.currentFen = data.fen;
      room.state.turn = data.nextTurn;
      socket.to(`room_${data.roomCode}`).emit('move_made', {
        playerId: userId,
        fen: data.fen,
        moveStr: data.moveStr,
      });
      broadcastRoomState(io, data.roomCode, room); // CRITICAL: Broadcast updated state to all clients
    }
  });

  socket.on('private_game_ended', async (data: { roomCode: string; winnerId: string | null }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.state.status === 'PLAYING' && room.guestId) {
      if (data.winnerId === room.hostId) {
        room.state.score.host += 1;
      } else if (data.winnerId === room.guestId) {
        room.state.score.guest += 1;
      } else {
        room.state.score.draws += 1;
      }

      // Save match to DB
      const duration = Math.floor((Date.now() - (room.state.roundStartedAt || Date.now())) / 1000);
      const redPlayerId = room.state.hostAssignedSide === 'red' ? room.hostId : room.guestId;
      const blackPlayerId = room.state.hostAssignedSide === 'black' ? room.hostId : room.guestId;
      
      try {
        await prisma.match.create({
          data: {
            redPlayerId,
            blackPlayerId,
            winnerId: data.winnerId,
            timeControl: duration, // Store actual duration in timeControl
            initialFen: INITIAL_FEN,
            status: data.winnerId ? 'FINISHED' : 'DRAW',
            endedAt: new Date(),
          }
        });
      } catch (err) {
        console.error('Failed to save private match:', err);
      }

      const winsNeeded = Math.ceil(room.settings.totalRounds / 2);
      if (room.state.score.host >= winsNeeded || room.state.score.guest >= winsNeeded || room.state.currentRound >= room.settings.totalRounds) {
        room.state.status = 'FINISHED';
      } else {
        room.state.status = 'BETWEEN_ROUNDS';
      }
      room.state.hostReady = false;
      room.state.guestReady = false;
      room.state.drawOfferBy = null;
      broadcastRoomState(io, data.roomCode, room);
    }
  });

  socket.on('offer_draw', (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.state.status === 'PLAYING') {
      room.state.drawOfferBy = userId;
      broadcastRoomState(io, data.roomCode, room);
    }
  });

  socket.on('respond_draw', async (data: { roomCode: string; accept: boolean }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.state.status === 'PLAYING' && room.state.drawOfferBy && room.state.drawOfferBy !== userId && room.guestId) {
      if (data.accept) {
        room.state.score.draws += 1;
        
        // Save match to DB as DRAW
        const duration = Math.floor((Date.now() - (room.state.roundStartedAt || Date.now())) / 1000);
        const redPlayerId = room.state.hostAssignedSide === 'red' ? room.hostId : room.guestId;
        const blackPlayerId = room.state.hostAssignedSide === 'black' ? room.hostId : room.guestId;
        
        try {
          await prisma.match.create({
            data: {
              redPlayerId,
              blackPlayerId,
              winnerId: null,
              timeControl: duration,
              initialFen: INITIAL_FEN,
              status: 'DRAW',
              endedAt: new Date(),
            }
          });
        } catch (err) {
          console.error('Failed to save private match draw:', err);
        }

        const winsNeeded = Math.ceil(room.settings.totalRounds / 2);
        if (room.state.currentRound >= room.settings.totalRounds || room.state.score.host >= winsNeeded || room.state.score.guest >= winsNeeded) {
          room.state.status = 'FINISHED';
        } else {
          room.state.status = 'BETWEEN_ROUNDS';
        }
        room.state.hostReady = false;
        room.state.guestReady = false;
        room.state.drawOfferBy = null;
        broadcastRoomState(io, data.roomCode, room);
      } else {
        room.state.drawOfferBy = null;
        broadcastRoomState(io, data.roomCode, room);
      }
    }
  });

  socket.on('resign_private_match', (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.state.status === 'PLAYING') {
      if (userId === room.hostId) {
        room.state.score.guest += 1;
      } else if (userId === room.guestId) {
        room.state.score.host += 1;
      }
      
      const winsNeeded = Math.ceil(room.settings.totalRounds / 2);
      if (room.state.score.host >= winsNeeded || room.state.score.guest >= winsNeeded || room.state.currentRound >= room.settings.totalRounds) {
        room.state.status = 'FINISHED';
      } else {
        room.state.status = 'BETWEEN_ROUNDS';
      }
      room.state.hostReady = false;
      room.state.guestReady = false;
      room.state.drawOfferBy = null;
      broadcastRoomState(io, data.roomCode, room);
    }
  });

  socket.on('ready_next_round', (data: { roomCode: string }) => {
    const room = privateRooms.get(data.roomCode);
    if (room && room.state.status === 'BETWEEN_ROUNDS') {
      if (userId === room.hostId) room.state.hostReady = true;
      if (userId === room.guestId) room.state.guestReady = true;

      if (room.state.hostReady && room.state.guestReady) {
        room.state.currentRound += 1;
        room.state.status = 'PLAYING';
        room.state.currentFen = INITIAL_FEN;
        room.state.turn = 'red';
        room.state.hostReady = false;
        room.state.guestReady = false;
        
        const temp = room.state.hostAssignedSide;
        room.state.hostAssignedSide = room.state.guestAssignedSide;
        room.state.guestAssignedSide = temp;
      }
      broadcastRoomState(io, data.roomCode, room);
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
            timeControl: 0,
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
      if (room.state.status === 'WAITING') {
        room.state.status = 'CLOSED';
        privateRooms.delete(code);
        io.to(`room_${code}`).emit('private_room_cancelled');
        console.log(`Private room ${code} closed because host ${userId} disconnected`);
      } else {
        console.log(`Host ${userId} disconnected from active private room ${code}, room preserved for reconnection`);
      }
    } else if (room.guestId === userId) {
      if (room.state.status === 'WAITING') {
        room.guestId = null;
        room.guestUsername = null;
        io.to(`room_${code}`).emit('private_room_guest_left');
        broadcastRoomState(io, code, room);
        console.log(`Guest ${userId} disconnected from WAITING private room ${code}, guest removed`);
      } else {
        console.log(`Guest ${userId} disconnected from active private room ${code}, room preserved for reconnection`);
      }
    }
  }
};
