import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { initSockets } from './sockets';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Khởi tạo Sockets
initSockets(io);

import authRoutes from './api/routes/auth.routes';
import userRoutes from './api/routes/user.routes';
import aiRoutes from './api/routes/ai.routes';
import adminRoutes from './api/routes/admin.routes';

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/engine', aiRoutes);
app.use('/api/v1/admin', adminRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Xiangqi Backend is running' });
});



const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3579);
server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});
