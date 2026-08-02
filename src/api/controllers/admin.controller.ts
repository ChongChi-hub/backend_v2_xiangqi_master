import { Request, Response } from 'express';
import prisma from '../../utils/prisma';

export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalMatches = await prisma.match.count();
    const activeMatches = await prisma.match.count({
      where: { status: 'PLAYING' }
    });
    const activeRooms = await prisma.room.count();

    const topPlayers = await prisma.user.findMany({
      orderBy: { eloScore: 'desc' },
      take: 5,
      select: {
        id: true,
        username: true,
        eloScore: true,
        winMatches: true,
      }
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalMatches,
        activeMatches,
        activeRooms,
        topPlayers
      }
    });
  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const getUsersList = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const users = await prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        eloScore: true,
        winMatches: true,
        loseMatches: true,
        drawMatches: true,
        role: true,
        createdAt: true,
      }
    });

    const total = await prisma.user.count();

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    console.error('Error in getUsersList:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const getMatchesList = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const matches = await prisma.match.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        redPlayer: { select: { username: true } },
        blackPlayer: { select: { username: true } },
        _count: { select: { moves: true } }
      }
    });

    const total = await prisma.match.count();

    res.json({
      success: true,
      data: {
        matches,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    console.error('Error in getMatchesList:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const getBotSettings = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.botSetting.findMany({
      orderBy: { depth: 'asc' }
    });
    res.json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    console.error('Error in getBotSettings:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const updateBotSetting = async (req: Request, res: Response) => {
  try {
    const difficulty = req.params.difficulty as string;
    const { depth, movetime } = req.body;
    
    if (depth === undefined || movetime === undefined) {
      res.status(400).json({ error: 'Thiếu tham số depth hoặc movetime' });
      return;
    }

    const updated = await prisma.botSetting.upsert({
      where: { difficulty },
      update: { depth: Number(depth), movetime: Number(movetime) },
      create: { difficulty, depth: Number(depth), movetime: Number(movetime) }
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error: any) {
    console.error('Error in updateBotSetting:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};
