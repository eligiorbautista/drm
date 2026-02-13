const logger = require('../middleware/logger');
const { DRM_SCHEMES } = require('../utils/constants');

/**
 * Customer Rights Token (CRT) Service
 *
 * Builds CRT objects that DRMtoday expects as the callback response.
 * The CRT defines whether the user is allowed to receive a license and
 * which parameters the license should have.
 *
 * CALLBACK AUTHORIZATION FLOW:
 *   1. Client requests a license from DRMtoday (via rtcDrmConfigure → x-dt-custom-data)
 *   2. DRMtoday POSTs to our /api/callback with: asset, user, session, drmScheme, clientInfo
 *   3. We respond with a CRT → DRMtoday issues the license
 *
 * See: docs/license_delivery_authorization.md
 * See: docs/crt_selective_overrides.md
 */

/**
 * Build a CRT for a purchase (perpetual) license.
 *
 * @param {string} assetId - The asset identifier
 * @param {object} [options] - Optional CRT parameters
 * @param {boolean} [options.storeLicense=true] - Whether to persist the license
 * @param {object} [options.outputProtection] - Output protection settings
 * @param {boolean} [options.outputProtection.digital=true] - Digital output protection
 * @param {boolean} [options.outputProtection.analogue=true] - Analogue output protection
 * @param {boolean} [options.outputProtection.enforce=false] - Enforce output protection
 * @returns {object} Customer Rights Token
 */
function buildPurchaseCrt(assetId, options = {}) {
  const {
    storeLicense = true,
    outputProtection = {
      digital: true,
      analogue: true,
      enforce: false,
    },
  } = options;

  const crt = {
    profile: {
      purchase: {},
    },
    assetId,
    outputProtection,
    storeLicense,
  };

  logger.debug('Built purchase CRT', { assetId, storeLicense });
  return crt;
}

/**
 * Build a CRT for a rental license with expiration.
 *
 * @param {string} assetId - The asset identifier
 * @param {object} [options] - Optional CRT parameters
 * @param {string} [options.relativeExpiration='PT24H'] - ISO 8601 duration for license validity
 * @param {string} [options.playDuration='PT4H'] - ISO 8601 duration for playback window
 * @param {boolean} [options.storeLicense=true] - Whether to persist the license
 * @param {object} [options.outputProtection] - Output protection settings
 * @returns {object} Customer Rights Token
 */
function buildRentalCrt(assetId, options = {}) {
  const {
    relativeExpiration = 'PT24H',
    playDuration = 'PT4H',
    storeLicense = true,
    outputProtection = {
      digital: true,
      analogue: true,
      enforce: false,
    },
  } = options;

  const crt = {
    profile: {
      rental: {
        relativeExpiration,
        playDuration,
      },
    },
    assetId,
    outputProtection,
    storeLicense,
  };

  logger.debug('Built rental CRT', { assetId, relativeExpiration, playDuration });
  return crt;
}

/**
 * Build a CRT using a template reference.
 *
 * @param {string} templateId - UUID of the CRT template in DRMtoday dashboard
 * @param {string} [assetId] - Optional asset ID override
 * @returns {object} Customer Rights Token referencing a template
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
 *
 * @param {string} assetId - The asset identifier
 * @param {object} baseCrt - Base CRT profile
 * @param {Array} overrides - Array of override objects with selectors
 * @returns {object} Customer Rights Token with overrides
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
 *
 * This is the primary function called by the /api/callback route.
 * DRMtoday sends: asset, variant, user, session, client, drmScheme, clientInfo, requestMetadata
 *
 * DRM Scheme values from DRMtoday:
 *   FAIRPLAY, WIDEVINE_MODULAR, PLAYREADY, OMADRM, WISEPLAY
 *
 * @param {object} callbackPayload - The incoming callback request body from DRMtoday
 * @param {object} [options] - Options for CRT generation
 * @param {string} [options.licenseType='purchase'] - 'purchase' or 'rental'
 * @param {string} [options.relativeExpiration] - For rental: license validity duration
 * @param {string} [options.playDuration] - For rental: playback window duration
 * @param {boolean} [options.enforce=false] - Enforce output protection
 * @returns {object} CRT response for DRMtoday
 */
function buildCallbackResponse(callbackPayload, options = {}) {
  const {
    licenseType = 'purchase',
    relativeExpiration,
    playDuration,
    enforce = false,
  } = options;

  const assetId = callbackPayload.asset || '';
  const { drmScheme, clientInfo } = callbackPayload;

  // -----------------------------------------------------------------------
  // Output protection: use the enforce parameter from caller
  // -----------------------------------------------------------------------
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

  logger.info('Built callback response', {
    asset: assetId,
    user: callbackPayload.user,
    session: callbackPayload.session,
    drmScheme,
    secLevel: clientInfo?.secLevel,
    licenseType,
    enforce: enforce,
  });

  return crt;
}

/**
 * Build a DRMtoday Test Dummy sessionId string from a CRT object.
 * Format: "crtjson:{...json...}" — used in the drmConfig.sessionId field.
 *
 * [WARNING]  DEPRECATED: Only for development/testing. Production uses Callback Authorization.
 *
 * @param {object} crt - The CRT object
 * @returns {string} sessionId string with crtjson: prefix
 */
function buildSessionId(crt) {
  logger.warn('buildSessionId() called — this is a Test Dummy method, not for production use');
  return `crtjson:${JSON.stringify(crt)}`;
}

/**
 * Build a CRT object suitable for embedding in a JWT auth token.
 * Used by Token Authorization and Fallback Authorization.
 *
 * [WARNING]  For pure Callback Authorization, this function is not needed.
 *     The callback route uses buildCallbackResponse() instead.
 *
 * @param {object} params - Parameters
 * @param {string} params.assetId - Asset identifier
 * @param {string} [params.licenseType='purchase'] - 'purchase' or 'rental'
 * @param {string} [params.relativeExpiration='PT24H'] - For rental
 * @param {string} [params.playDuration='PT4H'] - For rental
 * @param {boolean} [params.enforce=false] - Output protection enforcement
 * @param {boolean} [params.storeLicense=true] - Persist license
 * @returns {object} CRT object for token payload
 */
function buildCrtForToken(params = {}) {
  const {
    assetId = 'test-key',
    licenseType = 'purchase',
    relativeExpiration = 'PT24H',
    playDuration = 'PT4H',
    enforce = false,
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
