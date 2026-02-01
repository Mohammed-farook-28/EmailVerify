import { Router, type Request, type Response, type NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { byIp, byBody } from '../middleware/rate-limit.js';
import {
  signUpSchema,
  signInSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  passwordResetSchema,
  passwordResetVerifySchema,
} from '../lib/schemas.js';
import * as AuthService from '../services/auth.js';
import { passport } from '../config/passport.js';
import { env } from '../config/env.js';

const router = Router();

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function setSessionCookie(res: Response, token: string): void {
  res.cookie('ev_session', token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.cookie('ev_session', '', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
}

// --- US1: Sign-Up ---

router.post(
  '/sign-up',
  byIp('signup', 3, 3600),
  validate(signUpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.signUp(req.body);
      res.status(201).json({
        message: 'Verification code sent to your email',
        userId: result.userId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- US1: Verify Email ---

router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, token } = await AuthService.verifyEmail(
        req.body.userId,
        req.body.code,
      );
      setSessionCookie(res, token);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
);

// --- US1: Resend Verification ---

router.post(
  '/resend-verification',
  validate(resendVerificationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.resendVerification(req.body.userId);
      res.json({
        message:
          'If the account exists and is unverified, a new code has been sent',
      });
    } catch (err) {
      next(err);
    }
  },
);

// --- US2: Sign-In ---

router.post(
  '/sign-in',
  byBody('signin', 'email', 5, 900, 1800),
  validate(signInSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, token } = await AuthService.signIn(
        req.body.email,
        req.body.password,
      );
      setSessionCookie(res, token);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
);

// --- US5: Sign-Out ---

router.post(
  '/sign-out',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.signOut(req.session!.id);
      clearSessionCookie(res);
      res.json({ message: 'Signed out' });
    } catch (err) {
      next(err);
    }
  },
);

// --- US4: Password Reset ---

router.post(
  '/password-reset',
  byBody('pwreset', 'email', 3, 3600),
  validate(passwordResetSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.requestPasswordReset(req.body.email);
      res.json({
        message: 'If an account exists, a reset code has been sent',
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/password-reset/verify',
  validate(passwordResetVerifySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, token } = await AuthService.verifyPasswordReset(
        req.body.email,
        req.body.code,
        req.body.newPassword,
      );
      setSessionCookie(res, token);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
);

// --- US3: Google OAuth ---

router.get(
  '/google',
  (req: Request, res: Response, next: NextFunction) => {
    const reauth = req.query.reauth === 'true';
    passport.authenticate('google', {
      scope: ['openid', 'email', 'profile'],
      prompt: reauth ? 'consent' : undefined,
      state: reauth ? 'reauth' : undefined,
    } as Record<string, unknown>)(req, res, next);
  },
);

router.get(
  '/callback/google',
  byIp('oauth', 10, 60),
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.frontendUrl}/auth/callback?error=oauth_cancelled`,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = req.user as {
        id: string;
        emails?: Array<{ value: string }>;
        name?: { givenName?: string; familyName?: string };
        photos?: Array<{ value: string }>;
      };

      const isReauth = req.query.state === 'reauth';
      const result = await AuthService.handleGoogleCallback(profile);

      if (!result.isReauth && result.token) {
        setSessionCookie(res, result.token);
      }

      const redirectParam = isReauth ? 'reauth=true' : 'success=true';
      res.redirect(`${env.frontendUrl}/auth/callback?${redirectParam}`);
    } catch (err) {
      next(err);
    }
  },
);

export const authRoutes = router;
