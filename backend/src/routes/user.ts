import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as UserProfileService from '../services/user-profile.js';
import * as CreditService from '../services/credit.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * PUT /api/user/profile/name
 * Update user's first and last name
 */
router.put('/profile/name', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({
        error: 'firstName and lastName are required',
      });
    }

    await UserProfileService.updateName(req.user!.id, firstName, lastName);

    res.json({
      message: 'Name updated successfully',
      user: {
        firstName,
        lastName,
      },
    });
  } catch (error) {
    console.error('Update name error:', error);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

/**
 * GET /api/user/profile
 * Get complete user profile with credits
 * Automatically awards signup bonus if user has no credits yet
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userProfile = await UserProfileService.getProfile(req.user!.id);

    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get credits and award signup bonus if this is their first time
    let credits = await CreditService.getBalance(req.user!.id);
    if (credits === 0) {
      // No credit events yet - award signup bonus
      await CreditService.awardSignupBonus(req.user!.id);
      credits = await CreditService.getBalance(req.user!.id);
    }

    // Check if user has linked Google account
    // TODO: Query accounts table to check
    const googleLinked = false;

    res.json({
      user: {
        id: userProfile.id,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        email: userProfile.email,
        emailVerified: userProfile.emailVerified,
        avatarUrl: userProfile.image,
        language: userProfile.language,
        dataRetentionDays: userProfile.dataRetentionDays,
        deletionRequestedAt: userProfile.deletionRequestedAt,
        createdAt: userProfile.createdAt.toISOString(),
        plan: 'Free', // TODO: Implement plan logic
        credits,
        googleLinked,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

export const userRoutes = router;
