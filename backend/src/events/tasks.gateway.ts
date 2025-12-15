import { Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { SafeUser } from '../auth/user.interface';
import { WebSocketGateway, OnGatewayInit, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

interface AuthenticatedSocket extends Socket {
  user?: SafeUser;
}

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
    credentials: true,
  },
})
export class TasksGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TasksGateway.name);
  private updatesSubscriber: Redis | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly redis: RedisService,
  ) {}

  async afterInit(server: Server) {
    const pub = this.redis.getPublisher().duplicate();
    const sub = this.redis.getSubscriber().duplicate();
    server.adapter(createAdapter(pub as any, sub as any));

    this.updatesSubscriber = this.redis.getSubscriber().duplicate();
    await this.updatesSubscriber.subscribe('tasks:updates');
    this.updatesSubscriber.on('message', (_channel, message) => {
      try {
        const payload = JSON.parse(message);
        if (payload?.userId) {
          server.to(payload.userId).emit('task:update', payload);
        } else {
          server.emit('task:update', payload);
        }
      } catch (error) {
        this.logger.error(`Failed to broadcast task update: ${(error as Error).message}`);
      }
    });

    this.logger.log('Tasks gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    const user = await this.authService.verifyToken(token);
    if (!user) {
      client.emit('auth_error', 'Unauthorized');
      return client.disconnect(true);
    }
    client.user = user;
    client.join(user.id);
    client.emit('ready', { user });
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = (client.handshake.auth as any)?.token;
    if (fromAuth) return fromAuth;
    const header = client.handshake.headers['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return undefined;
  }
}
