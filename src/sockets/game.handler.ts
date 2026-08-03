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

      const duration = Math.floor((Date.now() - match.createdAt.getTime()) / 1000);

      await prisma.match.update({
        where: { id: data.matchId },
        data: {
          status: 'DRAW',
          winnerId: null,
          timeControl: duration,
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

  socket.on('request_undo', async (data: { matchId: string }) => {
    try {
      const roomId = `match_${data.matchId}`;
      const match = await prisma.match.findUnique({ where: { id: data.matchId }, include: { moves: true } });
      if (!match || match.status !== 'PLAYING') return;

      // Only allow undo if there is at least one move
      if (match.moves.length === 0) return;

      socket.to(roomId).emit('undo_requested', { requestedBy: userId });
    } catch (error) {
      console.error('Error handling request_undo:', error);
    }
  });

  socket.on('respond_undo', async (data: { matchId: string; accept: boolean }) => {
    try {
      const roomId = `match_${data.matchId}`;
      
      if (!data.accept) {
        socket.to(roomId).emit('undo_declined', { declinedBy: userId });
        return;
      }

      // Undo Accepted
      const match = await prisma.match.findUnique({ 
        where: { id: data.matchId },
        include: { 
          moves: { orderBy: { moveNumber: 'desc' }, take: 2 } 
        }
      });
      if (!match || match.status !== 'PLAYING') return;
      if (match.moves.length === 0) return;

      // Determine how many moves to delete based on the last move's player
      const lastMove = match.moves[0];
      
      // If the last move was made by the opponent (who is accepting the undo), delete 2 moves.
      // If the last move was made by the requester (who is asking for undo), delete 1 move.
      // The user responding is the opponent, so userId = opponent.
      const isOpponentsTurnToUndo = lastMove.playerId === userId;
      const deleteCount = isOpponentsTurnToUndo ? 1 : 2; // Wait, if last move was userId (opponent), they just moved, so we delete 1 move (their move)?
      // Actually, if I (A) made a move, and B hasn't moved yet. I ask for undo. B accepts. The last move is A's. A wants to take back their move. Delete 1.
      // If A made a move, and B made a move. A asks for undo (maybe wants to undo their blunder). B accepts. We need to delete B's move and A's move. So delete 2.
      // In both cases, we delete moves until it is A's turn again.
      // So if lastMove is B's (the one responding), delete 2 moves.
      // If lastMove is A's (the requester), delete 1 move.
      // So if lastMove.playerId === userId, it means B (responder) made the last move. Delete 2 moves.
      const movesToDelete = lastMove.playerId === userId ? 2 : 1;

      // Find moves to delete
      const movesToDrop = await prisma.move.findMany({
        where: { matchId: data.matchId },
        orderBy: { moveNumber: 'desc' },
        take: movesToDelete,
      });

      const moveIdsToDrop = movesToDrop.map(m => m.id);

      await prisma.move.deleteMany({
        where: { id: { in: moveIdsToDrop } }
      });

      // Get the new latest FEN
      const newLatestMove = await prisma.move.findFirst({
        where: { matchId: data.matchId },
        orderBy: { moveNumber: 'desc' }
      });

      const newFen = newLatestMove ? newLatestMove.fen : match.initialFen;

      // Broadcast undo accepted to both players
      io.to(roomId).emit('undo_accepted', { 
        deletedCount: movesToDelete, 
        fen: newFen,
        acceptedBy: userId 
      });

    } catch (error) {
      console.error('Error handling respond_undo:', error);
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
