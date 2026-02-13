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
 * Detect Widevine security level by probing for HW_SECURE_ALL robustness.
 * Works on all platforms (Android, Windows, Linux, macOS, ChromeOS).
 *
 * - L1 = hardware-secure (TEE/secure hardware handles decryption)
 * - L3 = software-only (no hardware protection — HDCP enforcement impossible)
 *
 * @returns 'L1' if hardware-secure Widevine is available, 'L3' otherwise
 */
export async function detectWidevineSecurityLevel(): Promise<'L1' | 'L3'> {
    if (!navigator.requestMediaKeySystemAccess) {
        return 'L3'; // EME not available at all
    }

    try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
            initDataTypes: ['cenc'],
            videoCapabilities: [{
                contentType: 'video/mp4; codecs="avc1.42E01E"',
                robustness: 'HW_SECURE_ALL'
            }]
        }]);
        return 'L1';
    } catch {
        return 'L3';
    }
}
