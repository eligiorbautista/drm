/**
 * Local Development Server
 *
 * This file starts the Express server for local development.
 * For Vercel deployment, the app is exported from src/app.js → api/index.js.
 */
const app = require('./app');
const { env } = require('./config/env');
const logger = require('./middleware/logger');

const PORT = env.PORT;

app.listen(PORT, () => {
  logger.info(`[Server] DRM Backend server running on port ${PORT}`);
  logger.info(`[Env] Environment: ${env.NODE_ENV}`);
  logger.info(`[Merchant] Merchant: ${env.DRMTODAY_MERCHANT}`);
  logger.info(`[DRMtoday] DRMtoday Environment: ${env.DRMTODAY_ENVIRONMENT}`);
  logger.info(`[Health] Health check:        GET  http://localhost:${PORT}/health`);
  logger.info(`[Callback] Callback endpoint:   POST http://localhost:${PORT}/api/callback`);
  logger.info(`[Callback] Rental callback:     POST http://localhost:${PORT}/api/callback/rental`);

  if (env.DRM_JWT_SHARED_SECRET && env.DRM_JWT_KID) {
    logger.info(`[Token Auth] Token auth:          POST http://localhost:${PORT}/api/token/generate`);
    logger.info('   → Fallback Authorization mode available (Token + Callback)');
  } else {
    logger.info('[Auth Mode] Authorization mode:  Callback Authorization only');
    logger.info('   → DRMtoday will call POST /api/callback for every license request');
    logger.info('   → To enable Token/Fallback auth, set DRM_JWT_SHARED_SECRET and DRM_JWT_KID in .env');
  }
});

module.exports = app;
