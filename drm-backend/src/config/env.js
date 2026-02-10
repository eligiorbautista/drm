/**
 * Environment configuration with validation
 *
 * For Callback Authorization (production): only DRMTODAY_MERCHANT is required.
 * For Token/Fallback Authorization: JWT_SHARED_SECRET and JWT_KID are also required.
 */
const requiredVars = ['DRMTODAY_MERCHANT'];
const tokenAuthVars = ['DRM_JWT_SHARED_SECRET', 'DRM_JWT_KID'];

function validateEnv() {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[ERROR] Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  // Warn (don't fail) if token auth vars are missing — they're optional for callback-only auth
  const missingTokenVars = tokenAuthVars.filter((key) => !process.env[key]);
  if (missingTokenVars.length > 0) {
    console.warn(`[WARNING] Token Authorization vars not set: ${missingTokenVars.join(', ')}`);
    console.warn('   Token/Fallback auth will not be available. Callback Authorization only.');
  }
}

validateEnv();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,

  // CastLabs DRMtoday
  DRMTODAY_MERCHANT: process.env.DRMTODAY_MERCHANT,
  DRMTODAY_ENVIRONMENT: process.env.DRMTODAY_ENVIRONMENT || 'staging',

  // DRM Key Configuration (must match sender/receiver)
  DRM_KEY_ID: process.env.DRM_KEY_ID || '',
  DRM_IV: process.env.DRM_IV || '',

  // JWT / Token Authorization (DRMtoday CRT/UAT)
  DRM_JWT_SHARED_SECRET: process.env.DRM_JWT_SHARED_SECRET,
  DRM_JWT_ALGORITHM: process.env.DRM_JWT_ALGORITHM || 'HS512',
  DRM_JWT_KID: process.env.DRM_JWT_KID,
  DRM_JWT_TOKEN_EXPIRY: parseInt(process.env.DRM_JWT_TOKEN_EXPIRY, 10) || 3153600000, // 10 years default

  // User Authentication JWT / Session Management (set to large values for "forever" in development)
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || 'default-secret-change-in-production',
  AUTH_JWT_SESSION_EXPIRY: parseInt(process.env.AUTH_JWT_SESSION_EXPIRY, 10) || 3153600000, // 10 years default
  AUTH_JWT_REFRESH_EXPIRY: parseInt(process.env.AUTH_JWT_REFRESH_EXPIRY, 10) || 3153600000, // 10 years default

  // Asset
  DEFAULT_ASSET_ID: process.env.DEFAULT_ASSET_ID || 'test-key',

  // User
  DEFAULT_USER_ID: process.env.DEFAULT_USER_ID || '',

  // Callback auth
  CALLBACK_AUTH_SECRET: process.env.CALLBACK_AUTH_SECRET || '',

  // CORS
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000',

  // Cookie
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'default-cookie-secret-change-in-production',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

/**
 * Returns the DRMtoday license server base URL for the configured environment.
 */
function getDrmtodayBaseUrl() {
  const urls = {
    staging: 'https://lic.staging.drmtoday.com',
    production: 'https://lic.drmtoday.com',
  };
  return urls[env.DRMTODAY_ENVIRONMENT] || urls.staging;
}

module.exports = { env, getDrmtodayBaseUrl };
