import * as SessionModel from '../models/session.js';
import { logger } from '../config/logger.js';

export async function cleanupExpiredSessions(): Promise<void> {
  await SessionModel.deleteExpired();
  logger.info('Session cleanup cron completed');
}
