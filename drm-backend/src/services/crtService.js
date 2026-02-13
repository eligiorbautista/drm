const logger = require('../middleware/logger');
const { DRM_SCHEMES } = require('../utils/constants');

/**
 * Customer Rights Token (CRT) Service
 *
 * Builds CRT objects that DRMtoday expects as the callback response.
 */

/**
 * Build a CRT for a purchase (perpetual) license.
 */
function buildPurchaseCrt(assetId, options = {}) {
  const {
    storeLicense = true,
    outputProtection = {
      digital: true,
      analogue: true,
      enforce: true,
    },
  } = options;

  // Ultra-compatible CRT structure
  const crt = { 
    profile: { type: 'purchase' }, // legacy support
    assetId,
    outputProtection: {
      digital: outputProtection.digital !== undefined ? outputProtection.digital : true,
      analogue: outputProtection.analogue !== undefined ? outputProtection.analogue : true,
      enforce: outputProtection.enforce !== undefined ? outputProtection.enforce : true,
    },
    storeLicense,
  };

  logger.debug('Built purchase CRT', { assetId, storeLicense });
  return crt;
}

/**
 * Build a CRT for a rental license with expiration.
 */
function buildRentalCrt(assetId, options = {}) {
  const {
    relativeExpiration = 'PT24H',
    playDuration = 'PT4H',
    storeLicense = true,
    outputProtection = {
      digital: true,
      analogue: true,
      enforce: true,
    },
  } = options;

  const crt = {
    profile: { 
      type: 'rental',
      relativeExpiration,
      playDuration
    }, // legacy support
    relativeExpiration,
    playDuration,
    assetId,
    outputProtection: {
      digital: outputProtection.digital !== undefined ? outputProtection.digital : true,
      analogue: outputProtection.analogue !== undefined ? outputProtection.analogue : true,
      enforce: outputProtection.enforce !== undefined ? outputProtection.enforce : true,
    },
    storeLicense,
  };

  logger.debug('Built rental CRT', { assetId, relativeExpiration, playDuration });
  return crt;
}

/**
 * Build a CRT using a template reference.
 */
function buildTemplateCrt(templateId, assetId) {
  const crt = {
    ref: [`:${templateId}`],
  };

  if (assetId) {
    crt.assetId = assetId;
  }

  logger.debug('Built template CRT', { templateId, assetId });
  return crt;
}

/**
 * Build a CRT with selective overrides based on selectors.
 */
function buildCrtWithOverrides(assetId, baseCrt, overrides = []) {
  const crt = {
    assetId,
    ...baseCrt,
  };

  if (overrides.length > 0) {
    crt.overrides = overrides;
  }

  logger.debug('Built CRT with overrides', { assetId, overrideCount: overrides.length });
  return crt;
}

/**
 * Build the complete callback response expected by DRMtoday.
 */
function buildCallbackResponse(callbackPayload, options = {}) {
  const {
    licenseType = 'purchase',
    relativeExpiration,
    playDuration,
    enforce = true,
  } = options;

  const assetId = Array.isArray(callbackPayload.asset) 
    ? callbackPayload.asset[0] 
    : (callbackPayload.asset || '');
  
  const outputProtection = {
    digital: true,
    analogue: true,
    enforce: enforce,
  };

  let crt;
  if (licenseType === 'rental') {
    crt = buildRentalCrt(assetId, {
      relativeExpiration,
      playDuration,
      outputProtection,
    });
  } else {
    crt = buildPurchaseCrt(assetId, { outputProtection });
  }

  return crt;
}

/**
 * Build a DRMtoday Test Dummy sessionId string from a CRT object.
 */
function buildSessionId(crt) {
  return `crtjson:${JSON.stringify(crt)}`;
}

/**
 * Build a CRT object suitable for embedding in a JWT auth token.
 */
function buildCrtForToken(params = {}) {
  const {
    assetId = 'test-key',
    licenseType = 'purchase',
    relativeExpiration = 'PT24H',
    playDuration = 'PT4H',
    enforce = true,
    storeLicense = true,
  } = params;

  let crt;
  if (licenseType === 'rental') {
    crt = buildRentalCrt(assetId, {
      relativeExpiration,
      playDuration,
      storeLicense,
      outputProtection: { digital: true, analogue: true, enforce },
    });
  } else {
    crt = buildPurchaseCrt(assetId, {
      storeLicense,
      outputProtection: { digital: true, analogue: true, enforce },
    });
  }

  return crt;
}

module.exports = {
  buildPurchaseCrt,
  buildRentalCrt,
  buildTemplateCrt,
  buildCrtWithOverrides,
  buildCallbackResponse,
  buildSessionId,
  buildCrtForToken,
};
