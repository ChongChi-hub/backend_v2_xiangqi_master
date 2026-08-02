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

      await prisma.match.update({
        where: { id: data.matchId },
        data: {
          status: 'FINISHED',
          winnerId,
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

      const isWinner = data.gameState === 'CHECKMATE' || data.gameState === 'KING_CAPTURED';
      
      // If it's a draw/stalemate, we can handle it differently, but for now we assume Checkmate logic
      if (data.gameState === 'STALEMATE') {
        await prisma.match.update({
          where: { id: data.matchId },
          data: {
            status: 'FINISHED',
            winnerId: null,
            endedAt: new Date(),
          },
        });

        // Increment drawMatches for both
        await prisma.user.update({
          where: { id: match.redPlayerId },
          data: { drawMatches: { increment: 1 } },
        });
        await prisma.user.update({
          where: { id: match.blackPlayerId },
          data: { drawMatches: { increment: 1 } },
        });

        const roomId = `match_${data.matchId}`;
        io.to(roomId).emit('match_ended', { winnerId: null, reason: 'stalemate' });
        return;
      }

      if (isWinner) {
        const winnerId = userId;
        const loserId = match.redPlayerId === userId ? match.blackPlayerId : match.redPlayerId;

        await prisma.match.update({
          where: { id: data.matchId },
          data: {
            status: 'FINISHED',
            winnerId,
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

        const roomId = `match_${data.matchId}`;
        io.to(roomId).emit('match_ended', { winnerId, reason: 'checkmate' });
      }
    } catch (error) {
      console.error('Error handling game_ended:', error);
    }
  });

  socket.on('offer_draw', async (data: { matchId: string }) => {
    try {
      const roomId = `match_${data.matchId}`;
      socket.to(roomId).emit('draw_offered', { offeredBy: userId });
    } catch (error) {
      console.error('Error handling offer_draw:', error);
    }
  });

  socket.on('respond_draw', async (data: { matchId: string; accept: boolean }) => {
    try {
      const roomId = `match_${data.matchId}`;
      
      if (!data.accept) {
        socket.to(roomId).emit('draw_declined', { declinedBy: userId });
        return;
      }

      // Draw Accepted
      const match = await prisma.match.findUnique({ where: { id: data.matchId } });
      if (!match || match.status !== 'PLAYING') return;

      await prisma.match.update({
        where: { id: data.matchId },
        data: {
          status: 'FINISHED',
          winnerId: null,
          endedAt: new Date(),
        },
      });

      // Update both players' draw statistics (no ELO change)
      await prisma.user.update({
        where: { id: match.redPlayerId },
        data: { drawMatches: { increment: 1 } },
      });
      await prisma.user.update({
        where: { id: match.blackPlayerId },
        data: { drawMatches: { increment: 1 } },
      });

      // Broadcast draw accepted to both players
      io.to(roomId).emit('match_ended', { winnerId: null, reason: 'draw_agreed' });

    } catch (error) {
      console.error('Error handling respond_draw:', error);
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

      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: 'FINISHED',
          winnerId,
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
