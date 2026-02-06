import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EmailKit API',
      version: '1.0.0',
      description: 'Email verification SaaS platform API',
      contact: {
        name: 'EmailKit Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'API key with `ek_` prefix (e.g., `ek_Ue7HpvL9...`)',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'better-auth.session_token',
          description: 'Session cookie from Better Auth',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            email: { type: 'string' },
            emailVerified: { type: 'boolean' },
            avatarUrl: { type: 'string', nullable: true },
            language: { type: 'string' },
            dataRetentionDays: { type: 'integer' },
            deletionRequestedAt: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            plan: { type: 'string' },
            credits: { type: 'integer' },
            googleLinked: { type: 'boolean' },
          },
        },
        VerificationResult: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            status: { type: 'string', enum: ['valid', 'invalid', 'risky', 'unknown'] },
            score: { type: 'number', minimum: 0, maximum: 1 },
            deliverability: { type: 'string', enum: ['deliverable', 'undeliverable', 'risky', 'unknown'] },
            attributes: {
              type: 'object',
              properties: {
                disposable: { type: 'boolean' },
                freeProvider: { type: 'boolean' },
                roleAccount: { type: 'boolean' },
                catchAll: { type: 'boolean' },
                mxRecordsFound: { type: 'boolean' },
                smtpValid: { type: 'boolean' },
              },
            },
          },
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            keyPrefix: { type: 'string' },
            isTest: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'expired', 'revoked'] },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
            usageCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
            secretPrefix: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
            payloadMode: { type: 'string', enum: ['full', 'summary'] },
            status: { type: 'string', enum: ['active', 'failing', 'paused'] },
            failureCount: { type: 'integer' },
            lastDeliveryAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        BulkJob: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sourceType: { type: 'string', enum: ['file', 'paste'] },
            filename: { type: 'string', nullable: true },
            totalCount: { type: 'integer' },
            processedCount: { type: 'integer' },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            validCount: { type: 'integer' },
            invalidCount: { type: 'integer' },
            riskyCount: { type: 'integer' },
            unknownCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        CreditBalance: {
          type: 'object',
          properties: {
            balance: { type: 'integer' },
            subscription: {
              type: 'object',
              nullable: true,
              properties: {
                planId: { type: 'string' },
                status: { type: 'string' },
                currentPeriodEnd: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'User', description: 'User profile and settings (session auth)' },
      { name: 'Verification', description: 'Email verification (session auth)' },
      { name: 'Bulk', description: 'Bulk verification jobs (session auth)' },
      { name: 'Billing', description: 'Credits and payments (session auth)' },
      { name: 'API Keys', description: 'API key management (session auth)' },
      { name: 'Webhooks', description: 'Webhook management (session auth)' },
      { name: 'Public API', description: 'Public API v1 (API key auth)' },
    ],
  },
  apis: ['./src/routes/**/*.ts', './src/docs/*.yaml'],
};

export const swaggerSpec = swaggerJsdoc(options);
