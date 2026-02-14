/**
 * DRM Capability Detection Module — Mobile-First, Hardware-Only
 *
 * Platform-first evaluation pipeline:
 *   1. Detect platform (Android / iOS / Windows / other)
 *   2. Check EME availability (catches iframe permission issues)
 *   3. Get ordered DRM candidates for the platform
 *   4. Walk candidates: probe HW security one-at-a-time, stop at first match
 *   5. If no HW-backed candidate found → block with "Device is not supported"
 *
 * This module is shared between /viewer and /embed players so that both
 * use identical detection logic.
 */

import {
    checkEmeAvailability,
    detectPlatform,
    probeHardwareSecurity,
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

/** One candidate DRM scheme in the platform priority chain. */
export interface DrmSchemeCandidate {
    /** DRM type name used by the rtc-drm-transform library. */
    drmType: DrmType;
    /** EME key system string. */
    keySystem: string;
    /** HW robustness level to require (e.g. 'HW_SECURE_ALL', '3000', or '' for FairPlay). */
    hwRobustness: string;
    /** Init data types for the EME probe (e.g. ['cenc'] or ['sinf']). */
    initDataTypes: string[];
}

/** Result of probing one candidate. */
export interface EvaluatedCandidate {
    drmType: DrmType;
    hwSecure: boolean;
}

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
     * playback is blocked (e.g., "Device is not supported").
     */
    blockReason?: string;
    /** Candidates evaluated in priority order with their HW probe results. */
    evaluatedCandidates: EvaluatedCandidate[];
}

// ---------------------------------------------------------------------------
// Platform → DRM Candidate Mapping
// ---------------------------------------------------------------------------

/**
 * Return ordered DRM candidates for the given platform.
 *
 * This is the **single source of truth** for which DRM schemes to try
 * and in what order. Mobile platforms are listed first because mobile
 * detection takes priority in `detectPlatform()`.
 *
 * To add a new DRM scheme or platform, append to the appropriate list.
 *
 * Decision table:
 *
 * | Platform         | Priority | DRM       | HW Requirement       |
 * |------------------|----------|-----------|----------------------|
 * | Android          | 1        | Widevine  | L1 (HW_SECURE_ALL)   |
 * | Android          | 2        | PlayReady | SL3000               |
 * | iOS / Safari     | 1        | FairPlay  | HW (always)          |
 * | Windows (Edge)   | 1        | PlayReady | SL3000               |
 * | Windows (Edge)   | 2        | Widevine  | L1 (HW_SECURE_ALL)   |
 * | Windows (Chrome) | 1        | Widevine  | L1 (HW_SECURE_ALL)   |
 * | Windows (Chrome) | 2        | PlayReady | SL3000               |
 * | Other            | 1        | Widevine  | L1 (HW_SECURE_ALL)   |
 * | Other            | 2        | PlayReady | SL3000               |
 */
