import IORedis from 'ioredis';
import { env } from './env.js';

export const redis = new IORedis.default(env.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5_000);
    return delay;
  },
});

/** Redis connection configured for BullMQ workers (maxRetriesPerRequest must be null) */
export const bullRedis = new IORedis.default(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5_000);
    return delay;
  },
});

/** Dedicated Redis connection for pub/sub subscriptions (cannot reuse main connection) */
const redisSub = new IORedis.default(env.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5_000);
    return delay;
  },
});

export type PubSubHandler = (channel: string, message: string) => void;

/**
 * Reference-counted pub/sub subscription manager.
 *
 * Solves the problem where redisSub.unsubscribe() is connection-level:
 * if two SSE handlers subscribe to the same channel, unsubscribing one
 * must NOT kill the other. This manager tracks per-channel handler sets
 * and only issues real subscribe/unsubscribe when the count goes 0→1 or 1→0.
 */
class PubSubManager {
  private handlers = new Map<string, Set<PubSubHandler>>();

  constructor() {
    // Single global message dispatcher — fires for all channels
    redisSub.on('message', (channel: string, message: string) => {
      const channelHandlers = this.handlers.get(channel);
      if (!channelHandlers) return;
      for (const handler of channelHandlers) {
        handler(channel, message);
      }
    });
  }

  /** Subscribe a handler to a channel. First handler triggers real Redis SUBSCRIBE. */
  subscribe(channel: string, handler: PubSubHandler): void {
    let channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) {
      channelHandlers = new Set();
      this.handlers.set(channel, channelHandlers);
      redisSub.subscribe(channel);
    }
    channelHandlers.add(handler);
  }

  /** Unsubscribe a handler. Last handler triggers real Redis UNSUBSCRIBE. */
  unsubscribe(channel: string, handler: PubSubHandler): void {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) return;
    channelHandlers.delete(handler);
    if (channelHandlers.size === 0) {
      this.handlers.delete(channel);
      redisSub.unsubscribe(channel);
    }
  }
}

export const pubsub = new PubSubManager();

export async function closeRedis(): Promise<void> {
  await redisSub.quit();
  await bullRedis.quit();
  await redis.quit();
}
