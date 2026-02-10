const logger = require('./logger');
const { env } = require('../config/env');
const { DRM_SCHEMES } = require('../utils/constants');

/**
 * Valid DRM scheme values that DRMtoday sends in callback requests.
 * See: docs/license_delivery_authorization.md — "DRM Scheme Values" table.
 */
const VALID_DRM_SCHEMES = Object.values(DRM_SCHEMES);

/**
 * Validates incoming DRMtoday callback requests.
 *
 * DRMtoday sends a JSON POST request to the configured callback URL with:
 *   asset, variant, user, session, client, drmScheme, clientInfo, requestMetadata
 */
function validateCallbackRequest(req, res, next) {
  // Verify this is a POST with JSON body
  if (!req.body || typeof req.body !== 'object') {
    logger.warn('Callback received with empty or invalid body', { ip: req.ip });
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // Validate required fields from DRMtoday callback payload
  let { drmScheme } = req.body;

  // drmScheme is optional in some DRMtoday test scenarios; default to WIDEVINE_MODULAR
  if (!drmScheme) {
    logger.debug('Callback missing drmScheme, defaulting to WIDEVINE_MODULAR', {
      body: req.body,
      ip: req.ip,
    });
    drmScheme = DRM_SCHEMES.WIDEVINE_MODULAR;
  }

  // DRMtoday test callback sends "DEFAULT" - treat it as WIDEVINE_MODULAR
  if (drmScheme.toUpperCase() === 'DEFAULT') {
    logger.debug('Callback using DEFAULT drmScheme, mapping to WIDEVINE_MODULAR', {
      ip: req.ip,
    });
    drmScheme = DRM_SCHEMES.WIDEVINE_MODULAR;
  }

  // Validate drmScheme matches DRMtoday's known values (case-insensitive comparison)
  const schemeUpper = drmScheme.toUpperCase();
  if (!VALID_DRM_SCHEMES.includes(schemeUpper)) {
    logger.warn(`Unsupported DRM scheme: ${drmScheme}`, {
      ip: req.ip,
      validSchemes: VALID_DRM_SCHEMES,
    });
    return res.status(400).json({
      error: `Unsupported DRM scheme: ${drmScheme}. Valid values: ${VALID_DRM_SCHEMES.join(', ')}`,
    });
  }

  // Normalize the drmScheme to uppercase for consistent downstream handling
  req.body.drmScheme = schemeUpper;

  // Optional: verify shared callback secret if configured
  if (env.CALLBACK_AUTH_SECRET) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${env.CALLBACK_AUTH_SECRET}`) {
      logger.warn('Callback authorization failed', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized callback request' });
    }
  }

  logger.debug('Callback request validated', {
    drmScheme: schemeUpper,
    asset: req.body.asset,
    user: req.body.user,
    session: req.body.session,
  });

  next();
}

module.exports = { validateCallbackRequest };
