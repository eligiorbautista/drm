# DRM Robustness Warning Fix

## Problem

When testing the embeddable player on Windows, the following warning appears in the browser console:

```
It is recommended that a robustness level be specified. Not specifying the robustness level could result in unexpected behavior.
```

## Root Cause

The warning is issued by the EME (Encrypted Media Extensions) system when:

1. A MediaKeySystemConfiguration's videoCapabilities contains an empty string for robustness (`robustness: ''`)
2. A robustness value is not specified in the EME probe configuration

The original code used a single probe configuration for all key systems:

```typescript
const probeConfigs: MediaKeySystemConfiguration[] = [{
  initDataTypes: ['cenc'],
  videoCapabilities: [{ 
    contentType: 'video/mp4; codecs="avc1.42E01E"', 
    robustness: ''  // ← This causes the warning
  }]
}];
```

## Understanding Robustness

Based on the `client-integration-guide.md` documentation:

### What is Robustness?

Robustness describes the security level of the Content Decryption Module (CDM):

**SW (Software) / SW_SECURE_CRYPTO:**
- Decryption happens in software
- Less secure than hardware-based DRM
- Works on most platforms
- Requires **at least 600ms buffer** for smooth playback (per client-integration-guide.md)

**HW (Hardware) / HW_SECURE_ALL:**
- Decryption happens in hardware (TEE, Secure Enclave)
- More secure than software-based DRM
- Enforces output protection (HDCP)
- Required on **Android for output protection to work** (per client-integration-guide.md)
- Requires **at least 1200ms buffer** for smooth playback (per client-integration-guide.md)

### When is Robustness Required?

1. **Android (Recommended):**
   ```javascript
   // Recommended Android settings (enforce HW-security / Widevine L1 because 
   // otherwise output protection won't work)
   if (platform === 'Android')
       drmConfig.video.robustness = 'HW';
   ```

2. **Windows Desktop:**
   - Widevine L3 (SW): 600ms minimum buffer
   - Widevine L1 (HW): 1200ms minimum buffer

3. **Desktop Browsers (Chrome/Edge/Firefox):**
   - SW (software) is the default and works well
   - Not strictly required, but recommended to specify to avoid warnings

4. **FairPlay (Safari/iOS):**
   - **Does NOT support the robustness parameter**
   - Should not be specified (empty string or omitted)

## EME Robustness Values

According to the W3C EME specification, valid robustness strings include:

For **Widevine** and **PlayReady**:
- `SW_SECURE_CRYPTO` - Software cryptographic processing
- `SW_SECURE_DECODE` - Software cryptographic and video decoding
- `HW_SECURE_CRYPTO` - Hardware cryptographic processing, but the decoded media frames may be displayed on the screen
- `HW_SECURE_DECODE` - Hardware cryptographic and video decoding (media frames are never exposed to software)
- `HW_SECURE_ALL` - Hardware DRM processing, including cryptographic and decode processing, as well as all other steps in the processing of the content (e.g., composition, rendering, and output)

For **FairPlay**:
- The robustness parameter is **not supported** and should be omitted

## Fix Applied

### Before (Single Probe Config)

```typescript
const probeConfigs: MediaKeySystemConfiguration[] = [{
  initDataTypes: ['cenc'],
  videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: '' }]
}];

const keySystems = ['com.widevine.alpha', 'com.apple.fps.1_0', 'com.microsoft.playready.recommendation'];

for (const ks of keySystems) {
  return navigator.requestMediaKeySystemAccess(ks, probeConfigs).then(() => ({ available: true }));
}
```

**Problems:**
- Uses empty string for robustness on all key systems
- FairPlay incorrectly receives a robustness value
- EME system warns about missing/invalid robustness

### After (Key System-Specific Probe Configs)

