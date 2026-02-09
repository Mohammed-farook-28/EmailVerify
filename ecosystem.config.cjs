module.exports = {
  apps: [
    {
      name: 'emailkit-backend',
      cwd: '/Users/bot/Desktop/EmailVerify/backend',
      script: 'npx',
      args: 'tsx watch src/server.ts',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'emailkit-frontend',
      cwd: '/Users/bot/Desktop/Projects/emailverify-frontend-new',
      script: 'npx',
      args: 'next dev --turbopack -p 3001',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'emailkit-mock-upstream',
      cwd: '/Users/bot/Desktop/EmailVerify/backend',
      script: 'npx',
      args: 'tsx src/mock-upstream-api.ts',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'emailkit-bulk-worker',
      cwd: '/Users/bot/Desktop/EmailVerify/backend',
      script: 'npx',
      args: 'tsx watch src/workers/bulk-worker.ts',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'emailkit-verification-worker',
      cwd: '/Users/bot/Desktop/EmailVerify/backend',
      script: 'npx',
      args: 'tsx watch src/workers/verification-worker.ts',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
