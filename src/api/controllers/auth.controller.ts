import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwtToken from 'jsonwebtoken';
import prisma from '../../utils/prisma';

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, username, password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email || '' },
          { username: username || '' }
        ]
      }
    });

    if (!user) {
      res.status(401).json({ error: 'Thông tin đăng nhập không hợp lệ' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Thông tin đăng nhập không hợp lệ' });
      return;
    }

    const token = jwtToken.sign(
      { userId: user.id, role: user.role }, 
      process.env.JWT_SECRET || 'secret', 
      { expiresIn: '1h' }
    );

    res.status(200).json({
      token,
      expiresIn: 3600,
      user: {
        userId: user.id,
        username: user.username,
        email: user.email,
        eloScore: user.eloScore,
        winMatches: user.winMatches,
        loseMatches: user.loseMatches,
        drawMatches: user.drawMatches,
        role: user.role,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, username, password } = req.body;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      res.status(409).json({ error: 'Tên người dùng hoặc email đã tồn tại' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash
      }
    });

    const token = jwtToken.sign(
      { userId: newUser.id, role: newUser.role }, 
      process.env.JWT_SECRET || 'secret', 
      { expiresIn: '1h' }
    );

    res.status(201).json({
      token,
      expiresIn: 3600,
      user: {
        userId: newUser.id,
        username: newUser.username,
        email: newUser.email,
        eloScore: newUser.eloScore,
        winMatches: newUser.winMatches,
        loseMatches: newUser.loseMatches,
        drawMatches: newUser.drawMatches,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
  }
};
