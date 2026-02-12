const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');
const { validateCallbackRequest } = require('../middleware/validateCallback');
const { buildCallbackResponse } = require('../services/crtService');
const { DRM_SCHEMES } = require('../utils/constants');

/**
 * POST /api/callback
 *
 * DRMtoday Callback Authorization endpoint.
 *
 * This is the PRIMARY authorization method for production. DRMtoday sends a
 * JSON POST to this URL whenever a client requests a license. We respond with
 * a valid Customer Rights Token (CRT) that tells DRMtoday what license to issue.
 *
 * Flow:
 *   1. Client calls rtcDrmConfigure() with merchant + userId (no authToken needed)
 *   2. Client requests a license → DRMtoday receives it
 *   3. DRMtoday POSTs to this endpoint with:
 *        { asset, variant, user, session, client, drmScheme, clientInfo, requestMetadata }
 *   4. We respond with a CRT → DRMtoday issues the license to the client
 *
 * DRM Scheme values from DRMtoday:
 *   FAIRPLAY, WIDEVINE_MODULAR, PLAYREADY, OMADRM, WISEPLAY
 *
 * See: docs/license_delivery_authorization.md (Callback Authorization section)
 */
router.post('/', validateCallbackRequest, async (req, res, next) => {
  try {
    const { asset, variant, user, session, client, drmScheme, clientInfo, requestMetadata } = req.body;

    logger.info('DRMtoday callback received', {
      asset,
      variant,
      user,
      session,
      client,
      drmScheme,
      secLevel: clientInfo?.secLevel,
      manufacturer: clientInfo?.manufacturer,
      remoteAddr: requestMetadata?.remoteAddr,
    });

    // -----------------------------------------------------------------------
    // AUTHORIZATION LOGIC
    //
    // This is where you implement your business rules. Examples:
    //   - Look up user in your database to verify active subscription
    //   - Check if user is authorized for this specific asset
    //   - Enforce device limits or concurrent stream limits
    //   - Apply geo-restrictions based on requestMetadata.remoteAddr
    //   - Deny low security levels for premium content:
    //
    //     if (drmScheme === 'WIDEVINE_MODULAR' && clientInfo?.secLevel === '3') {
    //       logger.warn('Denied Widevine L3 for premium content', { user, asset });
    //       return res.status(403).json({ error: 'Insufficient DRM security level' });
    //     }
    //
    // For now, we authorize all requests with a purchase profile.
    // -----------------------------------------------------------------------

    const crt = buildCallbackResponse(req.body, {
      licenseType: 'purchase',
      enforce: true, // Enable HDCP enforcement for hardware-based DRM (auto-disabled for L3)
    });

    logger.info('Callback response sent', {
      asset,
      user,
      drmScheme,
      profileType: 'purchase',
      secLevel: clientInfo?.secLevel,
      outputProtection: crt.outputProtection,
      note: 'HDCP enforcement enabled for L1/L2, automatically disabled for L3 (SW DRM)',
    });

    // Track license request
    try {
      await prisma.licenseRequest.create({
        data: {
          assetId: asset,
          variant,
          session,
          drmScheme,
          securityLevel: clientInfo?.secLevel?.toString(),
          clientInfo,
          granted: true,
          ipAddress: requestMetadata?.remoteAddr,
          userAgent: requestMetadata?.userAgent,
        },
      });
    } catch (error) {
      logger.warn('Failed to create license request record', { error: error.message });
    }

    res.json(crt);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/callback/rental
 *
 * Callback endpoint that returns a rental CRT with time-limited license.
 * Configure a separate callback URL in DRMtoday for rental content,
 * or use the main callback with asset-based routing logic.
 */
router.post('/rental', validateCallbackRequest, async (req, res, next) => {
  try {
    const { asset, user, drmScheme, clientInfo, requestMetadata } = req.body;

    logger.info('DRMtoday rental callback received', {
      asset,
      user,
      drmScheme,
      secLevel: clientInfo?.secLevel,
      manufacturer: clientInfo?.manufacturer,
      remoteAddr: requestMetadata?.remoteAddr,
    });

    const crt = buildCallbackResponse(req.body, {
      licenseType: 'rental',
      relativeExpiration: 'PT24H',
      playDuration: 'PT4H',
      enforce: false,
    });

    logger.info('Rental callback response sent', {
      asset,
      user,
      drmScheme,
      licenseType: 'rental',
    });

    res.json(crt);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/callback/error
 *
 * Callback endpoint for handling failed license requests from DRMtoday.
 */
router.post('/error', validateCallbackRequest, async (req, res, next) => {
  try {
    const { asset, user, drmScheme, clientInfo, requestMetadata, error } = req.body;

    logger.warn('DRMtoday error callback received', {
      asset,
      user,
      drmScheme,
      error,
      remoteAddr: requestMetadata?.remoteAddr,
    });

    res.status(403).json({
      error: 'License request denied',
      message: error?.message || 'Unknown error',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
