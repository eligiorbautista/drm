# iOS DRM Support Guide

## Overview
iOS devices (iPhone, iPad) use **FairPlay DRM** instead of Widevine (Chrome/Android) or PlayReady (Edge Windows). This guide explains how to properly support iOS devices in your DRM streaming application.

## Key Differences

| Feature | iOS/Safari (FairPlay) | Android/Desktop (Widevine) | Windows Edge (PlayReady) |
|---------|----------------------|---------------------------|-------------------------|
| **Key System** | `com.apple.fps.1_0` or `com.apple.fps` | `com.widevine.alpha` | `com.microsoft.playready` |
| **DRM Library** | FairPlay Streaming (native) | Widevine CDM | PlayReady CDM |
| **Robustness** | Not supported (ignored) | `HW` or `SW` | `SW` or `HW` |
| **Video Codec** | H264 | H264, AV1 | H264, AV1 |
| **Audio Codec** | AAC (`mp4a.40.2`) | Opus | AAC, Opus |
| **Encryption** | `cenc` (AES-CTR) or `cbcs` | `cenc`, `cbcs` | `cenc`, `cbcs` |
| **Buffer Size** | 600ms minimum | 600-1200ms | 600-1200ms |

## Implementation Details

### Platform Detection
The player now properly detects iOS devices:
```typescript
const uaHasIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
const uaHasSafari = /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent);
const isIOS = uaHasIOS || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
```

### EME Probe Configuration
iOS/Safari requires different probe configs:
```typescript
// For iOS/Safari FairPlay
const probeConfigs: MediaKeySystemConfiguration[] = [{
  initDataTypes: ['sinf', 'webm'],
  videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
  audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
}];
```

### DRM Configuration
iOS/Safari-specific DRM config:
```typescript
const video = {
  codec: 'H264',
  encryption: 'cbcs',
  robustness: undefined, // FairPlay ignores robustness
  keyId,
  iv
};

const mediaBufferMs = 600; // Minimum for smooth playback
```

## Requirements for iOS Support

### 1. HTTPS Required
DRM **requires HTTPS** to work on iOS devices. It will NOT work with HTTP:
- ✅ `https://your-domain.com`
- ❌ `http://your-domain.com`
- ⚠️ `http://localhost` - may work for testing but not production

### 2. Certificates and Keys
Your DRMtoday account must support FairPlay:
- ✅ FairPlay certificate must be configured in DRMtoday
- ✅ Key ID and IV must be properly set
- ✅ Merchant ID must have FairPlay enabled

### 3. Codecs
- **Video**: H.264 (required - iOS doesn't support AV1 in Safari)
- **Audio**: The rtc-drm-transform library handles audio automatically

### 4. Browser Compatibility
- ✅ Safari (iOS)
- ✅ Chrome (iOS)
- ✅ Firefox (iOS)
- ❌ IE/Edge Legacy (iOS) - not applicable

## Common Issues and Solutions

### Issue: "Not supported" or "EME unavailable"
**Cause**: EME (Encrypted Media Extensions) not available or blocked
**Solutions**:
- Use HTTPS (required for DRM on iOS)
- Check if FairPlay is enabled for your DRMtoday account
- Verify the iframe has `allow="encrypted-media; autoplay"` if using embedding

### Issue: Video shows but no audio
**Cause**: Audio codec mismatch or muted state
**Solutions**:
- Ensure unmute to test audio separately
- Check browser console for errors
- Volume and playbackRate must be set to 1.0

### Issue: Frame gaps/restarts
**Cause**: Buffer too small for iOS network conditions
**Solutions**:
- Current config uses 600ms buffer (documented minimum)
- If issues persist, try increasing to 900-1200ms
- Improve network/stable streaming server

### Issue: "output-restricted" error
**Cause**: External monitor connected or HDCP unavailable
**This is normal for mobile devices** and can be ignored in many cases.

## Testing on iOS

### Recommended Testing Workflow
1. **Local Testing**:
   ```bash
   # Use HTTPS server for testing
   # Example: npx serve -S -C <cert> -K <key> build
   ```

2. **Simulator**:
   - iOS Simulator may have DRM limitations
   - Use real device for accurate testing

3. **Remote Testing**:
   - Test on real iPhone/iPad with latest iOS
   - Test Safari and Chrome on iOS

### Verification Checklist
- [ ] Stream loads and plays
- [ ] Video shows correctly
- [ ] Audio can be unmuted
- [ ] No "not supported" errors
- [ ] Frame gaps minimal or none
- [ ] Works in both Safari and Chrome on iOS

## Embedding on iOS

When using iframe embedding, ensure proper permissions:
```html
<iframe 
  src="/embed?endpoint=..." 
  allow="encrypted-media; autoplay; fullscreen"
  allowfullscreen
></iframe>
```

### iOS-Specific Meta Tags
The `index.html` now includes:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="format-detection" content="telephone=no">
```

## Configuration Notes

### FairPlay Specific Settings (Optional)
The rtc-drm-transform library handles most FairPlay configuration automatically, but you can customize:

```typescript
const drmConfig = {
  // ... other config
  // Optional: Custom FairPlay certificate URL
  fpsCertificateUrl: 'https://your-server.com/fps/cert',
  
  // Optional: Custom FairPlay license URL
  fpsLicenseUrl: 'https://your-server.com/fps/lic',
};
```

## References
- [FairPlay Streaming Documentation](https://developer.apple.com/streaming/fps/)
- [castLabs DRM SDK Documentation](https://castlabs.com/drm-solutions/client-drm/)
- [client-integration-guide.md](./client-integration-guide.md)
- [client-sdk-changelog.md](./client-sdk-changelog.md)

## Summary
The iOS support has been implemented with:
- ✅ Proper FairPlay key system detection
- ✅ iOS/Safari platform detection
- ✅ Appropriate buffer sizes (600ms)
- ✅ Robustness handling (FairPlay ignores it)
- ✅ EME probe for FairPlay
- ✅ iOS-specific meta tags

**Most Common Issues**:
1. **Not using HTTPS** - Most critical requirement
2. **FairPlay not configured** - Check DRMtoday settings
3. **Permission issues** - Verify iframe permissions
4. **Network issues** - Try on different network/more stable connection
