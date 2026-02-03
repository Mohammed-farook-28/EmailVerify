/**
 * Bulk Email Verification Routes
 *
 * Endpoints:
 * - POST /api/bulk/upload - Upload CSV/Excel file for bulk verification
 * - GET /api/bulk/jobs/:jobId - Get job status
 * - GET /api/bulk/jobs/:jobId/progress - SSE stream for real-time progress
 * - GET /api/bulk/jobs/:jobId/results - Download results CSV
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { sseMiddleware, sendSSEEvent } from '../middleware/sse.js';
import { createLogger } from '../config/logger.js';
import { createBulkJob, getBulkJob } from '../services/bulk-verification.js';
import { SourceType } from '../types/bulk.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `bulk-upload-${uniqueSuffix}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  },
});

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * POST /api/bulk/upload
 *
 * Upload CSV or Excel file for bulk verification
 *
 * Request:
 * - multipart/form-data with 'file' field
 *
 * Response:
 * - 201: Job created successfully
 * - 400: Invalid file or validation error
 * - 402: Insufficient credits
 * - 409: User already has an active job
 */
router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const requestLogger = createLogger({
      userId,
      operation: 'bulk-upload',
    });

    let filePath: string | undefined;

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please upload a CSV or Excel file',
        });
      }

      filePath = req.file.path;
      const filename = req.file.originalname;

      requestLogger.info({ filename, size: req.file.size }, 'Processing bulk upload');

      // Create bulk job (this handles parsing, credit deduction, and queuing)
      const result = await createBulkJob({
        userId,
        filePath,
        filename,
        sourceType: SourceType.FILE,
      });

      // Clean up temporary file
      await fs.unlink(filePath);

      requestLogger.info(
        {
          jobId: result.jobId,
          totalCount: result.totalCount,
          creditsDeducted: result.creditsDeducted,
        },
        'Bulk job created successfully'
      );

      return res.status(201).json(result);
    } catch (error: any) {
      // Clean up temporary file on error
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch (unlinkError) {
          requestLogger.error({ error: unlinkError }, 'Failed to clean up temp file');
        }
      }

      requestLogger.error({ error }, 'Bulk upload failed');

      // Handle specific error types
      if (error.message.includes('active verification job')) {
        return res.status(409).json({
          error: 'Active job exists',
          message: error.message,
        });
      }

      if (error.message.includes('Insufficient credits')) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: error.message,
        });
      }

      if (error.message.includes('Invalid file') || error.message.includes('parsing error')) {
        return res.status(400).json({
          error: 'Invalid file',
          message: error.message,
        });
      }

      next(error);
    }
  }
);

/**
 * GET /api/bulk/jobs/:jobId
 *
 * Get job status and progress
 *
 * Response:
 * - 200: Job status
 * - 404: Job not found
 * - 403: Forbidden (job belongs to another user)
 */
router.get(
  '/jobs/:jobId',
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const { jobId } = req.params;

    try {
      const job = await getBulkJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          message: 'The requested job does not exist',
        });
      }

      if (job.userId !== userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this job',
        });
      }

      const progress = {
        jobId: job.id,
        processedCount: job.processedCount,
        totalCount: job.totalCount,
        percentage: Math.round((job.processedCount / job.totalCount) * 100),
        validCount: job.validCount,
        invalidCount: job.invalidCount,
        riskyCount: job.riskyCount,
        unknownCount: job.unknownCount,
      };

      return res.json({
        job,
        progress,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/bulk/jobs/:jobId/progress
 *
 * Server-Sent Events stream for real-time progress updates
 *
 * Events:
 * - progress: { processedCount, totalCount, percentage, counts }
 * - complete: { jobId, resultUrl }
 * - error: { error, message }
 */
router.get(
  '/jobs/:jobId/progress',
  sseMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const { jobId } = req.params;

    try {
      const job = await getBulkJob(jobId);

      if (!job) {
        sendSSEEvent(res, 'error', {
          error: 'Job not found',
          message: 'The requested job does not exist',
        });
        return res.end();
      }

      if (job.userId !== userId) {
        sendSSEEvent(res, 'error', {
          error: 'Forbidden',
          message: 'You do not have access to this job',
        });
        return res.end();
      }

      // Send initial progress
      const initialProgress = {
        jobId: job.id,
        processedCount: job.processedCount,
        totalCount: job.totalCount,
        percentage: Math.round((job.processedCount / job.totalCount) * 100),
        validCount: job.validCount,
        invalidCount: job.invalidCount,
        riskyCount: job.riskyCount,
        unknownCount: job.unknownCount,
      };

      sendSSEEvent(res, 'progress', initialProgress);

      // If job is already completed, send complete event
      if (job.status === 'completed') {
        sendSSEEvent(res, 'complete', {
          jobId: job.id,
          resultUrl: job.resultUrl,
        });
        return res.end();
      }

      if (job.status === 'failed') {
        sendSSEEvent(res, 'error', {
          error: 'Job failed',
          message: 'The verification job failed',
        });
        return res.end();
      }

      // Poll for updates every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const updatedJob = await getBulkJob(jobId);

          if (!updatedJob) {
            clearInterval(pollInterval);
            sendSSEEvent(res, 'error', { error: 'Job not found' });
            return res.end();
          }

          const progress = {
            jobId: updatedJob.id,
            processedCount: updatedJob.processedCount,
            totalCount: updatedJob.totalCount,
            percentage: Math.round((updatedJob.processedCount / updatedJob.totalCount) * 100),
            validCount: updatedJob.validCount,
            invalidCount: updatedJob.invalidCount,
            riskyCount: updatedJob.riskyCount,
            unknownCount: updatedJob.unknownCount,
          };

          sendSSEEvent(res, 'progress', progress);

          if (updatedJob.status === 'completed') {
            clearInterval(pollInterval);
            sendSSEEvent(res, 'complete', {
              jobId: updatedJob.id,
              resultUrl: updatedJob.resultUrl,
            });
            return res.end();
          }

          if (updatedJob.status === 'failed') {
            clearInterval(pollInterval);
            sendSSEEvent(res, 'error', {
              error: 'Job failed',
              message: 'The verification job failed',
            });
            return res.end();
          }
        } catch (error: any) {
          clearInterval(pollInterval);
          sendSSEEvent(res, 'error', {
            error: 'Internal error',
            message: error.message,
          });
          return res.end();
        }
      }, 2000); // Poll every 2 seconds

      // Clean up on client disconnect
      req.on('close', () => {
        clearInterval(pollInterval);
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/bulk/jobs/:jobId/results
 *
 * Download verification results as CSV
 *
 * Response:
 * - 200: CSV file download
 * - 404: Job not found or results not ready
 * - 403: Forbidden
 * - 410: Results expired
 */
router.get(
  '/jobs/:jobId/results',
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const { jobId } = req.params;

    try {
      const job = await getBulkJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          message: 'The requested job does not exist',
        });
      }

      if (job.userId !== userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this job',
        });
      }

      if (job.status !== 'completed') {
        return res.status(404).json({
          error: 'Results not ready',
          message: 'Job is still processing. Please wait for completion.',
        });
      }

      if (!job.resultUrl) {
        return res.status(404).json({
          error: 'Results not found',
          message: 'Results file is not available',
        });
      }

      // Check if results have expired
      if (job.resultExpiresAt && new Date() > job.resultExpiresAt) {
        return res.status(410).json({
          error: 'Results expired',
          message: 'Results are no longer available. They expire after 14 days.',
        });
      }

      // Redirect to pre-signed S3 URL
      return res.redirect(job.resultUrl);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
