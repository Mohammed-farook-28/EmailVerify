import { db } from '../db/index.js';
import { user } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Update user's first and last name
 */
export async function updateName(
  userId: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  await db
    .update(user)
    .set({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/**
 * Get user profile with credits
 */
export async function getProfile(userId: string) {
  const [userProfile] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return userProfile;
}
