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

const app = express();

app.use(helmet());
app.use(logger);
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

// Now safe to add JSON parser
app.use(express.json());

// Custom routes
app.use('/api/user', userRoutes);
app.use('/home/profile', profileRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler (must be last)
app.use(errorHandler);

export { app };
