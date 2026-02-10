const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');
const logger = require('../middleware/logger');

/**
 * Token Authorization Service
 *
 * Generates signed JWT tokens (Upfront Authorization Tokens) for DRMtoday
 * license delivery authorization.
 *
 * [WARNING]  For pure Callback Authorization (recommended for production), this
 *     service is NOT needed. DRMtoday will call your /api/callback endpoint
 *     directly — no client-side token generation required.
 *
 *     This service exists for:
 *     - Fallback Authorization (Token + Callback combined)
 *     - Development/testing when callback URL isn't publicly reachable
 *
 * See: docs/license_delivery_authorization.md (Token Authorization section)
 */

/**
 * Check if Token Authorization is configured.
 * @returns {boolean}
 */
function isTokenAuthAvailable() {
  return !!(env.DRM_JWT_SHARED_SECRET && env.DRM_JWT_KID);
}

/**
 * Get the signing secret as a Buffer from the hex-encoded env variable.
 *
 * @returns {Buffer} The shared secret as raw bytes
 * @throws {Error} If JWT_SHARED_SECRET is not configured
 */
function getSigningSecret() {
  if (!env.DRM_JWT_SHARED_SECRET) {
    throw new Error('JWT_SHARED_SECRET is not configured. Token Authorization is not available.');
  }
  return Buffer.from(env.DRM_JWT_SHARED_SECRET, 'hex');
}

/**
 * Generate a random alphanumeric string (matches generateRandomString in whep/main.js).
 *
 * @param {number} [minLength=16] - Minimum length
 * @returns {string} Random string
 */
function generateRandomString(minLength = 16) {
  return crypto.randomBytes(Math.ceil(minLength / 2)).toString('hex').slice(0, minLength + 4);
}

/**
 * Generate a signed Upfront Authorization Token (UAT) for DRMtoday.
 *
 * This matches the working whep/main.js generateAuthToken() function:
 * - optData = { merchant, userId }
 * - crt = single CRT object (NOT an array)
 * - Header includes kid from env (UUID)
 * - Algorithm defaults to HS512
 *
 * @param {object} params - Token parameters
 * @param {string} [params.merchant] - DRMtoday merchant ID (UUID)
 * @param {string} [params.userId] - User identifier (defaults to env.DEFAULT_USER_ID)
 * @param {object} params.crt - The CRT object (single object, not an array)
 * @param {string} [params.kid] - Key ID for the shared secret (defaults to env.DRM_JWT_KID)
 * @param {number} [params.expiresIn] - Token expiry in seconds
 * @returns {string} Signed JWT token
 */
function generateAuthToken(params) {
  const {
    merchant = env.DRMTODAY_MERCHANT,
    userId = env.DEFAULT_USER_ID,
    crt,
    kid = env.DRM_JWT_KID,
    expiresIn = env.DRM_JWT_TOKEN_EXPIRY,
  } = params;

  if (!crt) {
    throw new Error('CRT object is required for token generation');
  }

  // Build optData — merchant metadata (matches whep: { merchant, userId })
  const optData = { merchant };
  if (userId) optData.userId = userId;

  // JWT payload — optData and crt must be serialized JSON strings
  // IMPORTANT: crt is a SINGLE object, matching the working whep/main.js
  const jti = generateRandomString();
  const payload = {
    jti,
    optData: JSON.stringify(optData),
    crt: JSON.stringify(crt),
  };

  const secret = getSigningSecret();
  const algorithm = env.DRM_JWT_ALGORITHM;

  const token = jwt.sign(payload, secret, {
    algorithm,
    expiresIn,
    header: {
      alg: algorithm,
      kid,
      typ: 'JWT',
    },
  });

  logger.info('Generated auth token', {
    merchant,
    userId,
    assetId: crt.assetId,
    algorithm,
    kid,
    expiresIn,
    jti,
  });

  return token;
}

/**
 * Verify and decode a DRMtoday auth token.
 *
 * @param {string} token - The JWT token to verify
 * @returns {object} Decoded token payload
 * @throws {Error} If the token is invalid or expired
 */
function verifyAuthToken(token) {
  const secret = getSigningSecret();

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [env.DRM_JWT_ALGORITHM],
    });

    // Parse the serialized JSON fields back to objects
    if (decoded.optData) decoded.optData = JSON.parse(decoded.optData);
    if (decoded.crt) decoded.crt = JSON.parse(decoded.crt);

    logger.debug('Token verified successfully', { jti: decoded.jti });
    return decoded;
  } catch (err) {
    logger.warn('Token verification failed', { error: err.message });
    throw err;
  }
}

module.exports = {
  generateAuthToken,
  verifyAuthToken,
  isTokenAuthAvailable,
};
