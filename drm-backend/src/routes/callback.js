const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');
const { validateCallbackRequest } = require('../middleware/validateCallback');
const { buildCallbackResponse, buildTemplateCrt } = require('../services/crtService');
const { env } = require('../config/env');

/**
 * POST /api/callback
 *
 * DRMtoday Callback Authorization endpoint.
 *
 * This is the PRIMARY authorization method for production. DRMtoday sends a
 * JSON POST to this URL whenever a client requests a license. We respond with
 * a valid Customer Rights Token (CRT) that tells DRMtoday what license to issue.
 */
router.post('/', validateCallbackRequest, async (req, res, next) => {
  try {
    const { asset, variant, user, session, client, drmScheme, clientInfo, requestMetadata } = req.body;

    // Handle asset being an array or string (DRMtoday may send either)
    const normalizedAssetId = Array.isArray(asset) ? asset[0] : (asset || env.DEFAULT_ASSET_ID);

    logger.info('DRMtoday callback received', {
      asset: normalizedAssetId,
      originalAsset: asset,
      user,
      session,
      drmScheme,
      secLevel: clientInfo?.secLevel,
    });

    // --- Widevine L3 denial ---
    // Deny license requests from software-only (L3) Widevine devices.
    // L1 (hardware-secure) is required for content protection.
    if ((drmScheme === 'WIDEVINE_MODULAR' || drmScheme === 'WIDEVINE')
      && clientInfo?.secLevel === '3') {
      logger.warn('License DENIED: Widevine L3 not allowed', {
        user,
        asset: normalizedAssetId,
        drmScheme,
        secLevel: '3',
        remoteAddr: requestMetadata?.remoteAddr,
      });
      return res.status(403).json({
        error: 'SecurityLevelInsufficient',
        message: 'This content requires Widevine L1 hardware security. Your device only supports L3 (software).',
      });
    }

    const USE_TEMPLATES = false; // Set to true after creating templates in DRMtoday dashboard

    const TEMPLATE_IDS = {
      HARDWARE_SECURE: 'template-hardware-secure',
      SOFTWARE_CDM: 'template-software-cdm',
      DEFAULT: 'template-default-crt',
    };

    let crt;

    if (USE_TEMPLATES) {
      let templateId;
      const secLevel = parseInt(clientInfo?.secLevel, 10);

      if (drmScheme === 'WIDEVINE_MODULAR' || drmScheme === 'WIDEVINE') {
        templateId = (secLevel === 1) ? TEMPLATE_IDS.HARDWARE_SECURE : TEMPLATE_IDS.SOFTWARE_CDM;
      } else if (drmScheme === 'PLAYREADY' || drmScheme === 'FAIRPLAY') {
        templateId = TEMPLATE_IDS.SOFTWARE_CDM;
      } else {
        templateId = TEMPLATE_IDS.DEFAULT;
      }

      crt = buildTemplateCrt(templateId, normalizedAssetId);
    } else {
      // Determine DRM module key for op.config
      let drmModuleKey = '*';
      if (drmScheme === 'WIDEVINE_MODULAR' || drmScheme === 'WIDEVINE') {
        drmModuleKey = 'WidevineM';
      } else if (drmScheme === 'PLAYREADY') {
        drmModuleKey = 'PlayReadyM';
      } else if (drmScheme === 'FAIRPLAY') {
        drmModuleKey = 'FairPlayM';
      }

      // EXPLICIT MODERN CRT STRUCTURE
      // We provide both legacy 'profile' and modern 'type' for maximum compatibility
      // across different DRMtoday callback versions (JSON_V1 vs JSON_V2)
      crt = {
        type: 'purchase',
        profile: { type: 'purchase' }, // Redundancy for older schemas
        assetId: normalizedAssetId,
        storeLicense: true,
        outputProtection: {
          digital: true,
          analogue: true,
          enforce: true // Enable strict legacy enforcement
        },
        // Enhanced Output Protection config
        op: {
          config: {
            UHD: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } },
            HD: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } },
            SD: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } },
            AUDIO: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } }
          }
        }
      };
    }

    logger.info('Callback response sent', {
      asset: normalizedAssetId,
      user,
      drmScheme,
      status: 'granted'
    });

    // Track license request in database
    try {
      await prisma.licenseRequest.create({
        data: {
          assetId: normalizedAssetId,
          variant: variant?.toString(),
          session: session?.toString(),
          drmScheme,
          securityLevel: clientInfo?.secLevel?.toString(),
          clientInfo,
          granted: true,
          ipAddress: requestMetadata?.remoteAddr,
          userAgent: requestMetadata?.userAgent,
          userId: null // Optional: link to internal user record if 'user' param matches user.id/email
        },
      });
    } catch (error) {
      logger.warn('Failed to record license request', { error: error.message });
    }

    res.json(crt);
  } catch (err) {
    logger.error('Callback processing failed', { error: err.message });
    next(err);
  }
});

/**
 * POST /api/callback/rental
 */
router.post('/rental', validateCallbackRequest, async (req, res, next) => {
  try {
    const { asset, user, drmScheme } = req.body;
    const normalizedAssetId = Array.isArray(asset) ? asset[0] : (asset || env.DEFAULT_ASSET_ID);

    const crt = buildCallbackResponse(req.body, {
      licenseType: 'rental',
      relativeExpiration: 'PT24H',
      playDuration: 'PT4H',
      enforce: false,
    });

    res.json(crt);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/callback/error
 */
router.post('/error', validateCallbackRequest, async (req, res, next) => {
  try {
    const { asset, user, error } = req.body;
    logger.warn('DRMtoday error callback received', { asset, user, error });
    res.status(403).json({ error: 'Denied', message: error?.message });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
