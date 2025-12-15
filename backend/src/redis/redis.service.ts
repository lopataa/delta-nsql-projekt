import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

const TASK_INDEX = 'idx:tasks';
const USER_INDEX = 'idx:users';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  async onModuleInit() {
    await this.ensureBaseClients();
    await this.ensureIndexes();
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client?.quit(), this.subscriber?.quit(), this.publisher?.quit()]);
  }

  getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(this.getOptions());
    }
    return this.client;
  }

  getSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = new Redis(this.getOptions());
    }
    return this.subscriber;
  }

  getPublisher(): Redis {
    if (!this.publisher) {
      this.publisher = new Redis(this.getOptions());
    }
    return this.publisher;
  }

  private getOptions(): RedisOptions {
    return {
      host: process.env.REDIS_HOST ?? 'redis',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: false,
    };
  }

  private async ensureBaseClients() {
    const options = this.getOptions();
    this.client = this.client ?? new Redis(options);
    this.subscriber = this.subscriber ?? new Redis(options);
    this.publisher = this.publisher ?? new Redis(options);

    await Promise.all([this.ensureConnected(this.client), this.ensureConnected(this.subscriber), this.ensureConnected(this.publisher)]);
  }

  private async ensureConnected(client: Redis) {
    client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    await client.ping();
  }

  private async ensureIndexes() {
    await this.createTaskIndex();
    await this.createUserIndex();
  }

  private async createTaskIndex() {
    try {
      await this.client.call(
        'FT.CREATE',
        TASK_INDEX,
        'ON',
        'JSON',
        'PREFIX',
        '1',
        'task:',
        'SCHEMA',
        '$.title',
        'AS',
        'title',
        'TEXT',
        '$.description',
        'AS',
        'description',
        'TEXT',
        '$.category',
        'AS',
        'category',
        'TAG',
        '$.status',
        'AS',
        'status',
        'TAG',
        '$.userId',
        'AS',
        'userId',
        'TAG',
      );
      this.logger.log('Created FT index for tasks');
    } catch (error) {
      if (error?.message?.includes('Index already exists')) {
        this.logger.log('Task index already exists, skipping');
        return;
      }
      this.logger.error('Failed to create task index', error as Error);
    }
  }

  private async createUserIndex() {
    try {
      await this.client.call('FT.CREATE', USER_INDEX, 'ON', 'JSON', 'PREFIX', '1', 'user:', 'SCHEMA', '$.email', 'AS', 'email', 'TEXT');
      this.logger.log('Created FT index for users');
    } catch (error) {
      if (error?.message?.includes('Index already exists')) {
        this.logger.log('User index already exists, skipping');
        return;
      }
      this.logger.error('Failed to create user index', error as Error);
    }
  }
}
