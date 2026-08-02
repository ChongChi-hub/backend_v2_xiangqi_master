import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Biến môi trường JWT_SECRET chưa được cấu hình');
  }
  return secret;
};

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Không có quyền truy cập: Không có token' });
    return;
  }

  try {
    const secret = getJwtSecret();
    jwt.verify(token, secret, (err, user) => {
      if (err) {
        res.status(403).json({ error: 'Bị từ chối: Token không hợp lệ hoặc đã hết hạn' });
        return;
      }
      req.user = user as { userId: string; role: string };
      next();
    });
  } catch {
    res.status(500).json({ error: 'Lỗi cấu hình máy chủ' });
  }
};

export const authorizeAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Bị từ chối: Bạn không có quyền quản trị viên' });
    return;
  }
  next();
};
