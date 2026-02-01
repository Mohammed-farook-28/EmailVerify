import { z } from 'zod';

export const signUpSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().max(255).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(128),
  terms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms of service' }),
  }),
});

export const signInSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  userId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const resendVerificationSchema = z.object({
  userId: z.string().uuid(),
});

export const passwordResetSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
});

export const passwordResetVerifySchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  newPassword: z.string().min(8).max(128),
});

export const updateNameSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
});

export const updateEmailSchema = z.object({
  newEmail: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export const verifyEmailChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const updateLanguageSchema = z.object({
  language: z.enum(['en']),
});

export const updateDataRetentionSchema = z.object({
  retentionDays: z.number().refine((v) => [7, 14, 30, 60, 90].includes(v), {
    message: 'Retention days must be 7, 14, 30, 60, or 90',
  }),
});

export const updateBillingInfoSchema = z.object({
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});

export const deletionCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  password: z.string().optional(),
});

export const deleteAccountSchema = z.object({
  password: z.string().optional(),
  confirmationCode: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
