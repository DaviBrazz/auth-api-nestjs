// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisClient } from './redis.client';

@Module({
  providers: [RedisService, RedisClient],
  exports: [RedisService], 
})
export class RedisModule {}
