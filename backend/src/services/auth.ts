import * as UserModel from '../models/user.js';
import * as SessionModel from '../models/session.js';
import * as VerificationCodeModel from '../models/verification-code.js';
import * as CreditEventModel from '../models/credit-event.js';
import * as EmailService from './email.js';
import { hashPassword, verifyPassword, hashToken } from '../lib/crypto.js';
import { serializeUser, type SerializedUser } from '../lib/serializers.js';
import {
  AuthError,
  ConflictError,
  GoneError,
  RateLimitError,
} from '../lib/errors.js';
import { redis } from '../config/redis.js';

// --- US1: Sign-Up ---

export async function signUp(data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const existing = await UserModel.findByEmail(data.email);
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(data.password);
  const user = await UserModel.create({
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    passwordHash,
  });

  const { code } = await VerificationCodeModel.create(
    user.id,
    'email_verification',
  );
  await EmailService.sendVerificationCode(data.email, code);

  return { userId: user.id };
}

// --- US1: Verify Email ---

export async function verifyEmail(
  userId: string,
  code: string,
): Promise<{ user: SerializedUser; token: string }> {
  const record = await VerificationCodeModel.findActiveByUserAndPurpose(
    userId,
    'email_verification',
  );

  if (!record) {
    throw new GoneError('Code expired', 'resend');
  }

  const attempts = await VerificationCodeModel.incrementAttempts(record.id);
  const codeHash = hashToken(code);

  if (codeHash !== record.code_hash) {
    const remaining = 5 - attempts;
    if (remaining <= 0) {
      throw new AuthError('Too many attempts. Please request a new code.');
    }
    throw Object.assign(new AuthError('Invalid code'), {
      attemptsRemaining: remaining,
    });
  }

  await VerificationCodeModel.markConsumed(record.id);
  await UserModel.setEmailVerified(userId);

  // Allocate signup bonus credits
  const creditEvent = await CreditEventModel.allocateSignupBonus(userId);

  const user = await UserModel.findById(userId);
  if (!user) throw new AuthError('User not found');

  const { token } = await SessionModel.create(userId);

  return {
    user: serializeUser({
      ...user,
      email_verified: true,
      credits: creditEvent.balance_after,
    }),
    token,
  };
}

// --- US1: Resend Verification ---

export async function resendVerification(userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  // Anti-enumeration: always return success
  if (!user || user.email_verified) return;

  const { code } = await VerificationCodeModel.create(
    userId,
    'email_verification',
  );
  await EmailService.sendVerificationCode(user.email, code);
}

// --- US2: Sign-In ---

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: SerializedUser; token: string }> {
  const user = await UserModel.findByEmail(email);

  // Anti-enumeration: generic error for missing user or wrong password
  if (!user || !user.password_hash) {
    throw new AuthError('Invalid credentials');
  }

  // Check lockout
  const lockoutKey = `lockout:${email}`;
  const locked = await redis.get(lockoutKey);
  if (locked) {
    const ttl = await redis.ttl(lockoutKey);
    throw new RateLimitError('Account temporarily locked', ttl > 0 ? ttl : 1800);
  }

  if (!user.email_verified) {
    throw Object.assign(new AuthError('Email not verified'), {
      statusCode: 403,
      action: 'verify_email',
      userId: user.id,
    });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    // Track failed attempts
    const attemptKey = `ratelimit:signin:${email}`;
    const now = Date.now();
    await redis.zadd(attemptKey, now.toString(), `${now}`);
    await redis.expire(attemptKey, 900); // 15 min window
    const failCount = await redis.zcard(attemptKey);

    if (failCount >= 5) {
      await redis.set(lockoutKey, '1', 'EX', 1800); // 30 min lockout
    }

    throw new AuthError('Invalid credentials');
  }

  // Clear failed attempts on success
  await redis.del(`ratelimit:signin:${email}`);

  // Cancel deletion if in grace period
  if (user.deletion_requested_at) {
    await UserModel.cancelDeletion(user.id);
    await EmailService.sendDeletionCancelled(user.email);
  }

  const { token } = await SessionModel.create(user.id);
  const credits = await CreditEventModel.getBalance(user.id);

  return {
    user: serializeUser({ ...user, credits }),
    token,
  };
}

