import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Task } from './task.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { randomUUID } from 'crypto';

const TASK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TASK_STREAM = 'tasks:changes';
const TASK_CHANNEL = 'tasks:updates';

@Injectable()
export class TasksService {
  constructor(private readonly redis: RedisService) {}

  private get client() {
    return this.redis.getClient();
  }

  private get publisher() {
    return this.redis.getPublisher();
  }

  private taskKey(id: string) {
    return `task:${id}`;
  }

  async list(userId: string, filters: FilterTasksDto): Promise<Task[]> {
    const query = this.buildSearchQuery(userId, filters);
    const raw = (await this.client.call(
      'FT.SEARCH',
      'idx:tasks',
      query,
      'RETURN',
      '1',
      '$',
      'LIMIT',
      '0',
      '200',
    )) as unknown[];

    return this.parseSearchResults(raw);
  }

  async create(userId: string, payload: CreateTaskDto): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      userId,
      title: payload.title,
      description: payload.description ?? '',
      category: payload.category ?? 'General',
      status: 'open',
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    const key = this.taskKey(task.id);
    await this.client.call('JSON.SET', key, '$', JSON.stringify(task));
    await this.client.call('EXPIRE', key, TASK_TTL_SECONDS.toString());

    await this.recordChange('created', task);
    await this.publishUpdate('created', task);
    return task;
  }

  async update(userId: string, id: string, payload: UpdateTaskDto): Promise<Task> {
    const existing = await this.getTaskForUser(userId, id);
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const newStatus = payload.status ?? existing.status;
    const updated: Task = {
      ...existing,
      ...payload,
      status: newStatus,
      completed: newStatus === 'done',
      updatedAt: new Date().toISOString(),
    };

    const key = this.taskKey(id);
    await this.client.call('JSON.SET', key, '$', JSON.stringify(updated));
    await this.client.call('EXPIRE', key, TASK_TTL_SECONDS.toString());

    await this.recordChange('updated', updated);
    await this.publishUpdate('updated', updated);
    return updated;
  }

  async remove(userId: string, id: string) {
    const task = await this.getTaskForUser(userId, id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    await this.client.call('DEL', this.taskKey(id));
    await this.recordChange('deleted', task);
    await this.publishUpdate('deleted', { ...task, id });
    return { success: true };
  }

  async getTaskForUser(userId: string, id: string): Promise<Task | null> {
    const raw = (await this.client.call('JSON.GET', this.taskKey(id))) as string | null;
    if (!raw) return null;
    const task = JSON.parse(raw) as Task;
    if (task.userId !== userId) return null;
    return task;
  }

  private escapeTag(value: string): string {
    return value.replace(/([\\-\\,\\.\\s<>\\{\\}\\[\\]\"'\\:;|!@#\\$%\\^&\\*\\(\\)_\\+=])/g, '\\$1');
  }

  private buildSearchQuery(userId: string, filters: FilterTasksDto): string {
    const userTag = this.escapeTag(userId);
    const clauses = [`@userId:{${userTag}}`];
    if (filters.category) {
      clauses.push(`@category:{${this.escapeTag(filters.category)}}`);
    }
    if (filters.status) {
      clauses.push(`@status:{${filters.status}}`);
    }
    if (filters.q) {
      const term = filters.q.replace(/["']/g, '');
      clauses.push(`(@title|@description):(${term})`);
    }
    return clauses.join(' ') || '*';
  }

  private parseSearchResults(raw: unknown[]): Task[] {
    if (!Array.isArray(raw) || raw.length < 2) return [];
    const [, ...items] = raw;
    const tasks: Task[] = [];
    for (let i = 0; i < items.length; i += 2) {
      const entry = items[i + 1] as unknown[];
      if (!Array.isArray(entry)) continue;
      const jsonIndex = entry.findIndex((value) => value === '$');
      const json = jsonIndex >= 0 ? (entry[jsonIndex + 1] as string) : null;
      if (json) {
        tasks.push(JSON.parse(json) as Task);
      }
    }
    return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async recordChange(action: 'created' | 'updated' | 'deleted', task: Task) {
    await this.client.call(
      'XADD',
      TASK_STREAM,
      '*',
      'action',
      action,
      'taskId',
      task.id,
      'userId',
      task.userId,
      'category',
      task.category ?? '',
      'status',
      task.status,
      'title',
      task.title,
    );
  }

  private async publishUpdate(action: string, task: Task) {
    await this.publisher.publish(
      TASK_CHANNEL,
      JSON.stringify({
        action,
        task,
        userId: task.userId,
      }),
    );
  }
}
