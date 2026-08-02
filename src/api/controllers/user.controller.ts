import { Request, Response } from 'express';
import prisma from '../../utils/prisma';
import { AuthRequest } from '../middlewares/auth.middleware';

export const getUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        eloScore: true,
        winMatches: true,
        loseMatches: true,
        drawMatches: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    const totalMatches = user.winMatches + user.loseMatches + user.drawMatches;
    const winRate = totalMatches > 0 ? (user.winMatches / totalMatches) * 100 : 0;

    res.status(200).json({
      userId: user.id,
      username: user.username,
      email: user.email,
      eloScore: user.eloScore,
      winMatches: user.winMatches,
      loseMatches: user.loseMatches,
      drawMatches: user.drawMatches,
      avatarUrl: user.avatarUrl,
      totalMatches,
      winRate: Math.round(winRate * 100) / 100,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'PLAYER' },
        orderBy: { eloScore: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          eloScore: true,
          winMatches: true,
          loseMatches: true,
          drawMatches: true,
        },
      }),
      prisma.user.count({ where: { role: 'PLAYER' } }),
    ]);

    const data = users.map((user, index) => {
      const totalMatches = user.winMatches + user.loseMatches + user.drawMatches;
      const winRate = totalMatches > 0 ? (user.winMatches / totalMatches) * 100 : 0;

      return {
        rank: skip + index + 1,
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        eloScore: user.eloScore,
        winMatches: user.winMatches,
        loseMatches: user.loseMatches,
        drawMatches: user.drawMatches,
        winRate: Math.round(winRate * 100) / 100,
      };
    });

    res.status(200).json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const savePveMatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { difficulty, result, playerSide, clientMatchId, timeControl, initialFen, moves } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập' });
      return;
    }

    if (!difficulty || !result || !clientMatchId || !playerSide) {
      res.status(400).json({ error: 'Thiếu thông tin trận đấu' });
      return;
    }

    // PVE matches do NOT award or deduct ELO points
    const reward = 0;

    // Ensure AI user exists
    let aiUser = await prisma.user.findUnique({ where: { username: 'Pikafish_AI' } });
    if (!aiUser) {
      aiUser = await prisma.user.create({
        data: {
          username: 'Pikafish_AI',
          email: 'ai@pikafish.local',
          passwordHash: 'dummy_hash',
          eloScore: 2800,
        },
      });
    }

    // Prevent duplicate rewards
    const existingMatch = await prisma.match.findUnique({ where: { id: clientMatchId } });
    if (existingMatch) {
      res.status(400).json({ error: 'Trận đấu đã được lưu' });
      return;
    }

    const isRed = playerSide === 'red';
    const winnerId = result === 'win' ? userId : result === 'lose' ? aiUser.id : null;

    const moveData = moves && Array.isArray(moves) ? moves.map((mStr, idx) => {
      // Approximate whose turn it is by alternating
      const isRedTurn = idx % 2 === 0;
      const movePlayerId = isRedTurn ? (isRed ? userId : aiUser.id) : (isRed ? aiUser.id : userId);
      return {
        playerId: movePlayerId,
        moveNumber: idx + 1,
        moveStr: mStr,
        fen: '', // We don't have fen for each move from frontend array easily, so leave empty or dummy
        timeCost: 0,
      };
    }) : [];

    // Save match record without altering ELO
    await prisma.$transaction(async (tx) => {
      await tx.match.create({
        data: {
          id: clientMatchId,
          redPlayerId: isRed ? userId : aiUser!.id,
          blackPlayerId: isRed ? aiUser!.id : userId,
          winnerId,
          status: 'FINISHED',
          timeControl: timeControl || 0,
          initialFen: initialFen || 'startpos',
          endedAt: new Date(),
          moves: moveData.length > 0 ? {
            create: moveData
          } : undefined,
        },
      });

      if (result === 'win') {
        await tx.user.update({
          where: { id: userId },
          data: { winMatches: { increment: 1 } },
        });
      } else if (result === 'lose') {
        await tx.user.update({
          where: { id: userId },
          data: { loseMatches: { increment: 1 } },
        });
      } else if (result === 'draw') {
        await tx.user.update({
          where: { id: userId },
          data: { drawMatches: { increment: 1 } },
        });
      }
    });

    res.status(200).json({ message: 'Lưu trận đấu thành công (Không thay đổi ELO PVE)', reward: 0 });
  } catch (error) {
    console.error('Save PVE match error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const uploadAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Không có file được tải lên' });
      return;
    }

    const avatarUrl = req.file.path; // Multer-storage-cloudinary returns the URL in path

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    res.status(200).json({ message: 'Cập nhật ảnh đại diện thành công', avatarUrl });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Không có quyền truy cập' });
      return;
    }

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { redPlayerId: userId },
          { blackPlayerId: userId },
        ],
      },
      include: {
        redPlayer: {
          select: { id: true, username: true, avatarUrl: true, eloScore: true },
        },
        blackPlayer: {
          select: { id: true, username: true, avatarUrl: true, eloScore: true },
        },
        winner: {
          select: { id: true, username: true },
        },
        _count: {
          select: { moves: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limit to 50 latest matches
    });

    res.status(200).json({ matches });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};
