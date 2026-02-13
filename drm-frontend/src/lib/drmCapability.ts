/**
 * DRM Capability Detection Module
 *
 * Orchestrates the full DRM capability detection pipeline:
 *   1. EME availability check (catches iframe permission issues)
 *   2. Hardware security probe (Widevine L1, PlayReady SL3000, FairPlay)
 *   3. CDM type selection (picks the best available hardware-secure CDM)
 *
 * This module is shared between /viewer and /embed players so that both
 * use identical detection logic.
 */

import {
    checkEmeAvailability,
    detectHardwareSecuritySupport,
    detectPlatform,
    type PlatformInfo,
    type DrmSecurityDetail,
} from './drmUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported DRM system names matching the rtc-drm-transform library's `type` field. */
export type DrmType = 'Widevine' | 'PlayReady' | 'FairPlay';

/** Security level the device supports. */
export type SecurityLevel = 'L1' | 'L3' | 'checking';

/** Full result of DRM capability detection. */
export interface DrmCapabilityResult {
    /** Whether the device supports hardware-backed DRM. */
    supported: boolean;
    /** 'L1' if hardware DRM is available, 'L3' if only software DRM exists. */
    securityLevel: 'L1' | 'L3';
    /**
     * The DRM system to use for playback.
     * Selected based on platform + which CDMs have hardware support.
     */
    selectedDrmType: DrmType;
    /** Raw results from probing each CDM's hardware security. */
    hwDetails: DrmSecurityDetail[];
    /** Platform detection results. */
    platform: PlatformInfo;
    /**
     * If `supported` is false, a human-readable explanation of why
     * playback is blocked (e.g., "only Widevine L3 available").
     */
    blockReason?: string;
}

// ---------------------------------------------------------------------------
// Main Detection Function
// ---------------------------------------------------------------------------

/**
 * Run the complete DRM capability detection pipeline.
 *
 * Call this BEFORE initializing the DRM library. If the result has
 * `supported === false`, show the fallback overlay and do NOT proceed
 * with DRM setup.
 *
 * @param logDebug - Optional logging callback for debug output
 * @returns Full capability result with CDM selection and security level
 */
export async function detectDrmCapability(
    logDebug?: (msg: string) => void
): Promise<DrmCapabilityResult> {
    const log = logDebug || (() => { });

    // ── Step 1: Detect platform ───────────────────────────────────────────
    const platform = detectPlatform();
    log(`Platform detected: ${platform.detectedPlatform} (isAndroid=${platform.isAndroid}, isFirefox=${platform.isFirefox}, isIOS=${platform.isIOS}, isSafari=${platform.isSafari})`);

    // ── Step 2: Check EME availability ────────────────────────────────────
    // EME can be blocked in cross-origin iframes without allow="encrypted-media"
    const emeCheck = await checkEmeAvailability(log);
    if (!emeCheck.available) {
        log(`EME check failed: ${emeCheck.reason}`);
        return {
            supported: false,
            securityLevel: 'L3',
            selectedDrmType: selectDrmTypeForPlatform(platform, []),
            hwDetails: [],
            platform,
            blockReason: emeCheck.reason,
        };
    }
    log('EME availability check passed');

    // ── Step 3: Probe hardware security for all DRM systems ───────────────
    // We probe Widevine (HW_SECURE_ALL), PlayReady (SL3000), and FairPlay.
    // A device may support L1 on one CDM but L3 on another. For example:
    //   - Windows 11 + Edge: PlayReady=L1 (SL3000), Widevine=L3 (software)
    //   - Android + Chrome: Widevine=L1 (HW_SECURE_ALL)
    //   - iOS + Safari: FairPlay=L1 (always hardware on Apple silicon)
    const { supported, details } = await detectHardwareSecuritySupport();
    const detailStr = details.map(d => `${d.system}: ${d.hwSecure ? 'HW' : 'SW'}`).join(', ');
    log(`DRM hardware security check: ${detailStr}`);

    if (!supported) {
        // BLOCKED: No DRM system supports hardware security.
        // This means the device only has Widevine L3 (software) or no DRM at all.
        // We do NOT allow software-based DRM — it can be trivially bypassed.
        log(`No DRM system supports hardware security on this device (${detailStr})`);
        return {
            supported: false,
            securityLevel: 'L3',
            selectedDrmType: selectDrmTypeForPlatform(platform, details),
            hwDetails: details,
            platform,
            blockReason: `No hardware-backed DRM available (${detailStr}). Only L1/hardware security is permitted.`,
        };
    }

    // ── Step 4: Select the best CDM ──────────────────────────────────────
    const selectedDrmType = selectDrmTypeForPlatform(platform, details);
    log(`Selected DRM type: ${selectedDrmType} (hardware-secure)`);

    return {
        supported: true,
        securityLevel: 'L1',
        selectedDrmType,
        hwDetails: details,
        platform,
    };
}

// ---------------------------------------------------------------------------
// CDM Selection Helper
// ---------------------------------------------------------------------------

/**
 * Select the best DRM type for the detected platform and hardware capabilities.
 *
 * Selection logic:
 * 1. iOS/Safari → always FairPlay (only CDM available on Apple devices)
 * 2. If Widevine has HW support → use Widevine (Android, ChromeOS, some Windows)
 * 3. If PlayReady has HW support → use PlayReady (Windows 11 + Edge)
 * 4. Default → Widevine (should only reach here if detection already failed)
 *
 * IMPORTANT: On Windows, Widevine is often L3 (software) while PlayReady is L1
 * (hardware). If we blindly picked Widevine, the library wouldn't try PlayReady
 * and playback would fail. That's why we check HW support per-CDM.
 */
function selectDrmTypeForPlatform(
    platform: PlatformInfo,
    hwDetails: DrmSecurityDetail[],
): DrmType {
    // Apple devices only support FairPlay
    if (platform.isIOS || platform.isSafari) {
        return 'FairPlay';
    }

    // Check which CDMs have hardware security
    const widevineHW = hwDetails.find(d => d.system === 'Widevine')?.hwSecure ?? false;
    const playreadyHW = hwDetails.find(d => d.system === 'PlayReady')?.hwSecure ?? false;

    if (widevineHW) {
        // Widevine L1 available — preferred on Android, ChromeOS, Linux with HW
        return 'Widevine';
    }

    if (playreadyHW) {
        // PlayReady SL3000 available but Widevine is L3-only.
        // Common on Windows 11 + Edge where Widevine=L3, PlayReady=SL3000.
        return 'PlayReady';
    }

    // Fallback to Widevine (if we reach here, detection already failed and
    // the caller should have blocked playback)
    return 'Widevine';
}
