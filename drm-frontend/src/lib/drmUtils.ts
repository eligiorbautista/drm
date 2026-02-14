/**
 * DRM Utility Functions
 * Shared helpers for DRM key conversion, platform detection, EME checks,
 * and hardware security validation.
 *
 * NOTE: This project uses Callback Authorization mode. The backend handles CRT generation.
 * No client-side JWT or authToken generation is needed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detailed platform detection result used by all DRM modules. */
export interface PlatformInfo {
    /** True if the device is running Android (including Firefox on Android). */
    isAndroid: boolean;
    /** True if the browser is Firefox (any platform). */
    isFirefox: boolean;
    /** True if the device is running iOS (iPhone/iPad/iPod). */
    isIOS: boolean;
    /**
     * True if the browser is Safari and NOT Chrome/Edge pretending to be Safari.
     * Chrome and Edge include "Safari" in their user-agent strings.
     */
    isSafari: boolean;
    /** True if the platform is Windows (and not Firefox, which spoofs Linux). */
    isWindows: boolean;
    /** True if the browser is desktop Chrome (not Edge, not mobile). */
    isChrome: boolean;
    /** True if the browser is desktop Edge (not mobile). */
    isEdge: boolean;
    /** True if the UA-CH API reports the device as mobile. */
    isMobile: boolean;
    /** Human-readable platform label for logging. */
    detectedPlatform: string;
}

/** Result of probing one DRM system for hardware security. */
export interface DrmSecurityDetail {
    system: string;
    hwSecure: boolean;
}

// ---------------------------------------------------------------------------
// Hex / Key Utilities
// ---------------------------------------------------------------------------

/**
 * Convert hex string to Uint8Array.
 * @param hex - Hex string (e.g., "abcd1234...")
 * @returns Uint8Array of bytes
 */
export function hexToUint8Array(hex: string): Uint8Array {
    const cleanHex = hex.replace(/[\s:-]/g, '');

    if (cleanHex.length % 2 !== 0) {
        throw new Error(`Invalid hex string length: ${cleanHex.length}. Must be even.`);
    }

    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }

    return new Uint8Array(bytes);
}

/**
 * Validate DRM key format.
 * @param key - Key as hex string or Uint8Array
 * @param expectedLength - Expected byte length (default: 16)
 */
