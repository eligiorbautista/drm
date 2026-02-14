/**
 * Tests for DRM Capability Detection — Mobile-First, Hardware-Only
 *
 * These tests verify the platform→DRM priority chains and the
 * short-circuit evaluation pipeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getPlatformDrmCandidates,
    selectDrmTypeForPlatform,
} from './drmCapability';
import type { PlatformInfo, DrmSecurityDetail } from './drmUtils';

// ---------------------------------------------------------------------------
// Helper: build a PlatformInfo with defaults
// ---------------------------------------------------------------------------
function makePlatform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
    return {
        isAndroid: false,
        isFirefox: false,
        isIOS: false,
        isSafari: false,
        isWindows: false,
        isChrome: false,
        isEdge: false,
        isMobile: false,
        detectedPlatform: 'Unknown',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// getPlatformDrmCandidates
// ---------------------------------------------------------------------------
describe('getPlatformDrmCandidates', () => {
    it('returns FairPlay only for iOS', () => {
        const candidates = getPlatformDrmCandidates(
            makePlatform({ isIOS: true, isMobile: true, detectedPlatform: 'iOS' })
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0].drmType).toBe('FairPlay');
    });

    it('returns FairPlay only for Safari (macOS)', () => {
        const candidates = getPlatformDrmCandidates(
            makePlatform({ isSafari: true, detectedPlatform: 'Safari' })
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0].drmType).toBe('FairPlay');
    });

    it('returns Widevine → PlayReady for Android', () => {
        const candidates = getPlatformDrmCandidates(
            makePlatform({ isAndroid: true, isMobile: true, detectedPlatform: 'Android' })
        );
        expect(candidates).toHaveLength(2);
        expect(candidates[0].drmType).toBe('Widevine');
        expect(candidates[1].drmType).toBe('PlayReady');
    });

    it('returns PlayReady → Widevine for Windows + Edge', () => {
        const candidates = getPlatformDrmCandidates(
            makePlatform({ isWindows: true, isEdge: true, detectedPlatform: 'Edge' })
        );
        expect(candidates).toHaveLength(2);
        expect(candidates[0].drmType).toBe('PlayReady');
        expect(candidates[1].drmType).toBe('Widevine');
    });

    it('returns Widevine → PlayReady for Windows + Chrome', () => {
        const candidates = getPlatformDrmCandidates(
            makePlatform({ isWindows: true, isChrome: true, detectedPlatform: 'Chrome' })
        );
        expect(candidates).toHaveLength(2);
        expect(candidates[0].drmType).toBe('Widevine');
        expect(candidates[1].drmType).toBe('PlayReady');
    });

    it('returns Widevine → PlayReady for Linux (default)', () => {
        const candidates = getPlatformDrmCandidates(
            makePlatform({ detectedPlatform: 'Linux' })
        );
        expect(candidates).toHaveLength(2);
        expect(candidates[0].drmType).toBe('Widevine');
        expect(candidates[1].drmType).toBe('PlayReady');
    });
});

// ---------------------------------------------------------------------------
// selectDrmTypeForPlatform (backwards-compatible helper)
// ---------------------------------------------------------------------------
describe('selectDrmTypeForPlatform', () => {
    it('selects Widevine when it has HW on Android', () => {
        const hw: DrmSecurityDetail[] = [
            { system: 'Widevine', hwSecure: true },
            { system: 'PlayReady', hwSecure: false },
        ];
        const result = selectDrmTypeForPlatform(
            makePlatform({ isAndroid: true, isMobile: true }),
            hw,
        );
        expect(result).toBe('Widevine');
    });

    it('selects PlayReady when only it has HW on Android', () => {
        const hw: DrmSecurityDetail[] = [
            { system: 'Widevine', hwSecure: false },
            { system: 'PlayReady', hwSecure: true },
        ];
        const result = selectDrmTypeForPlatform(
            makePlatform({ isAndroid: true, isMobile: true }),
            hw,
        );
        expect(result).toBe('PlayReady');
    });

    it('selects FairPlay on iOS', () => {
        const hw: DrmSecurityDetail[] = [
            { system: 'FairPlay', hwSecure: true },
        ];
        const result = selectDrmTypeForPlatform(
            makePlatform({ isIOS: true }),
            hw,
        );
        expect(result).toBe('FairPlay');
    });

    it('selects PlayReady on Windows Edge when it has HW but Widevine does not', () => {
        const hw: DrmSecurityDetail[] = [
            { system: 'Widevine', hwSecure: false },
            { system: 'PlayReady', hwSecure: true },
        ];
        const result = selectDrmTypeForPlatform(
            makePlatform({ isWindows: true, isEdge: true }),
            hw,
        );
        expect(result).toBe('PlayReady');
    });

    it('falls back to platform default when no HW is available', () => {
        const hw: DrmSecurityDetail[] = [
            { system: 'Widevine', hwSecure: false },
            { system: 'PlayReady', hwSecure: false },
        ];
        const result = selectDrmTypeForPlatform(
            makePlatform({ isAndroid: true }),
            hw,
        );
        // Android default is Widevine (first candidate)
        expect(result).toBe('Widevine');
    });
});

// ---------------------------------------------------------------------------
// detectDrmCapability (integration-style with mocked probes)
// ---------------------------------------------------------------------------
describe('detectDrmCapability', () => {
    // We need to mock the probeHardwareSecurity and other utils
    // Since detectDrmCapability imports from drmUtils, we mock at module level
    let mockProbe: ReturnType<typeof vi.fn>;
    let mockEmeCheck: ReturnType<typeof vi.fn>;
    let mockDetectPlatform: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();
    });

    async function setupMocks(
        platform: PlatformInfo,
        probeResults: boolean[],
        emeAvailable = true,
    ) {
        mockProbe = vi.fn();
        probeResults.forEach((result) => {
            mockProbe.mockResolvedValueOnce(result);
        });
        mockEmeCheck = vi.fn().mockResolvedValue({
            available: emeAvailable,
            reason: emeAvailable ? undefined : 'EME blocked',
        });
        mockDetectPlatform = vi.fn().mockReturnValue(platform);

        vi.doMock('./drmUtils', () => ({
            checkEmeAvailability: mockEmeCheck,
            detectPlatform: mockDetectPlatform,
            probeHardwareSecurity: mockProbe,
        }));

        const mod = await import('./drmCapability');
        return mod.detectDrmCapability;
    }

    it('selects first HW-backed candidate (Widevine L1 on Android)', async () => {
        const android = makePlatform({ isAndroid: true, isMobile: true, detectedPlatform: 'Android' });
        const detect = await setupMocks(android, [true]); // Widevine passes → short-circuit
        const result = await detect(() => { });

        expect(result.supported).toBe(true);
        expect(result.selectedDrmType).toBe('Widevine');
        expect(result.securityLevel).toBe('L1');
        expect(result.evaluatedCandidates).toHaveLength(1);
        expect(result.evaluatedCandidates[0]).toEqual({ drmType: 'Widevine', hwSecure: true });
        // Should NOT have probed PlayReady (short-circuit)
        expect(mockProbe).toHaveBeenCalledTimes(1);
    });

    it('falls through to PlayReady when Widevine fails HW on Android', async () => {
        const android = makePlatform({ isAndroid: true, isMobile: true, detectedPlatform: 'Android' });
        const detect = await setupMocks(android, [false, true]); // Widevine fails, PlayReady passes
        const result = await detect(() => { });

        expect(result.supported).toBe(true);
        expect(result.selectedDrmType).toBe('PlayReady');
        expect(result.evaluatedCandidates).toHaveLength(2);
        expect(result.evaluatedCandidates[0]).toEqual({ drmType: 'Widevine', hwSecure: false });
        expect(result.evaluatedCandidates[1]).toEqual({ drmType: 'PlayReady', hwSecure: true });
    });

    it('returns unsupported when no HW candidate found', async () => {
        const android = makePlatform({ isAndroid: true, isMobile: true, detectedPlatform: 'Android' });
        const detect = await setupMocks(android, [false, false]); // Both fail
        const result = await detect(() => { });

        expect(result.supported).toBe(false);
        expect(result.securityLevel).toBe('L3');
        expect(result.blockReason).toBe('Device is not supported');
        expect(result.evaluatedCandidates).toEqual([
            { drmType: 'Widevine', hwSecure: false },
            { drmType: 'PlayReady', hwSecure: false },
        ]);
    });

    it('returns unsupported when EME is blocked', async () => {
        const ios = makePlatform({ isIOS: true, detectedPlatform: 'iOS' });
        const detect = await setupMocks(ios, [], false); // EME blocked
        const result = await detect(() => { });

        expect(result.supported).toBe(false);
        expect(result.blockReason).toBe('EME blocked');
        expect(result.evaluatedCandidates).toHaveLength(0);
    });

    it('selects FairPlay on iOS when HW available', async () => {
        const ios = makePlatform({ isIOS: true, isMobile: true, detectedPlatform: 'iOS' });
        const detect = await setupMocks(ios, [true]); // FairPlay passes
        const result = await detect(() => { });

        expect(result.supported).toBe(true);
        expect(result.selectedDrmType).toBe('FairPlay');
        expect(result.evaluatedCandidates).toEqual([
            { drmType: 'FairPlay', hwSecure: true },
        ]);
    });
});
