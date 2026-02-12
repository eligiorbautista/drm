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

Robustness describes the security level of the Content Decryption Module (CDM).

### ⚠️ Important: Two Different Robustness Contexts

There are **two different robustness value systems**:

1. **EME (Encrypted Media Extensions) Probe** - Used when calling `navigator.requestMediaKeySystemAccess()`
2. **castLabs rtc-drm-transform Video Config** - Used in the video config object passed to `rtcDrmConfigure()`

#### 1. EME Probe Robustness Values

For EME probes (checking if a key system is available), the W3C EME specification defines these valid robustness strings:

For **Widevine** and **PlayReady**:
- `SW_SECURE_CRYPTO` - Software cryptographic processing
- `SW_SECURE_DECODE` - Software cryptographic and video decoding
- `HW_SECURE_CRYPTO` - Hardware cryptographic processing
- `HW_SECURE_DECODE` - Hardware cryptographic and video decoding
- `HW_SECURE_ALL` - Hardware DRM processing for all operations

For **FairPlay**:
- The robustness parameter is **not supported** and should be omitted

**Example:**
```typescript
await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
  initDataTypes: ['cenc'],
  videoCapabilities: [{ 
    contentType: 'video/mp4; codecs="avc1.42E01E"', 
    robustness: 'SW_SECURE_CRYPTO'  ← EME value
  }]
}]);
```

#### 2. castLabs rtc-drm-transform Video Config Robustness

The castLabs `rtc-drm-transform` library **ONLY accepts** two values for the video config robustness:
- `'SW'` - Software security
- `'HW'` - Hardware security

**Example:**
```typescript
const videoConfig = {
  codec: 'H264',
  encryption: 'cbcs',
  robustness: 'SW',  ← castLabs value, NOT 'SW_SECURE_CRYPTO'
  keyId,
  iv
};
```

❌ **DON'T DO THIS:**
```typescript
robustness: 'SW_SECURE_CRYPTO'  // Will throw: "RangeError: DRM config robustness can only be one of: SW, HW"
```

### Security Level Mapping

| castLabs Value | EME Probes | Description | Buffer Requirement |
|----------------|------------|-------------|-------------------|
| `'SW'` | `SW_SECURE_CRYPTO` | Software cryptographic processing | 600ms minimum |
| `'HW'` | `HW_SECURE_ALL` | Hardware DRM processing | 1200ms minimum |

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

### Part 1: EME Probe Configuration (Check EME Availability)

**Before (Single Probe Config):**
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

