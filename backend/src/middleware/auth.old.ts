import type { Request, Response, NextFunction } from 'express';
import { hashToken } from '../lib/crypto.js';
import * as SessionModel from '../models/session.js';
import * as UserModel from '../models/user.js';
import type { UserRow } from '../models/user.js';
import type { SessionRow } from '../models/session.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      session?: SessionRow;
      sessionToken?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.ev_session;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const tokenHash = hashToken(token);
  const session = await SessionModel.findByTokenHash(tokenHash);
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await UserModel.findById(session.user_id);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  req.user = user;
  req.session = session;
  req.sessionToken = token;
  next();
}