// --- US3: Google OAuth ---

interface GoogleProfile {
  id: string;
  emails?: Array<{ value: string; verified?: boolean }>;
  name?: { givenName?: string; familyName?: string };
  photos?: Array<{ value: string }>;
}

export async function handleGoogleCallback(
  profile: GoogleProfile,
  existingSessionId?: string,
): Promise<{ user: SerializedUser; token: string; isReauth: boolean }> {
  const googleId = profile.id;
  const email = profile.emails?.[0]?.value?.toLowerCase();
  if (!email) throw new AuthError('No email from Google');

  const firstName = profile.name?.givenName ?? '';
  const lastName = profile.name?.familyName ?? '';
  const avatarUrl = profile.photos?.[0]?.value ?? null;

  // Check if this is a re-auth (existing session)
  if (existingSessionId) {
    await SessionModel.updateLastAuthenticated(existingSessionId);
    const session = await SessionModel.findByTokenHash(existingSessionId);
    if (session) {
      const user = await UserModel.findById(session.user_id);
      if (user) {
        const credits = await CreditEventModel.getBalance(user.id);
        return {
          user: serializeUser({ ...user, credits }),
          token: '', // Not creating new session
          isReauth: true,
        };
      }
    }
  }

  // Find by Google ID first
  let user = await UserModel.findByGoogleId(googleId);

  if (!user) {
    // Find by email to link existing account
    user = await UserModel.findByEmail(email);
    if (user) {
      await UserModel.updateGoogleId(user.id, googleId);
      user = await UserModel.findById(user.id);
    }
  }

  if (!user) {
    // Create new user
    user = await UserModel.create({
      email,
      firstName,
      lastName,
      googleId,
      emailVerified: true,
      avatarUrl: avatarUrl ?? undefined,
    });
    await CreditEventModel.allocateSignupBonus(user.id);
  }

  // Cancel deletion if in grace period
  if (user.deletion_requested_at) {
    await UserModel.cancelDeletion(user.id);
    await EmailService.sendDeletionCancelled(user.email);
  }

  const { token } = await SessionModel.create(user.id);
  const credits = await CreditEventModel.getBalance(user.id);

  return {
    user: serializeUser({ ...user, credits }),
    token,
    isReauth: false,
  };
}

// --- US5: Sign-Out ---

export async function signOut(sessionId: string): Promise<void> {
  await SessionModel.deleteById(sessionId);
}

// --- US4: Password Reset ---

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await UserModel.findByEmail(email);
  // Anti-enumeration: always return success
  if (!user) return;

  const { code } = await VerificationCodeModel.create(
    user.id,
    'password_reset',
  );
  await EmailService.sendPasswordResetCode(email, code);
}

export async function verifyPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ user: SerializedUser; token: string }> {
  const user = await UserModel.findByEmail(email);
  if (!user) throw new AuthError('Invalid code');

  const record = await VerificationCodeModel.findActiveByUserAndPurpose(
    user.id,
    'password_reset',
  );

  if (!record) {
    throw new GoneError('Code expired');
  }

  const attempts = await VerificationCodeModel.incrementAttempts(record.id);
  const codeHash = hashToken(code);

  if (codeHash !== record.code_hash) {
    const remaining = 5 - attempts;
    if (remaining <= 0) {
      throw new AuthError('Too many attempts. Please request a new code.');
    }
    throw new AuthError('Invalid code');
  }

  await VerificationCodeModel.markConsumed(record.id);

  const passwordHash = await hashPassword(newPassword);
  await UserModel.updatePassword(user.id, passwordHash);

  // Invalidate all sessions
  await SessionModel.deleteByUserId(user.id);

  // Create new session
  const { token } = await SessionModel.create(user.id);
  const credits = await CreditEventModel.getBalance(user.id);

  const updatedUser = await UserModel.findById(user.id);
  if (!updatedUser) throw new AuthError('User not found');

  return {
    user: serializeUser({ ...updatedUser, credits }),
    token,
  };
}
