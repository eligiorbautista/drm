/**
 * DRM Utility Functions
 * Helper functions for DRM key conversion and validation
 *
 * NOTE: This project uses Callback Authorization mode. The backend handles CRT generation.
 * No client-side JWT or authToken generation is needed.
 */

/**
 * Convert hex string to Uint8Array
 * @param hex - Hex string (e.g., "abcd1234...")
 * @returns Uint8Array of bytes
 */
export function hexToUint8Array(hex: string): Uint8Array {
    // Remove any spaces or separators
    const cleanHex = hex.replace(/[\s:-]/g, '');

    if (cleanHex.length % 2 !== 0) {
        throw new Error(`Invalid hex string length: ${cleanHex.length}. Must be even.`);
    }

    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }

    return new Uint8Array(bytes);
}

/**
 * Validate DRM key format
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

/**
 * Detect if ANY DRM system on this device supports hardware-level security.
 *
 * Checks multiple DRM systems because a device may support L1 on one but not
 * another. For example, Windows 11 with Edge often has PlayReady L1 (SL3000)
 * but Widevine L3 (software-only). The rtc-drm-transform library auto-selects
 * the best available CDM, so if PlayReady L1 works, playback is fine.
 *
 * @returns Object with `supported` (true if any HW-secure DRM is available)
 *          and `details` (which systems were checked and their results)
 */
export async function detectHardwareSecuritySupport(): Promise<{
    supported: boolean;
    details: { system: string; hwSecure: boolean }[];
}> {
    if (!navigator.requestMediaKeySystemAccess) {
        return { supported: false, details: [] };
    }

    const checks: { system: string; keySystem: string; robustness: string }[] = [
        {
            system: 'Widevine',
            keySystem: 'com.widevine.alpha',
            robustness: 'HW_SECURE_ALL'
        },
        {
            system: 'PlayReady',
            keySystem: 'com.microsoft.playready.recommendation',
            robustness: '3000' // PlayReady SL3000 = hardware-secure
        },
    ];

    const details: { system: string; hwSecure: boolean }[] = [];

    for (const check of checks) {
        try {
            await navigator.requestMediaKeySystemAccess(check.keySystem, [{
                initDataTypes: ['cenc'],
                videoCapabilities: [{
                    contentType: 'video/mp4; codecs="avc1.42E01E"',
                    robustness: check.robustness
                }]
            }]);
            details.push({ system: check.system, hwSecure: true });
        } catch {
            details.push({ system: check.system, hwSecure: false });
        }
    }

    // Also check FairPlay (Safari/iOS) — no robustness probing, just availability
    // FairPlay on Apple devices is always hardware-secure
    try {
        await navigator.requestMediaKeySystemAccess('com.apple.fps.1_0', [{
            initDataTypes: ['sinf'],
            videoCapabilities: [{
                contentType: 'video/mp4; codecs="avc1.42E01E"'
            }]
        }]);
        details.push({ system: 'FairPlay', hwSecure: true });
    } catch {
        details.push({ system: 'FairPlay', hwSecure: false });
    }

    const supported = details.some(d => d.hwSecure);
    return { supported, details };
}
