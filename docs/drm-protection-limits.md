# DRM Screen Capture Protection - Important Limitations

## Overview

This document explains the limitations of DRM-based screen capture protection and why preventing screenshots and recordings is **not possible on most systems**.

## The Reality of DRM Screen Capture Protection

### What DRM CAN Protect

| Protection Mechanism | What It Does | Limitations |
|---------------------|--------------|-------------|
| **Content Decryption** | Decrypts encrypted video streams | Does not prevent what happens after decryption |
| **HDCP (High-bandwidth Digital Content Protection)** | Encrypts the output signal from GPU to display | Only works on HDCP-compliant displays; ineffective on laptops/integrated displays |
| **Output Protection Flags** | Tell the device not to capture the output | Can be ignored by software on many platforms |
| **Hardware Security Level (L1/L2/L3)** | Determines where decryption happens | Only L1/L2 use hardware; L3 is purely software |

### What DRM CANNOT Protect

DRM **cannot** prevent:
- Operating System-level screen capture APIs (Snipping Tool, OBS, etc.)
- Browser extensions that capture canvas/video elements
- Virtual machine/emulator screen recording
- Camera recording of the screen (analog hole)
- Most software-based screen recording tools

## Why Screen Recording Was Possible on Your Desktop Systems

### Root Cause

Your system was using **Widevine L3 (Software DRM)** which provides only:

✅ **Content Decryption** - Successfully decrypts the video stream
❌ **Screen Capture Protection** - Cannot prevent screenshots or recordings

The code had `robustness = 'SW'` hardcoded for all non-Android platforms:
```typescript
const robustness: 'HW' | 'SW' = isAndroid ? androidRobustness : 'SW';
```

### SW vs HW DRM

| Drm Level | Decryption Location | Screen Capture Protection |
|-----------|-------------------|---------------------------|
| **L1 (HW)** | Hardware TEE (Trusted Execution Environment) | ✅ HDCP can block SOME captures on supported systems |
| **L2 (HW)** | Hardware (video decoder) | ⚠️ Limited protection via HDCP |
| **L3 (SW)** | Software (JavaScript/C++) | ❌ NO protection against screen capture |

## Changes Made

### 1. Hardware DRM Detection on Desktop Platforms

**File:** `drm-frontend/src/hooks/useDrm.ts`

Added detection for hardware DRM capabilities on Windows and macOS:

```typescript
// Windows Edge: Try PlayReady SL3000 (HW)
// Windows Chrome: Try Widevine L1 (HW_SECURE_ALL)
// macOS Chrome: Try Widevine L1 (HW_SECURE_ALL)
```

**Note:** Most desktop PCs don't have Widevine L1 hardware. Chrome on Windows/macOS typically uses L3 (SW).

### 2. Dynamic HDCP Requirements

**Files:** 
- `drm-backend/src/services/crtService.js`
- `drm-backend/src/routes/callback.js`

Updated the CRT to request appropriate HDCP based on security level:

```javascript
// L1 (hardware): HDCP_V2 (best protection)
// L2 (partial hardware): HDCP_V1
// L3 (software): HDCP_NONE (no enforcement)
```

## Expected Behavior After Changes

### Platforms with Hardware DRM (L1/L2)

| Platform | DRM Level | HDCP | Expected Protection |
|----------|-----------|------|---------------------|
| **Android (some devices)** | Widevine L1 | Yes | May block SOME recording tools |
| **Windows (certified devices)** | PlayReady SL3000 | Yes | May block SOME recording tools |

### Platforms with Software DRM (L3)

| Platform | DRM Level | HDCP | Expected Protection |
|----------|-----------|------|---------------------|
| **Windows (most PCs)** | Widevine L3 | No | ❌ Screenshots & recording still possible |
| **macOS (Chrome)** | Widevine L3 | No | ❌ Screenshots & recording still possible |
| **Linux** | Widevine L3 | No | ❌ Screenshots & recording still possible |
| **Firefox** | Widevine L3 | No | ❌ Screenshots & recording still possible |

## Why Linux Appeared to "Work"

Linux was never blocking screenshots either. The confusion likely arose because:

1. **Video Decrypts Successfully** - SW DRM works fine for decryption
2. **No HDCP Enforcement** - Was set to `enforce: false`
3. **Same Behavior on All Desktop Platforms** - All use L3 (SW) DRM

## Testing Your DRM Protection

### Check Security Level

Open the browser DevTools Console while playing encrypted video:

```javascript
// Check if DRM is active
navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
  initDataTypes: ['cenc'],
  videoCapabilities: [{
    contentType: 'video/mp4; codecs="avc1.42E01E"'
  }]
}]).then((access) => {
  const configuration = access.getConfiguration();
  console.log('DRM Level:', configuration.videoCapabilities?.[0]?.robustness || 'L3 (Default)');
});
```

### Expected Output

- `HW_SECURE_ALL` = L1 (Hardware)
- `HW_SECURE_DECODE` = L2 (Partial Hardware)
- `SW_SECURE_*` = L3 (Software - no screen protection)

### Test Screenshot Recording

Try these to verify protection (or lack thereof):

1. **Windows Snipping Tool** - Should still capture on L3
2. **OBS Studio** - Should still capture on L3  
3. **Chrome Extension** - Can capture video element source on L3
4. **Browser dev tools** - Screenshots video canvas on L3

## Alternative Approaches for Content Protection

Since DRM cannot reliably prevent screen capture on most devices, consider:

### 1. Watermarking
- Add invisible/visible user-specific watermarks
- Use forensic watermarking to trace leaks

### 2. Legal & Terms of Use
- Explicit policies prohibiting unauthorized recording
- User agreements with legal consequences

### 3. Detection & Deterrence
- Client-side detection tools (can be bypassed)
- Rapid content takedown procedures

### 4. Platform-Specific Apps
- Native mobile apps with more OS-level control
- Dedicated streaming devices (Apple TV, Roku, etc.)

## Important Notes

### HDCP Limitations

- **HDCP doesn't work on most laptops** - The display is internal, not external
- **HDCP bypass tools exist** - Can be worked around by determined pirates
- **HDCP only affects analog video output** - Digital streams can still be captured

### DRMtoday Configuration

The `requireHDCP` setting in your CRT:
- `HDCP_V2` - Requests HDCP 2.x protection
- `HDCP_V1` - Requests HDCP 1.x protection (older, less secure)
- `HDCP_NONE` - No HDCP enforcement

**Important:** Even with HDCP enabled, screen capture tools that work at the OS level can still record the content.

## Conclusion

**The changes made to your code will:**

1. ✅ Detect and use hardware DRM when available on Windows/macOS
2. ✅ Enable HDCP enforcement for L1/L2 devices automatically
3. ✅ Disable HDCP for L3 devices to prevent playback failures

**The changes will NOT:**

1. ❌ Prevent screenshots on most desktop PCs
2. ❌ Prevent screen recording on most desktop PCs
3. ❌ Make your content immune to capture on the majority of consumer devices

**Bottom Line:** DRM is designed to protect content during transmission and enforce playback policies. It is NOT designed to prevent screen capture on general-purpose computing devices. For that, you need platform-specific applications and additional layers of protection.
