import * as SessionModel from '../models/session.js';

export async function cleanupExpiredSessions(): Promise<void> {
  await SessionModel.deleteExpired();
  console.log('Session cleanup cron completed');
}
