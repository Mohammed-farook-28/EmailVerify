// IMPORTANT: Import instrumentation FIRST, before any other imports
import './instrumentation.js';

import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`EmailKit backend running on port ${env.port} [${env.nodeEnv}]`);
});
