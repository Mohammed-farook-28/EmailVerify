// TODO: This file needs to be migrated to use Drizzle ORM and Better Auth
// Current user models use old snake_case schema, need to migrate to camelCase Better Auth schema
// For now, routes will have type errors until models are migrated

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { attachCsrfToken, validateCsrf } from '../middleware/csrf.js';
import { requireReauth } from '../middleware/require-reauth.js';
import { validate } from '../middleware/validate.js';
import { byUser, rateLimit } from '../middleware/rate-limit.js';
import {
  updateNameSchema,
  updateLanguageSchema,
  updateEmailSchema,
  verifyEmailChangeSchema,
  updatePasswordSchema,
  updateBillingInfoSchema,
  updateDataRetentionSchema,
  deletionCodeSchema,
  deleteAccountSchema,
} from '../lib/schemas.js';
import { serializeUser, serializeBetterAuthUser } from '../lib/serializers.js';
import * as UserModel from '../models/user.js';
import * as CreditEventModel from '../models/credit-event.js';
import * as BillingInfoModel from '../models/billing-info.js';
import * as UserService from '../services/user.js';
import * as AvatarService from '../services/avatar.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// All profile routes require auth
router.use(requireAuth);
router.use(attachCsrfToken);
router.use(validateCsrf);

// --- US5: GET /home/profile ---
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credits = await CreditEventModel.getBalance(req.user!.id);
      // TODO: Migrate to serializeBetterAuthUser once models are migrated
      res.json({ user: serializeUser({ ...req.user!, credits } as any) });
    } catch (err) {
      next(err);
    }
  },
);

// --- US6: PUT /home/profile/name ---
router.put(
  '/name',
  validate(updateNameSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await UserModel.updateName(
        req.user!.id,
        req.body.firstName,
        req.body.lastName,
      );
      const credits = await CreditEventModel.getBalance(req.user!.id);
      res.json({ user: serializeUser({ ...updated, credits } as any) });
    } catch (err) {
      next(err);
    }
  },
);

// --- US6: PUT /home/profile/language ---
router.put(
  '/language',
  validate(updateLanguageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await UserModel.updateLanguage(
        req.user!.id,
        req.body.language,
      );
      const credits = await CreditEventModel.getBalance(req.user!.id);
      res.json({ user: serializeUser({ ...updated, credits } as any) });
    } catch (err) {
      next(err);
    }
  },
);

// --- US12: GET /home/profile/billing-info ---
router.get(
  '/billing-info',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const info = await BillingInfoModel.findByUserId(req.user!.id);
      res.json({
        billingInfo: info
          ? {
              address: info.address,
              city: info.city,
              state: info.state,
              postalCode: info.postal_code,
              country: info.country,
            }
          : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- US12: PUT /home/profile/billing-info ---
router.put(
  '/billing-info',
  validate(updateBillingInfoSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await BillingInfoModel.upsert(req.user!.id, req.body);
      res.json({ message: 'Billing information updated' });
    } catch (err) {
      next(err);
    }
  },
);

// --- US13: PUT /home/profile/data-retention ---
router.put(
  '/data-retention',
  validate(updateDataRetentionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserModel.updateDataRetentionDays(
        req.user!.id,
        req.body.retentionDays,
      );
      res.json({
        message: 'Data retention updated',
        retentionDays: req.body.retentionDays,
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- US7: Email Change ---
router.put(
  '/email',
  requireReauth,
  validate(updateEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserService.requestEmailChange(
        req.user!.id,
        req.body.newEmail,
        req.body.password,
      );
      res.json({
        message: 'Verification code sent to new email address',
        newEmail: req.body.newEmail,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/email/verify',
  validate(verifyEmailChangeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserService.confirmEmailChange(req.user!.id, req.body.code);
      const user = await UserModel.findById(req.user!.id);
      const credits = await CreditEventModel.getBalance(req.user!.id);
      res.json({
        message: 'Email updated successfully',
        user: serializeUser({ ...user!, credits } as any),
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- US8: Password Change ---
router.put(
  '/password',
  requireReauth,
  validate(updatePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserService.changePassword(
        req.user!.id,
        req.session!.id,
        req.body.currentPassword,
        req.body.newPassword,
      );
      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// --- US9: Avatar Upload ---
router.post(
  '/avatar',
  upload.single('avatar'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      const avatarUrl = await AvatarService.uploadAvatar(req.user!.id, req.file);
      res.json({ avatarUrl });
    } catch (err) {
      next(err);
    }
  },
);

// --- US10: Account Deletion (Code Request) ---
router.post(
  '/deletion-code',
  requireReauth,
  byUser('deletion-code', 3, 3600), // 3 per hour
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserService.requestDeletionCode(req.user!.id);
      res.json({ message: 'Deletion code sent to your email' });
    } catch (err) {
      next(err);
    }
  },
);

// --- US10: Account Deletion (Confirm) ---
router.delete(
  '/',
  validate(deleteAccountSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserService.requestDeletion(
        req.user!.id,
        req.body.confirmationCode,
      );
      res.json({
        message:
          'Account scheduled for deletion. You have 30 days to cancel by signing in.',
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- US11: Data Export ---
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await UserService.exportData(req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export const profileRoutes = router;