**After (Key System-Specific Probe Configs):**
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
      // Widevine and PlayReady: Specify EME robustness to avoid warnings
      probeConfigs = [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{
          contentType: 'video/mp4; codecs="avc1.42E01E"',
          robustness: 'SW_SECURE_CRYPTO'  // ← EME-specific value
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
- Widevine and PlayReady receive valid EME robustness value
- EME system doesn't issue warnings

---

### Part 2: castLabs Video Configuration (Actual DRM Playback)

**Before (Invalid Values):**
```typescript
videoConfig = {
  codec: 'H264' as const,
  encryption: 'cbcs' as const,
  robustness: 'SW_SECURE_CRYPTO' as any,  // ❌ WRONG! castLabs doesn't accept this
  keyId,
  iv
};
```

**Error:**
```
RangeError: DRM config robustness can only be one of: SW, HW
```

**After (Valid Values):**
```typescript
videoConfig = {
  codec: 'H264' as const,
  encryption: 'cbcs' as const,
  robustness: 'SW' as 'SW' | 'HW',  // ✅ CORRECT! castLabs library only accepts 'SW' or 'HW'
  keyId,
  iv
};
```

**Android HW Example:**
```typescript
if (isAndroid && androidRobustness === 'HW') {
  videoConfig = {
    codec: 'H264',
    encryption: 'cbcs',
    robustness: 'HW',  // Hardware security for output protection
    keyId,
    iv
  };
}
```

**FairPlay Example:**
```typescript
if (isIOS) {
  videoConfig = {
    codec: 'H264',
    encryption: 'cbcs',
    robustness: 'SW',  // FairPlay ignores this, but castLabs requires it
    iv
    // keyId is handled by FairPlay SKD URL
  };
}
```

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

### castLabs Video Config Values (for `rtcDrmConfigure`)

| Platform | Browser | DRM System | castLabs Robustness | Notes |
|----------|---------|------------|---------------------|-------|
| iOS | Safari | FairPlay | `'SW'` | FairPlay ignores this, but castLabs requires it |
| macOS | Safari | FairPlay | `'SW'` | FairPlay ignores this, but castLabs requires it |
| macOS | Chrome/Edge | Widevine | `'SW'` | Software security |
| macOS | Firefox | Widevine | `'SW'` | Software security |
| Windows | Chrome/Edge | Widevine | `'SW'` or `'HW'` | Software by default, HW if available |
| Windows | Firefox | Widevine | `'SW'` | Software security |
| Android | Chrome | Widevine | `'HW'` (recommended) | Required for output protection |
| Android | Firefox | Widevine | `'HW'` (recommended) | Required for output protection |
| Linux | Chrome/Firefox | Widevine | `'SW'` | Software security |

### EME Probe Values (for `navigator.requestMediaKeySystemAccess`)

| Platform | Browser | DRM System | EME Probe Robustness |
|----------|---------|------------|----------------------|
| iOS | Safari | FairPlay | (omit - not supported) |
| macOS | Safari | FairPlay | (omit - not supported) |
| All Others | Chrome/Edge/Firefox | Widevine/PlayReady | `'SW_SECURE_CRYPTO'` |

**Key Point:** Use EME values for the **probe** and castLabs values for the **video config**.

## Testing

After applying this fix, the following issues should be resolved:

### Issue 1: EME Robustness Warning (Windows/Desktop Browsers)
**Before:**
```
It is recommended that a robustness level be specified. Not specifying the robustness level could result in unexpected behavior.
```

**After:**
- ✅ No EME robustness warning
- ✅ EME probe passes with `SW_SECURE_CRYPTO` for Widevine/PlayReady
- ✅ FairPlay probe passes without robustness parameter

### Issue 2: castLabs Library RangeError
**Before:**
```
RangeError: DRM config robustness can only be one of: SW, HW
```

**After:**
- ✅ No RangeError
- ✅ Video config uses valid castLabs values: `'SW'` or `'HW'`
- ✅ DRM playback works on all platforms

### Platform-Specific Testing

**Windows (Chrome/Edge/Firefox):**
- ✅ No EME warning
- ✅ No RangeError
- ✅ Playback with SW robustness

**macOS (Safari):**
- ✅ No EME warning
- ✅ No RangeError
- ✅ FairPlay playback

**macOS (Chrome/Edge/Firefox):**
- ✅ No EME warning
- ✅ No RangeError
- ✅ Playback with SW robustness

**Android:**
- ✅ No EME warning
- ✅ No RangeError
- ✅ Playback with HW robustness (if L1) or SW (if L3)
- ✅ Output protection works with HW robustness

## Summary

Two separate issues were fixed:

### Issue 1: EME Robustness Warning
The EME probe was using an empty string or incorrect robustness values, causing browser warnings.

**Fix:** Use EME-specific robustness values (`'SW_SECURE_CRYPTO'`, `'HW_SECURE_ALL'`) in the probe configuration, and omit robustness for FairPlay.

### Issue 2: castLabs RangeError
The video config used EME-specific robustness values, but the castLabs `rtc-drm-transform` library only accepts `'SW'` or `'HW'`.

**Fix:** Use castLabs-specific robustness values (`'SW'`, `'HW'`) in the video configuration passed to `rtcDrmConfigure()`.

### Key Takeaway

**There are two different robustness value systems:**

1. **EME Probe** → Use EME values (`'SW_SECURE_CRYPTO'`, `'HW_SECURE_ALL'`)
2. **castLabs Video Config** → Use castLabs values (`'SW'`, `'HW'`)

Mixing these values will cause errors:
- Using castLabs values in EME probe: May work but triggers warnings
- Using EME values in castLabs video config: **Causes RangeError**

Both fixes ensure proper behavior for each DRM system across all platforms.
