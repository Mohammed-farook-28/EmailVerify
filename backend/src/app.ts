import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';
import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { auth } from './lib/auth.js';
import { profileRoutes } from './routes/profile.js';
import { userRoutes } from './routes/user.js';
import healthRoutes from './routes/health.js';
import verificationRoutes from './routes/verification.js';
import dashboardRoutes from './routes/dashboard.js';
import billingRoutes from './routes/billing.js';
import webhookRoutes from './routes/webhooks.js';
import bulkRoutes from './routes/bulk.js';
import { metricsMiddleware } from './lib/metrics.js';
import { expressLogger } from './config/logger.js';

const app = express();

app.use(helmet());
app.use(logger);
app.use(expressLogger()); // Pino request logger
app.use(metricsMiddleware()); // Prometheus metrics
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  }),
);
app.use(cookieParser());

// CRITICAL: Better Auth routes MUST come BEFORE express.json()
// Otherwise the API will get stuck and not respond
app.all('/api/auth/*', toNodeHandler(auth));

// CRITICAL: Stripe webhooks need raw body for signature verification
// Must come BEFORE express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

// Now safe to add JSON parser for other routes
app.use(express.json());

// Health and metrics endpoints (no auth required)
app.use('/health', healthRoutes);

// Custom routes
app.use('/api/user', userRoutes);
app.use('/home/profile', profileRoutes);
app.use('/home', verificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/bulk', bulkRoutes);

// Error handler (must be last)
app.use(errorHandler);

export { app };
