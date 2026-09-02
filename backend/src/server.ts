import './config'; // validate env first
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { setIo } from './lib/socket';
import { errorMiddleware } from './utils/errors';
import { apiLimiter } from './middleware/rateLimit.middleware';

import authRoutes from './routes/auth.routes';
import tasksRoutes from './routes/tasks.routes';
import usersRoutes from './routes/users.routes';
import payoutsRoutes from './routes/payouts.routes';
import adminRoutes from './routes/admin.routes';

const app = express();
const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: config.FRONTEND_URL,
    credentials: true,
  },
});
setIo(io);

io.on('connection', socket => {
  socket.on('join', (userId: string) => {
    if (typeof userId === 'string' && userId.length < 64) {
      socket.join(`user:${userId}`);
    }
  });
});

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors({
    origin: config.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve frontend static files from repo root
app.use(
  express.static(path.join(__dirname, '../../'), {
    index: 'index.html',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/payouts', payoutsRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, data: { status: 'healthy', timestamp: new Date().toISOString() } });
});

// SPA fallback — serve index.html for any unmatched GET (not API)
app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'Not found.' });
  }
  res.sendFile(path.join(__dirname, '../../index.html'));
});

app.use(errorMiddleware);

const PORT = parseInt(config.PORT, 10);
httpServer.listen(PORT, () => {
  console.log(`Onlywork backend running on http://localhost:${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
});

export { app, io };
