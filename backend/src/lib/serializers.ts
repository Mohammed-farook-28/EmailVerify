// Old UserRow interface (kept for backward compatibility during migration)
interface UserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  google_id: string | null;
  email_verified: boolean;
  language: string;
  data_retention_days: number;
  deletion_requested_at: Date | null;
  created_at: Date;
  plan?: string;
  credits?: number;
}

// Better Auth user interface (camelCase)
export interface BetterAuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  firstName?: string | null;
  lastName?: string | null;
  language?: string;
  deletionRequestedAt?: Date | null;
  plan?: string;
  credits?: number;
  googleLinked?: boolean;
}

export interface SerializedUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  plan: string;
  credits: number;
  avatarUrl: string | null;
  language: string;
  emailVerified: boolean;
  googleLinked: boolean;
  deletionRequestedAt: string | null;
  createdAt: string;
}

// Serialize Better Auth user (new)
export function serializeBetterAuthUser(user: BetterAuthUser): SerializedUser {
  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email,
    plan: user.plan ?? 'Free',
    credits: user.credits ?? 0,
    avatarUrl: user.image ?? null,
    language: user.language ?? 'en',
    emailVerified: user.emailVerified,
    googleLinked: user.googleLinked ?? false,
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// Old serializer (kept for backward compatibility)
export function serializeUser(row: UserRow): SerializedUser {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    plan: row.plan ?? 'Free',
    credits: row.credits ?? 0,
    avatarUrl: row.avatar_url,
    language: row.language,
    emailVerified: row.email_verified,
    googleLinked: row.google_id !== null,
    deletionRequestedAt: row.deletion_requested_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