```typescript
const keySystems = ['com.widevine.alpha', 'com.apple.fps.1_0', 'com.microsoft.playready.recommendation'];

for (const ks of keySystems) {
  try {
    let probeConfigs: MediaKeySystemConfiguration[];

    if (ks === 'com.apple.fps.1_0') {
      // FairPlay: Don't specify robustness (not supported)
      probeConfigs = [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
      }];
    } else {
      // Widevine and PlayReady: Specify robustness to avoid EME warnings
      probeConfigs = [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{ 
          contentType: 'video/mp4; codecs="avc1.42E01E"', 
          robustness: 'SW_SECURE_CRYPTO' 
        }]
      }];
    }

    return navigator.requestMediaKeySystemAccess(ks, probeConfigs).then(() => ({ available: true }));
  } catch (e: any) {
    // ... error handling
  }
}
```

**Benefits:**
- FairPlay doesn't receive robustness parameter (correct behavior)
- Widevine and PlayReady receive valid robustness value
- EME system doesn't issue warnings

## Additional Considerations

### Android HW Detection

The code already correctly probes for Widevine L1 (HW_SECURE_ALL) on Android:

```typescript
if (isAndroid) {
  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{
        contentType: 'video/mp4; codecs="avc1.42E01E"',
        robustness: 'HW_SECURE_ALL'  // Probes for L1 hardware support
      }]
    }]);
    androidRobustness = 'HW';
  } catch {
    androidRobustness = 'SW';  // Falls back to L3 software
  }
}
```

### Media Buffer Sizing

Per the documentation, media buffer is adjusted based on robustness:

```typescript
if (isAndroid && androidRobustness === 'HW') {
  mediaBufferMs = 1200;  // HW needs 1200ms
} else if (isFirefox && mediaBufferMs < 900) {
  mediaBufferMs = 900;   // Firefox specific
} else if (mediaBufferMs < 600) {
  mediaBufferMs = 600;   // SW needs 600ms
}
```

## Platform-Specific Robustness Recommendations

| Platform | Browser | DRM System | Recommended Robustness |
|----------|---------|------------|------------------------|
| iOS | Safari | FairPlay | N/A (not supported) |
| macOS | Safari | FairPlay | N/A (not supported) |
| macOS | Chrome/Edge | Widevine | `SW_SECURE_CRYPTO` |
| macOS | Firefox | Widevine | `SW_SECURE_CRYPTO` |
| Windows | Chrome/Edge | Widevine | `SW_SECURE_CRYPTO` or `HW_SECURE_ALL` |
| Windows | Firefox | Widevine | `SW_SECURE_CRYPTO` |
| Android | Chrome | Widevine | `HW_SECURE_ALL` (for output protection) |
| Android | Firefox | Widevine | `HW_SECURE_ALL` (for output protection) |
| Linux | Chrome/Firefox | Widevine | `SW_SECURE_CRYPTO` |

## Testing

After applying this fix, the warning should no longer appear on any platform:

### Windows (Chrome/Edge/Firefox)
- ✅ No robustness warning
- ✅ EME probe passes with `SW_SECURE_CRYPTO`

### macOS (Safari)
- ✅ No robustness warning (FairPlay doesn't use robustness)
- ✅ EME probe passes without robustness parameter

### macOS (Chrome/Edge/Firefox)
- ✅ No robustness warning
- ✅ EME probe passes with `SW_SECURE_CRYPTO`

### Android
- ✅ No robustness warning
- ✅ EME probe passes with `HW_SECURE_ALL` (if L1) or `SW_SECURE_CRYPTO` (if L3)
- ✅ Output protection works with `HW` robustness

## Summary

The robustness warning was caused by using an empty string for the robustness parameter in the EME probe configuration. The fix uses key system-specific probe configurations:

- **FairPlay**: No robustness parameter (not supported)
- **Widevine/PlayReady**: `SW_SECURE_CRYPTO` (software crypto, recommended for desktop)

This ensures best practices are followed for each DRM system and eliminates the browser warning while maintaining compatibility across all platforms.
