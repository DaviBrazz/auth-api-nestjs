// redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisClient } from './redis.client';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly redisClient: RedisClient) {}

  async onModuleInit() {
    await this.redisClient.connect();
  }

  async onModuleDestroy() {
    await this.redisClient.disconnect();
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) {
      await this.redisClient.client.set(key, value, { EX: ttlSeconds });
    } else {
      await this.redisClient.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redisClient.client.get(key);
  }

  async del(key: string) {
    return this.redisClient.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.client.exists(key);
    return result === 1;
  }
}
