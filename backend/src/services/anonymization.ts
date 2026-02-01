import * as UserModel from '../models/user.js';
import * as SessionModel from '../models/session.js';

const GRACE_PERIOD_DAYS = 30;

export async function anonymizePendingDeletions(): Promise<void> {
  const users = await UserModel.findPendingDeletion(GRACE_PERIOD_DAYS);

  for (const user of users) {
    // Delete all sessions
    await SessionModel.deleteByUserId(user.id);

    // Anonymize user record
    await UserModel.anonymize(user.id);

    // TODO: Delete API keys, webhooks, bulk job files (Epic 2-6)
    // These will be implemented in later epics

    console.log(`Anonymized user ${user.id} (was ${user.email})`);
  }

  console.log(
    `Anonymization cron completed: ${users.length} accounts anonymized`,
  );
}
