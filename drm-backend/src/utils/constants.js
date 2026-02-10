/**
 * Constants for the DRM backend
 *
 * NOTE on rtc-drm-transform:
 * The rtc-drm-transform library is a CLIENT-SIDE ONLY library used by the WHEP
 * receiver (whep/js/main.js) for DRM decryption in the browser. It provides:
 *   - rtcDrmConfigure() — initializes DRM with merchant, environment, keyId, iv, etc.
 *   - rtcDrmOnTrack() — hooks into WebRTC tracks for decryption
 *   - rtcDrmSetBufferSize() — adjusts media buffer latency
 *   - rtcDrmEnvironments — staging/production environment enum
 *
 * This backend does NOT use rtc-drm-transform. The backend's role is:
 *   1. Respond to DRMtoday callback authorization requests with CRT
 *   2. Generate signed JWT auth tokens (UAT) for the client to include
 *      in the x-dt-auth-token header of license requests
 *
 * The client (whep/main.js) passes our authToken to rtcDrmConfigure's drmConfig.authToken.
 */

/**
 * Supported DRM schemes as sent by DRMtoday in the callback payload.
 * These MUST match the exact values DRMtoday sends — see docs/license_delivery_authorization.md
 *
 * DRMtoday Callback DRM Scheme IDs:
 *   FAIRPLAY           — Apple FairPlay
 *   WIDEVINE_MODULAR   — Google Widevine
 *   PLAYREADY          — Microsoft PlayReady
 *   OMADRM             — OMA DRM
 *   WISEPLAY           — Huawei WisePlay
 */
const DRM_SCHEMES = {
  FAIRPLAY: 'FAIRPLAY',
  WIDEVINE: 'WIDEVINE',           // DRMtoday sends WIDEVINE (not WIDEVINE_MODULAR)
  WIDEVINE_MODULAR: 'WIDEVINE_MODULAR', // Keep for backwards compatibility
  PLAYREADY: 'PLAYREADY',
  OMADRM: 'OMADRM',
  WISEPLAY: 'WISEPLAY',
  DEFAULT: 'DEFAULT',             // DRMtoday test callback sends DEFAULT
};

/**
 * DRMtoday environment URLs
 */
const DRMTODAY_URLS = {
  staging: {
    base: 'https://lic.staging.drmtoday.com',
    widevine: 'https://lic.staging.drmtoday.com/license-proxy-widevine/cenc/',
    fairplay: 'https://lic.staging.drmtoday.com/license-server-fairplay/',
    fairplayCert: (merchant) =>
      `https://lic.staging.drmtoday.com/license-server-fairplay/cert/${merchant}`,
    playready:
      'https://lic.staging.drmtoday.com/license-proxy-headerauth/drmtoday/RightsManager.asmx',
    dashboard: 'https://fe.staging.drmtoday.com',
  },
  production: {
    base: 'https://lic.drmtoday.com',
    widevine: 'https://lic.drmtoday.com/license-proxy-widevine/cenc/',
    fairplay: 'https://lic.drmtoday.com/license-server-fairplay/',
    fairplayCert: (merchant) =>
      `https://lic.drmtoday.com/license-server-fairplay/cert/${merchant}`,
    playready:
      'https://lic.drmtoday.com/license-proxy-headerauth/drmtoday/RightsManager.asmx',
    dashboard: 'https://fe.drmtoday.com',
  },
};

/**
 * Widevine security levels (from clientInfo.secLevel)
 */
const WIDEVINE_SEC_LEVELS = {
  UNSPECIFIED: 0,
  L1: 1, // Hardware-based security
  L2: 2, // Software-based security
  L3: 3, // Software-based security
};

/**
 * PlayReady security levels
 */
const PLAYREADY_SEC_LEVELS = {
  UNKNOWN: null,
  SL150: 150,
  SL2000: 2000,
  SL3000: 3000, // Hardware-based
};

/**
 * FairPlay security levels
 */
const FAIRPLAY_SEC_LEVELS = {
  BASELINE: 0, // Any FPS platform
  MAIN: 1,     // Enhanced protection for 4K/HDR
  AUDIO: 2,    // Audio-only FPS
};

/**
 * Supported JWT algorithms for token authorization
 */
const JWT_ALGORITHMS = ['HS256', 'HS384', 'HS512'];

/**
 * Encryption modes used by the WHIP sender (cloudflare-whip/main.js).
 * Must match between sender and receiver.
 */
const ENCRYPTION_MODES = {
  CBC: 'cbcs',  // AES-CBC (used in the working codebase)
  CTR: 'cenc',  // AES-CTR
};

/**
 * Video codecs supported by rtc-drm-transform (client-side)
 */
const VIDEO_CODECS = {
  H264: 'H264',
  AV1: 'AV1',
};

module.exports = {
  DRM_SCHEMES,
  DRMTODAY_URLS,
  WIDEVINE_SEC_LEVELS,
  PLAYREADY_SEC_LEVELS,
  FAIRPLAY_SEC_LEVELS,
  JWT_ALGORITHMS,
  ENCRYPTION_MODES,
  VIDEO_CODECS,
};