export function validateDrmKey(key: string | Uint8Array, expectedLength: number = 16): boolean {
    if (typeof key === 'string') {
        const cleanHex = key.replace(/[\s:-]/g, '');
        return cleanHex.length === expectedLength * 2 && /^[0-9a-fA-F]+$/.test(cleanHex);
    } else {
        return key.length === expectedLength;
    }
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

/**
 * Detect the user's platform, browser, and device type.
 *
 * Why this is non-trivial:
 * - Firefox spoofs its platform as "Linux" on all devices for privacy.
 * - Chrome and Edge include "Safari" in their UA strings.
 * - UA-CH (User-Agent Client Hints) is only available in Chromium browsers.
 * - iOS devices may report as "MacIntel" in navigator.platform.
 *
 * Detection priority: iOS > Android > Windows > Firefox > Safari > Chrome > Edge > Unknown
 */
export function detectPlatform(): PlatformInfo {
    const uad = (navigator as any).userAgentData;
    const platform = uad?.platform || navigator.platform || '';
    const isMobile = uad?.mobile === true;
    const ua = navigator.userAgent;

    // --- Raw UA signal extraction ---
    const uaHasAndroid = /Android/i.test(ua);
    const uaHasFirefox = /Firefox/i.test(ua);
    const uaHasIOS = /iPhone|iPad|iPod|iOS/i.test(ua);
    const uaHasChrome = /Chrome/i.test(ua);
    const uaHasEdge = /Edg/i.test(ua);  // Edge uses "Edg/" not "Edge/"
    // Safari is only real Safari if Chrome/Edge are NOT present
    const uaHasSafari = /Safari/i.test(ua) && !uaHasChrome;

    // --- Derived boolean flags ---

    // iOS: check UA, navigator.platform, or iPadOS 13+ (reports "MacIntel" with touch)
    // iPadOS 13+ on Safari: platform is "MacIntel" but maxTouchPoints > 0
    const isIPadOS = !uaHasIOS && /macintosh|macintel/i.test(platform)
        && navigator.maxTouchPoints > 0 && uaHasSafari;
    const isIOS = uaHasIOS || platform.toLowerCase() === 'ios' || isIPadOS;

    // Safari: must be real Safari, not Chrome/Edge disguised as Safari
    const isSafari = uaHasSafari && !uaHasEdge;

    // Android: userAgent is most reliable (Firefox on Android reports Linux platform)
    const isAndroid = uaHasAndroid ||
        platform.toLowerCase() === 'android' ||
        (isMobile && /linux/i.test(platform));

    // Firefox: simple UA check, works cross-platform
    const isFirefox = uaHasFirefox;

    // Windows: only for non-Firefox (Firefox spoofs platform as Linux)
    const isWindows = !isFirefox && (/windows/i.test(platform) || /Win/i.test(ua));

    // Desktop Chrome/Edge (excluding mobile — mobile is handled via isAndroid)
    const isChrome = (uaHasChrome && !uaHasEdge) && !isMobile;
    const isEdge = uaHasEdge && !isMobile;

    // Human-readable label (ordered by priority)
    const detectedPlatform = isIOS ? 'iOS' :
        isAndroid ? 'Android' :
            isWindows ? 'Windows' :
                isFirefox ? 'Firefox' :
                    isSafari ? 'Safari' :
                        isChrome ? 'Chrome' :
                            isEdge ? 'Edge' :
                                (platform || 'Unknown');

    return {
        isAndroid, isFirefox, isIOS, isSafari, isWindows, isChrome, isEdge,
        isMobile, detectedPlatform,
    };
}

// ---------------------------------------------------------------------------
// EME Availability Check
// ---------------------------------------------------------------------------

/**
 * Check if Encrypted Media Extensions (EME) are available in the current context.
 *
 * This catches two important cases:
 * 1. Browser has no EME support at all (very old or restricted browser).
 * 2. EME is blocked by Permissions-Policy in a cross-origin iframe.
 *    The parent <iframe> must include `allow="encrypted-media"`.
 *
 * @param logDebug - Optional logging callback
 * @returns Object with `available` and `reason` (if unavailable)
 */
export async function checkEmeAvailability(
    logDebug?: (msg: string) => void
): Promise<{ available: boolean; reason?: string }> {
    const log = logDebug || (() => { });
    const isInIframe = window.self !== window.top;

    if (!navigator.requestMediaKeySystemAccess) {
        return {
            available: false,
            reason: 'Your browser does not support Encrypted Media Extensions (EME). DRM playback is not possible.',
        };
    }

    // Probe EME with a minimal config to verify the permission is delegated.
    // We try multiple key systems because only one needs to succeed.
    const probeConfigs: MediaKeySystemConfiguration[] = [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: '' }],
    }];

    const keySystems = [
        'com.widevine.alpha',                       // Chrome, Edge, Android
        'com.apple.fps.1_0',                        // Safari, iOS
        'com.microsoft.playready.recommendation',   // Edge on Windows
    ];

    for (const ks of keySystems) {
        try {
            await navigator.requestMediaKeySystemAccess(ks, probeConfigs);
            return { available: true };
        } catch (e: any) {
            // NotAllowedError = Permissions-Policy blocked (iframe without allow="encrypted-media")
            if (e.name === 'NotAllowedError') {
                const msg = isInIframe
                    ? 'DRM is blocked because the iframe is missing the "encrypted-media" permission. '
                    + 'The embedding page must use: <iframe allow="encrypted-media; autoplay" ...>'
                    : 'DRM is blocked by browser permissions policy. Ensure encrypted-media is allowed.';
                log(`EME blocked (${ks}): ${e.name} — ${e.message}`);
                return { available: false, reason: msg };
            }
            // NotSupportedError = this key system isn't available, try the next one
        }
    }

    // None of the key systems are supported at all
    return {
        available: false,
        reason: isInIframe
            ? 'No supported DRM key system found. If this player is in an iframe, make sure the parent uses: <iframe allow="encrypted-media; autoplay" ...>'
            : 'No supported DRM key system found in this browser.',
    };
}

// ---------------------------------------------------------------------------
// Hardware Security Detection
// ---------------------------------------------------------------------------

