const express = require('express');
const router = express.Router();
const logger = require('../middleware/logger');
const { generateAuthToken, verifyAuthToken, isTokenAuthAvailable } = require('../services/tokenService');
const { buildCrtForToken, buildSessionId } = require('../services/crtService');
const { env } = require('../config/env');

/**
 * Middleware: check that Token Authorization is configured before allowing token routes.
 */
function requireTokenAuth(req, res, next) {
  if (!isTokenAuthAvailable()) {
    return res.status(503).json({
      error: 'Token Authorization is not configured. Set DRM_JWT_SHARED_SECRET and DRM_JWT_KID in .env.',
      hint: 'For production, use Callback Authorization instead (POST /api/callback).',
    });
  }
  next();
}

/**
 * POST /api/token/generate
 *
 * Generate an Upfront Authorization Token (UAT) for DRMtoday.
 *
 * [WARNING]  This endpoint is only needed for Token/Fallback Authorization.
 *     For pure Callback Authorization (production), the client does NOT need
 *     to call this endpoint — DRMtoday calls /api/callback directly.
 *
 * Request body:
 * {
 *   "assetId": "test-key",              // optional, defaults to env.DEFAULT_ASSET_ID
 *   "userId": "elidev-test",            // optional, defaults to env.DEFAULT_USER_ID
 *   "licenseType": "purchase",          // optional: "purchase" or "rental"
 *   "relativeExpiration": "PT24H",      // optional: for rental
 *   "playDuration": "PT4H",            // optional: for rental
 *   "enforce": false,                   // optional: output protection enforcement
 *   "expiresIn": 3600                   // optional: token TTL in seconds
 * }
 */
router.post('/generate', requireTokenAuth, (req, res, next) => {
  try {
    const {
      assetId = env.DEFAULT_ASSET_ID,
      userId = env.DEFAULT_USER_ID,
      licenseType = 'purchase',
      relativeExpiration = 'PT24H',
      playDuration = 'PT4H',
      enforce = false,
      expiresIn,
    } = req.body;

    // Build the CRT as a single object (matching working whep/main.js)
    const crt = buildCrtForToken({
      assetId,
      licenseType,
      relativeExpiration,
      playDuration,
      enforce,
    });

    // Generate the JWT auth token
    const token = generateAuthToken({
      merchant: env.DRMTODAY_MERCHANT,
      userId,
      crt,
      expiresIn,
    });

    // Also provide the sessionId for Test Dummy authorization
    const sessionId = buildSessionId(crt);

    logger.info('Auth token generated', { assetId, userId, licenseType });

    res.json({
      token,
      sessionId,
      crt,
      expiresIn: expiresIn || env.JWT_TOKEN_EXPIRY,
      merchant: env.DRMTODAY_MERCHANT,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/token/verify
 *
 * Verify and decode an existing auth token (for debugging/testing).
 *
 * Request body:
 * {
 *   "token": "<jwt-token>"
 * }
 */
router.post('/verify', requireTokenAuth, (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const decoded = verifyAuthToken(token);

    res.json({
      valid: true,
      decoded,
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        valid: false,
        error: err.message,
      });
    }
    next(err);
  }
});

module.exports = router;
