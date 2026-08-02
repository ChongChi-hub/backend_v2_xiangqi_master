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
        orderBy: { eloScore: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          eloScore: true,
          winMatches: true,
          loseMatches: true,
          drawMatches: true,
        },
      }),
      prisma.user.count(),
    ]);

    const data = users.map((user, index) => {
      const totalMatches = user.winMatches + user.loseMatches + user.drawMatches;
      const winRate = totalMatches > 0 ? (user.winMatches / totalMatches) * 100 : 0;

      return {
        rank: skip + index + 1,
        userId: user.id,
        username: user.username,
        eloScore: user.eloScore,
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
    const { difficulty, result, playerSide, clientMatchId, timeControl, initialFen } = req.body;

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