/**
 * Detect if ANY DRM system on this device supports hardware-level security.
 *
 * Why we check multiple systems:
 * A device may support L1 on one CDM but not another. For example, Windows 11
 * with Edge often has PlayReady L1 (SL3000) but Widevine L3 (software-only).
 * The rtc-drm-transform library auto-selects the best available CDM, so if
 * PlayReady L1 works, playback is fine even if Widevine is L3.
 *
 * @returns Object with `supported` (true if any HW-secure DRM is available)
 *          and `details` (which systems were checked and their results)
 */
export async function detectHardwareSecuritySupport(
    encryptionScheme: 'cenc' | 'cbcs' = 'cbcs'
): Promise<{
    supported: boolean;
    details: DrmSecurityDetail[];
}> {
    if (!navigator.requestMediaKeySystemAccess) {
        return { supported: false, details: [] };
    }

    const checks: { system: string; keySystem: string; robustness: string }[] = [
        {
            system: 'Widevine',
            keySystem: 'com.widevine.alpha',
            robustness: 'HW_SECURE_ALL',             // Widevine L1 = hardware-secure
        },
        {
            system: 'PlayReady',
            keySystem: 'com.microsoft.playready.recommendation',
            robustness: '3000',                        // PlayReady SL3000 = hardware-secure
        },
    ];

    const details: DrmSecurityDetail[] = [];

    for (const check of checks) {
        try {
            await navigator.requestMediaKeySystemAccess(check.keySystem, [{
                initDataTypes: ['cenc'],
                videoCapabilities: [{
                    contentType: 'video/mp4; codecs="avc1.42E01E"',
                    robustness: check.robustness,
                    encryptionScheme // Check specific encryption support (e.g. cbcs)
                }],
            }]);
            details.push({ system: check.system, hwSecure: true });
        } catch {
            details.push({ system: check.system, hwSecure: false });
        }
    }


    // FairPlay (Safari/iOS) — no robustness probing needed.
    // FairPlay on Apple devices is ALWAYS hardware-secure by design.
    try {
        await navigator.requestMediaKeySystemAccess('com.apple.fps.1_0', [{
            initDataTypes: ['sinf'],
            videoCapabilities: [{
                contentType: 'video/mp4; codecs="avc1.42E01E"',
            }],
        }]);
        details.push({ system: 'FairPlay', hwSecure: true });
    } catch {
        details.push({ system: 'FairPlay', hwSecure: false });
    }

    const supported = details.some(d => d.hwSecure);
    return { supported, details };
}

// ---------------------------------------------------------------------------
// Single-Candidate Hardware Security Probe
// ---------------------------------------------------------------------------

/**
 * Probe a single DRM key system for hardware-level security.
 *
 * Used by the platform-first pipeline in `drmCapability.ts` to walk the
 * candidate list one-at-a-time, stopping at the first HW-backed match.
 *
 * IMPORTANT: This probe intentionally does NOT include `encryptionScheme`
 * (e.g. 'cbcs' or 'cenc'). Including it causes false negatives — for example,
 * PlayReady SL3000 on Windows/Edge fails the probe when `encryptionScheme: 'cbcs'`
 * is specified, even though the device fully supports L1 hardware DRM.
 * The encryption scheme is a config concern handled by `buildDrmConfig()`.
 *
 * @param keySystem  - EME key system string (e.g. 'com.widevine.alpha')
 * @param robustness - HW robustness level (e.g. 'HW_SECURE_ALL', '3000', or '' for FairPlay)
 * @param initDataTypes - Init data types to probe with (e.g. ['cenc'] or ['sinf'])
 * @returns true if the key system supports the requested robustness level
 */
export async function probeHardwareSecurity(
    keySystem: string,
    robustness: string,
    initDataTypes: string[],
): Promise<boolean> {
    if (!navigator.requestMediaKeySystemAccess) {
        return false;
    }

    try {
        const videoCapability: any = {
            contentType: 'video/mp4; codecs="avc1.42E01E"',
        };
        // Only set robustness when provided (FairPlay doesn't use it)
        if (robustness) {
            videoCapability.robustness = robustness;
        }

        await navigator.requestMediaKeySystemAccess(keySystem, [{
            initDataTypes,
            videoCapabilities: [videoCapability],
        }]);
        return true;
    } catch {
        return false;
    }
}

