import { Server as SocketServer } from 'socket.io';

let _io: SocketServer | null = null;

export function setIo(io: SocketServer) {
  _io = io;
}

export function getIo(): SocketServer {
  if (!_io) throw new Error('Socket.io not initialised');
  return _io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  _io?.to(`user:${userId}`).emit(event, data);
}

export function emitToAll(event: string, data: unknown) {
  _io?.emit(event, data);
}
