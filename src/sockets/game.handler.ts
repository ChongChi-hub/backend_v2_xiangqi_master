import { Server, Socket } from 'socket.io';
import prisma from '../utils/prisma';

export const handleGameEvents = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  socket.on('get_match_info', async (data: { matchId: string }) => {
    try {
      const match = await prisma.match.findUnique({
        where: { id: data.matchId },
      });

      if (!match) return;

      const [redUser, blackUser, latestMove] = await Promise.all([
        prisma.user.findUnique({ where: { id: match.redPlayerId }, select: { username: true } }),
        prisma.user.findUnique({ where: { id: match.blackPlayerId }, select: { username: true } }),
        prisma.move.findFirst({
          where: { matchId: data.matchId },
          orderBy: { moveNumber: 'desc' },
        }),
      ]);

      const currentFen = latestMove ? latestMove.fen : match.initialFen;

      socket.emit('match_info', {
        matchId: match.id,
        redPlayerId: match.redPlayerId,
        redUsername: redUser?.username || 'Kỳ thủ Đỏ',
        blackPlayerId: match.blackPlayerId,
        blackUsername: blackUser?.username || 'Kỳ thủ Đen',
        fen: currentFen,
        status: match.status,
        startedAt: match.createdAt.getTime(),
      });
    } catch (error) {
      console.error('Error fetching match info:', error);
    }
  });

  socket.on('make_move', async (data: { matchId: string; fen: string; moveStr: string; timeCost: number }) => {
    try {
      const roomId = `match_${data.matchId}`;

      // Save move to DB
      const match = await prisma.match.findUnique({
        where: { id: data.matchId },
        include: { moves: true },
      });

      if (!match || match.status !== 'PLAYING') {
        socket.emit('error', 'Match is not active');
        return;
      }

      const isUserInMatch = match.redPlayerId === userId || match.blackPlayerId === userId;
      if (!isUserInMatch) {
        socket.emit('error', 'You are not part of this match');
        return;
      }

      await prisma.move.create({
        data: {
          matchId: data.matchId,
          playerId: userId,
          moveNumber: match.moves.length + 1,
          moveStr: data.moveStr,
          fen: data.fen,
          timeCost: data.timeCost || 0,
        },
      });

      // Broadcast move to other player in the room
      socket.to(roomId).emit('move_made', {
        playerId: userId,
        fen: data.fen,
        moveStr: data.moveStr,
      });
    } catch (error) {
      console.error('Error handling move:', error);
    }
  });

  socket.on('resign', async (data: { matchId: string }) => {
    try {
      const match = await prisma.match.findUnique({ where: { id: data.matchId } });
      if (!match || match.status !== 'PLAYING') return;

      const winnerId = match.redPlayerId === userId ? match.blackPlayerId : match.redPlayerId;
      const loserId = userId;
      const duration = Math.floor((Date.now() - match.createdAt.getTime()) / 1000);

      await prisma.match.update({
        where: { id: data.matchId },
        data: {
          status: 'FINISHED',
          winnerId,
          timeControl: duration,
          endedAt: new Date(),
        },
      });

      // ELO updates (+30 / -30)
      await prisma.user.update({
        where: { id: winnerId },
        data: {
          eloScore: { increment: 30 },
          winMatches: { increment: 1 },
        },
      });

      await prisma.user.update({
        where: { id: loserId },
        data: {
          eloScore: { decrement: 30 },
          loseMatches: { increment: 1 },
        },
      });

      const roomId = `match_${data.matchId}`;
      io.to(roomId).emit('match_ended', { winnerId, reason: 'resign' });
    } catch (error) {
      console.error('Error handling resign:', error);
    }
  });

  socket.on('game_ended', async (data: { matchId: string; gameState: string }) => {
    try {
      const match = await prisma.match.findUnique({ where: { id: data.matchId } });
      if (!match || match.status !== 'PLAYING') return;

      const duration = Math.floor((Date.now() - match.createdAt.getTime()) / 1000);
      let winnerId = null;

      if (data.gameState === 'CHECKMATE' || data.gameState === 'KING_CAPTURED') {
        winnerId = userId;
      }

      await prisma.match.update({
        where: { id: data.matchId },
        data: {
          status: winnerId ? 'FINISHED' : 'DRAW',
          winnerId,
          timeControl: duration,
          endedAt: new Date(),
        },
      });

      if (winnerId) {
        const loserId = winnerId === match.redPlayerId ? match.blackPlayerId : match.redPlayerId;
        await prisma.user.update({ where: { id: winnerId }, data: { eloScore: { increment: 30 }, winMatches: { increment: 1 } } });
        await prisma.user.update({ where: { id: loserId }, data: { eloScore: { decrement: 30 }, loseMatches: { increment: 1 } } });
      } else {
        await prisma.user.update({ where: { id: match.redPlayerId }, data: { drawMatches: { increment: 1 } } });
        await prisma.user.update({ where: { id: match.blackPlayerId }, data: { drawMatches: { increment: 1 } } });
      }

      const roomId = `match_${data.matchId}`;
      io.to(roomId).emit('match_ended', { winnerId, reason: data.gameState.toLowerCase() });
    } catch (error) {
      console.error('Error handling game_ended:', error);
    }
  });
};

export const handlePlayerDisconnect = async (io: Server, userId: string) => {
  try {
    const activeMatches = await prisma.match.findMany({
      where: {
        status: 'PLAYING',
        OR: [{ redPlayerId: userId }, { blackPlayerId: userId }],
      },
    });

    for (const match of activeMatches) {
      const winnerId = match.redPlayerId === userId ? match.blackPlayerId : match.redPlayerId;
      const loserId = userId;
      const duration = Math.floor((Date.now() - match.createdAt.getTime()) / 1000);

      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: 'FINISHED',
          winnerId,
          timeControl: duration,
          endedAt: new Date(),
        },
      });

      await prisma.user.update({
        where: { id: winnerId },
        data: {
          eloScore: { increment: 30 },
          winMatches: { increment: 1 },
        },
      });

      await prisma.user.update({
        where: { id: loserId },
        data: {
          eloScore: { decrement: 30 },
          loseMatches: { increment: 1 },
        },
      });

      const roomId = `match_${match.id}`;
      io.to(roomId).emit('match_ended', { winnerId, reason: 'opponent_left' });
    }
  } catch (error) {
    console.error('Error handling player disconnect match cleanup:', error);
  }
};