export function getPlatformDrmCandidates(platform: PlatformInfo): DrmSchemeCandidate[] {
    const widevineL1: DrmSchemeCandidate = {
        drmType: 'Widevine',
        keySystem: 'com.widevine.alpha',
        hwRobustness: 'HW_SECURE_ALL',
        initDataTypes: ['cenc'],
    };

    const playreadySL3000: DrmSchemeCandidate = {
        drmType: 'PlayReady',
        keySystem: 'com.microsoft.playready.recommendation',
        hwRobustness: '3000',
        initDataTypes: ['cenc'],
    };

    const fairplayHW: DrmSchemeCandidate = {
        drmType: 'FairPlay',
        keySystem: 'com.apple.fps.1_0',
        hwRobustness: '',           // FairPlay is always HW on Apple silicon
        initDataTypes: ['sinf'],
    };

    // ── Mobile-first: detect Android/iOS before anything else ─────────
    if (platform.isIOS || platform.isSafari) {
        return [fairplayHW];
    }

    if (platform.isAndroid) {
        return [widevineL1, playreadySL3000];
    }

    // ── Desktop / other ───────────────────────────────────────────────
    if (platform.isWindows && platform.isEdge) {
        // Windows + Edge: PlayReady SL3000 is the native, preferred CDM
        return [playreadySL3000, widevineL1];
    }

    if (platform.isWindows) {
        // Windows + Chrome or other Chromium: try Widevine first
        return [widevineL1, playreadySL3000];
    }

    // Linux, ChromeOS, other
    return [widevineL1, playreadySL3000];
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
 * Pipeline:
 *   1. Detect platform (mobile-first: Android/iOS before desktop).
 *   2. Check EME availability (catches iframe permission blocks).
 *   3. Get ordered DRM candidates for the platform.
 *   4. Walk candidates one-at-a-time: probe HW security, stop on first match.
 *   5. If none qualify → supported=false, blockReason="Device is not supported".
 *
 * @param logDebug - Optional logging callback for debug output
 * @param encryptionScheme - Encryption scheme to probe ('cenc' or 'cbcs')
 * @returns Full capability result with CDM selection and security level
 */
export async function detectDrmCapability(
    logDebug: (msg: string) => void,
    encryptionScheme: 'cenc' | 'cbcs' = 'cbcs'
): Promise<DrmCapabilityResult> {
    const log = logDebug || (() => { });

    // ── Step 1: Detect platform (mobile-first) ───────────────────────────
    const platform = detectPlatform();
    log(`Platform detected: ${platform.detectedPlatform} (mobile: ${platform.isMobile})`);

    // ── Step 2: Check EME availability ────────────────────────────────────
    const emeCheck = await checkEmeAvailability(logDebug);
    if (!emeCheck.available) {
        log(`EME check failed: ${emeCheck.reason}`);
        const candidates = getPlatformDrmCandidates(platform);
        return {
            supported: false,
            securityLevel: 'L3',
            selectedDrmType: candidates[0]?.drmType ?? 'Widevine',
            hwDetails: [],
            platform,
            blockReason: emeCheck.reason,
            evaluatedCandidates: [],
        };
    }
    log('EME availability check passed');

    // ── Step 3: Get ordered candidates for this platform ──────────────────
    const candidates = getPlatformDrmCandidates(platform);
    const candidateNames = candidates.map(c => c.drmType).join(' → ');
    log(`DRM candidate priority chain: ${candidateNames}`);

    // ── Step 4: Walk candidates — probe HW security one-at-a-time ────────
    const evaluatedCandidates: EvaluatedCandidate[] = [];
    const hwDetails: DrmSecurityDetail[] = [];
    let selectedCandidate: DrmSchemeCandidate | null = null;

    for (const candidate of candidates) {
        const hwSecure = await probeHardwareSecurity(
            candidate.keySystem,
            candidate.hwRobustness,
            candidate.initDataTypes,
            encryptionScheme,
        );

        evaluatedCandidates.push({ drmType: candidate.drmType, hwSecure });
        hwDetails.push({ system: candidate.drmType, hwSecure });

        log(`  ${candidate.drmType}: ${hwSecure ? 'HW ✓' : 'SW ✗'}`);

        if (hwSecure && !selectedCandidate) {
            selectedCandidate = candidate;
            log(`  → Selected ${candidate.drmType} (hardware-backed)`);
            // Short-circuit: we found a valid HW-backed DRM, no need to probe more
            break;
        }
    }

    // ── Step 5: Evaluate result ──────────────────────────────────────────
    if (!selectedCandidate) {
        const detailStr = evaluatedCandidates
            .map(c => `${c.drmType}: ${c.hwSecure ? 'HW' : 'SW'}`)
            .join(', ');
        log(`No HW-backed DRM found (${detailStr}) — device is not supported`);
        return {
            supported: false,
            securityLevel: 'L3',
            selectedDrmType: candidates[0]?.drmType ?? 'Widevine',
            hwDetails,
            platform,
            blockReason: 'Device is not supported',
            evaluatedCandidates,
        };
    }

    log(`DRM ready: ${selectedCandidate.drmType} (L1 hardware-backed)`);
    return {
        supported: true,
        securityLevel: 'L1',
        selectedDrmType: selectedCandidate.drmType,
        hwDetails,
        platform,
        evaluatedCandidates,
    };
}

// ---------------------------------------------------------------------------
// CDM Selection Helper (backwards-compatible)
// ---------------------------------------------------------------------------

/**
 * Select the best DRM type for the detected platform and hardware capabilities.
 *
 * This function is kept for backwards compatibility with code that already
 * calls it (e.g. drmConfig.ts). The new pipeline in `detectDrmCapability()`
 * already selects the DRM type inline during candidate evaluation.
 *
 * If hwDetails are available, it picks the first HW-backed candidate in
 * platform priority order. Otherwise falls back to the platform default.
 */
export function selectDrmTypeForPlatform(
    platform: PlatformInfo,
    hwDetails: DrmSecurityDetail[],
): DrmType {
    const candidates = getPlatformDrmCandidates(platform);

    // Pick the first candidate that has HW support
    for (const candidate of candidates) {
        const detail = hwDetails.find(d => d.system === candidate.drmType);
        if (detail?.hwSecure) {
            return candidate.drmType;
        }
    }

    // Fallback to platform default (caller should have blocked playback if
    // no HW is available)
    return candidates[0]?.drmType ?? 'Widevine';
}
