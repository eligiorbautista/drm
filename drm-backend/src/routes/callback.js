const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');
const { validateCallbackRequest } = require('../middleware/validateCallback');
const { buildCallbackResponse, buildTemplateCrt } = require('../services/crtService');
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
    // -----------------------------------------------------------------------

    // Determine whether to enforce output protection based on DRM scheme and security level
    // We use CRT templates with selective overrides to enable proper HDCP enforcement
    // See docs/crt_selective_overrides.md for details on Enhanced Output Protection
    const secLevel = parseInt(clientInfo?.secLevel, 10);

    // TEMPLATE APPROACH (Recommended for Production)
    // ------------------------------------------------
    // To use CRT templates, set USE_TEMPLATES=true and update TEMPLATE_IDS
    // with your actual template IDs from the DRMtoday dashboard.
    //
    // See: docs/crt_template_setup_guide.md
    // ------------------------------------------------

    const USE_TEMPLATES = false; // Set to true after creating templates in DRMtoday dashboard

    // CRT Template IDs (must be created in DRMtoday dashboard)
    // These templates use Enhanced Output Protection with requireHDCP settings
    // and can work with all DRM schemes including Widevine L3, PlayReady, FairPlay
    const TEMPLATE_IDS = {
      // Hardware-secure devices (Widevine L1) - strict HDCP enforcement
      HARDWARE_SECURE: 'template-hardware-secure',  // Set this ID in DRMtoday dashboard

      // Software CDMs (Widevine L3, PlayReady, FairPlay) - no HDCP requirement
      // Use HDCP_NONE so license is granted even without HDCP support
      SOFTWARE_CDM: 'template-software-cdm',        // Set this ID in DRMtoday dashboard

      // Default fallback template
      DEFAULT: 'template-default-crt',              // Set this ID in DRMtoday dashboard
    };

    let crt;

    if (USE_TEMPLATES) {
      // Use templates with Enhanced Output Protection
      let templateId;

      // Widevine DRM (used by Chrome, Firefox, Edge, Android)
      // secLevel 1 = L1 (hardware, secure, HDCP-capable)
      // secLevel 3 = L3 (software) - can use HDCP_NONE for SD, HDCP_V1 for HD with proper template
      if (drmScheme === 'WIDEVINE_MODULAR' || drmScheme === 'WIDEVINE') {
        if (secLevel === 1) {
          templateId = TEMPLATE_IDS.HARDWARE_SECURE;
          logger.info('Hardware-secure Widevine L1 detected - using strict HDCP template', { secLevel, templateId });
        } else {
          templateId = TEMPLATE_IDS.SOFTWARE_CDM;
          logger.info('Widevine L3 or software CDM detected - using no-HDCP template', { secLevel, templateId });
        }
      }
      // PlayReady DRM (used by Edge, Internet Explorer on Windows)
      // Use template with HDCP_NONE - can enable HDCP via template overrides if device supports it
      else if (drmScheme === 'PLAYREADY') {
        templateId = TEMPLATE_IDS.SOFTWARE_CDM;
        logger.info('PlayReady detected - using software CDM template', { secLevel, templateId });
      }
      // FairPlay DRM (used by Safari on iOS/macOS)
      // Web Safari: use HDCP_NONE template
      // Native apps with hardware FairPlay: could use a separate template
      else if (drmScheme === 'FAIRPLAY') {
        templateId = TEMPLATE_IDS.SOFTWARE_CDM;
        logger.info('FairPlay detected - using software CDM template', { secLevel, templateId });
      }
      // Other DRM schemes (OMADRM, WISEPLAY, etc.)
      else {
        templateId = TEMPLATE_IDS.DEFAULT;
        logger.info('Other DRM scheme detected - using default template', { drmScheme, secLevel, templateId });
      }

      // Build CRT response using template reference
      crt = buildTemplateCrt(templateId, asset);

      logger.info('Using CRT Template with Enhanced Output Protection', {
        asset,
        user,
        drmScheme,
        secLevel,
        templateId,
        profileType: 'template',
      });
    } else {
      // INLINE APPROACH (Immediate solution, no dashboard setup needed)
      // ------------------------------------------------
      // Uses Enhanced Output Protection (op.config) inline
      // Works with Widevine L3, PlayReady, FairPlay via requireHDCP = HDCP_NONE
      // ------------------------------------------------

      // Determine DRM-specific configuration (e.g., WidevineM, PlayReadyM, FairPlayM)
      let drmModuleKey = '*'; // Default to wildcard for all DRM schemes

      if (drmScheme === 'WIDEVINE_MODULAR' || drmScheme === 'WIDEVINE') {
        drmModuleKey = 'WidevineM';
      } else if (drmScheme === 'PLAYREADY') {
        drmModuleKey = 'PlayReadyM';
      } else if (drmScheme === 'FAIRPLAY') {
        drmModuleKey = 'FairPlayM';
      }

      // Build Enhanced Output Protection config
      // HDCP_NONE = No HDCP required (works with software CDMs)
      // This allows licenses to be granted even without HDCP support
      const enhanceOutputProtection = {
        op: {
          config: {
            UHD: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } },
            HD: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } },
            SD: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } },
            AUDIO: { [drmModuleKey]: { requireHDCP: 'HDCP_NONE' } }
          }
        }
      };

      // Build CRT using the service for consistency
      // Fallback to DEFAULT_ASSET_ID if asset is missing from callback
      const targetAssetId = asset || env.DEFAULT_ASSET_ID;
      
      crt = buildPurchaseCrt(targetAssetId, {
        outputProtection: {
          digital: true,
          analogue: true,
          enforce: false
        }
      });

      // Merge Enhanced Output Protection into CRT
      Object.assign(crt, enhanceOutputProtection);

      logger.info('Using inline Enhanced Output Protection (Modern CRT)', {
        asset: targetAssetId,
        user,
        drmScheme,
        secLevel,
        drmModuleKey,
        requireHDCP: 'HDCP_NONE',
        profileType: 'purchase',
        note: 'Set USE_TEMPLATES=true to use CRT templates for production'
      });
    }

    logger.info('Callback response sent', {
      asset,
      user,
      drmScheme,
      profileType: 'purchase',
      outputProtection: crt.outputProtection,
      secLevel: clientInfo?.secLevel,
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
