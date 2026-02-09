import IORedis from 'ioredis';
import { env } from './env.js';

export const redis = new IORedis.default(env.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5_000);
    return delay;
  },
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
