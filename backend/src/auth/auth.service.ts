import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SafeUser, UserDocument } from './user.interface';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class AuthService {
  constructor(private readonly redis: RedisService) {}

  private get client() {
    return this.redis.getClient();
  }

  private jwtSecret() {
    return process.env.JWT_SECRET || 'dev-secret';
  }

  private userKey(id: string) {
    return `user:${id}`;
  }

  private emailKey(email: string) {
    return `user:email:${email.toLowerCase()}`;
  }

  private tokenKey(token: string) {
    return `token:${token}`;
  }

  async register(payload: RegisterDto) {
    const existing = await this.client.get(this.emailKey(payload.email));
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const now = new Date().toISOString();
    const user: UserDocument = {
      id: randomUUID(),
      email: payload.email.toLowerCase(),
      name: payload.name,
      passwordHash: await bcrypt.hash(payload.password, 10),
      createdAt: now,
    };

    await this.client.call('JSON.SET', this.userKey(user.id), '$', JSON.stringify(user));
    await this.client.set(this.emailKey(user.email), user.id);

    const token = await this.saveToken(user);
    return { token, user: this.sanitizeUser(user) };
  }

  async login(payload: LoginDto) {
    const user = await this.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = await this.saveToken(user);
    return { token, user: this.sanitizeUser(user) };
  }

  async verifyToken(token: string | undefined): Promise<SafeUser | null> {
    if (!token) return null;
    try {
      jwt.verify(token, this.jwtSecret());
      const userId = await this.client.get(this.tokenKey(token));
      if (!userId) {
        return null;
      }
      const user = await this.findById(userId);
      return user ? this.sanitizeUser(user) : null;
    } catch {
      return null;
    }
  }

  async getProfile(userId: string): Promise<SafeUser | null> {
    const user = await this.findById(userId);
    return user ? this.sanitizeUser(user) : null;
  }

  private async findByEmail(email: string): Promise<UserDocument | null> {
    const id = await this.client.get(this.emailKey(email));
    if (!id) return null;
    return this.findById(id);
  }

  private async findById(id: string): Promise<UserDocument | null> {
    const raw = (await this.client.call('JSON.GET', this.userKey(id))) as string | null;
    if (!raw) return null;
    return JSON.parse(raw) as UserDocument;
  }

  private sanitizeUser(user: UserDocument): SafeUser {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  private async saveToken(user: UserDocument): Promise<string> {
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      this.jwtSecret(),
      { expiresIn: '7d' },
    );
    await this.client.set(this.tokenKey(token), user.id, 'EX', TOKEN_TTL_SECONDS);
    return token;
  }
}
