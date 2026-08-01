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
      }
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
      winRate: Math.round(winRate * 100) / 100
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
        }
      }),
      prisma.user.count()
    ]);

    const data = users.map((user, index) => {
      const totalMatches = user.winMatches + user.loseMatches + user.drawMatches;
      const winRate = totalMatches > 0 ? (user.winMatches / totalMatches) * 100 : 0;
      
      return {
        rank: skip + index + 1,
        userId: user.id,
        username: user.username,
        eloScore: user.eloScore,
        winRate: Math.round(winRate * 100) / 100
      };
    });

    res.status(200).json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};
