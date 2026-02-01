import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendUrl: required('FRONTEND_URL'),
  backendUrl: optional('BACKEND_URL', 'http://localhost:3000'),

  databaseUrl: required('DATABASE_URL'),

  redisUrl: required('REDIS_URL'),

  sessionSecret: required('SESSION_SECRET'),
  csrfSecret: required('CSRF_SECRET'),

  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  googleCallbackUrl: required('GOOGLE_CALLBACK_URL'),

  resendApiKey: required('RESEND_API_KEY'),
  fromEmail: optional('FROM_EMAIL', 'noreply@emailkit.com'),

  doSpacesKey: required('DO_SPACES_KEY'),
  doSpacesSecret: required('DO_SPACES_SECRET'),
  doSpacesBucket: optional('DO_SPACES_BUCKET', 'emailkit-avatars'),
  doSpacesRegion: optional('DO_SPACES_REGION', 'nyc3'),
  doSpacesCdnUrl: required('DO_SPACES_CDN_URL'),

  signupBonusCredits: parseInt(optional('SIGNUP_BONUS_CREDITS', '100'), 10),

  get isDevelopment() {
    return this.nodeEnv === 'development';
  },
  get isProduction() {
    return this.nodeEnv === 'production';
  },
} as const;
