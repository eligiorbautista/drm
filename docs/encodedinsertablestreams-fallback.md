# encodedInsertableStreams Error Fix

## Problem

Some devices were encountering the error:
```
Connection error: Unsupported keySystem or supportedConfigurations
```

## Root Cause

The error occurs when the browser/device does not support the `encodedInsertableStreams` API feature. This feature is required for DRM (encrypted) streaming but is not supported on all platforms.

### What is `encodedInsertableStreams`?

`encodedInsertableStreams` is a WebRTC API that allows:
1. Direct manipulation of encoded video/audio frames
2. Injection of DRM encryption/decryption logic
3. Integration with Encrypted Media Extensions (EME)

### Browser Support

| Platform | Support Level | Notes |
|----------|--------------|-------|
| Chrome Desktop | ✅ Full support | |
| Android Chrome | ✅ Full support | Widevine L1/L3 |
| iOS Safari | ❌ Limited support | FairPlay handles DRM differently |
| macOS Safari | ✅ Partial support | FairPlay + Widevine |
| Firefox Desktop | ⚠️ Experimental | May require configuration |
| Edge Desktop | ✅ Full support | Widevine/PlayReady |
| Older browsers | ❌ Not supported | Fallback needed |

## Solution Implemented

### 1. **Graceful Fallback**
Added try-catch handling around `RTCPeerConnection` creation:

```typescript
let pc: RTCPeerConnection;

try {
  // Try with encodedInsertableStreams (for DRM)
  pc = new RTCPeerConnection({
    encodedInsertableStreams: encrypted,
    // ... other options
  });
} catch (error) {
  // Fallback to standard WebRTC without encodedInsertableStreams
  console.warn('encodedInsertableStreams not supported, falling back...');
  pc = new RTCPeerConnection({
    // ... standard options
  });
}
```

### 2. **Platform Detection Logging**
Added detailed platform logging to help identify problematic devices:

```
Platform: iOS/Android/Windows/Other
iOS: true/false
Android: true/false
Safari: true/false
Encoded Insertable Streams supported: true/false
```

### 3. **Enhanced Error Messages**
Better error messages to help users understand the issue:

| Original Error | New Error Message |
|---------------|------------------|
| `Unsupported keySystem or supportedConfigurations` | `DRM not supported on this device. Try with encryption disabled or use a different browser/device.` |
| `encrypted-media` related errors | `DRM initialization failed. Ensure you are using HTTPS and try again.` |
| `AbortError` | `Connection timed out. Check your network connection.` |

## Behavior Changes

### Before Fix
- ❌ Devices without `encodedInsertableStreams` support would fail completely
- ❌ Hard error: "Connection error: Unsupported keySystem..."
- ❌ No fallback mechanism

### After Fix
- ✅ Graceful fallback to standard WebRTC
- ✅ Clear warning message when DRM can't be used
- ✅ Playback still possible (without DRM) on unsupported devices
- ✅ Detailed platform logging for debugging

## Known Limitations

### Devices Without `encodedInsertableStreams` Support

When `encodedInsertableStreams` is not supported:

1. **DRM Won't Work**
   - Encrypted streams cannot be decoded
   - Must use `encrypted=false` parameter
   - Content will be delivered unencrypted

2. **Which Devices Are Affected**
   - Older mobile devices (pre-2019)
   - Some desktop browsers with security restrictions
   - Incognito/Private browsing modes
   - Corporate devices with restrictive policies

### Recommendations

1. **Provide Non-DRM Option**
   ```
   https://your-domain.com/embed?encrypted=false
   ```

2. **Browser Compatibility Check**
   - Include platform detection on the page
   - Show appropriate message/device recommendation

3. **User Guidance**
   ```
   ⚠️ DRM requires encodedInsertableStreams support
   Your device doesn't support this feature.
   
   Options:
   - Try with encryption disabled: ?encrypted=false
   - Use Chrome Desktop or Edge DRM-enabled browsers
   - Upgrade to a browser with Widevine/FairPlay support
   ```

## Debugging

### Check Console Logs

When errors occur, look for:

```
[WHEP connect] Platform info: { userAgent: "...", platform: "...", ... }
Platform: iOS, iOS: true, Android: false, Safari: true
Encoded Insertable Streams supported: false
⚠️ DRM requires encodedInsertableStreams which is not supported on this device.
```

### Verify Support

Check if `encodedInsertableStreams` is supported:

```javascript
const isSupported = 'RTCRtpScriptTransform' in window || 'RTCEncodedVideoFrame' in window;
console.log('Encoded Insertable Streams supported:', isSupported);
```

## Testing

### Test Plan

1. **Test on iOS Safari**
   - Should work with FairPlay DRM
   - Check console for `"iOS detected - will ONLY try FairPlay"`

2. **Test on Android Chrome**
   - Should work with Widevine DRM
   - Check console for `"Android detected - will try Widevine"`

3. **Test on Unsupported Devices**
   - Should show clear error message
   - Fallback to unencrypted mode with `?encrypted=false`
   - Check console for encodedInsertableStreams support status

### Success Criteria

- ✅ No hard failures on unsupported devices
- ✅ Clear error messages
- ✅ Graceful fallback to unencrypted mode
- ✅ Detailed logging for troubleshooting
- ✅ Platform-aware DRM selection

## Related Files

- `/drm-frontend/src/hooks/useWhep.ts` - Viewer connection
- `/drm-frontend/src/hooks/useWhip.ts` - Broadcaster connection
- `/drm-frontend/src/components/Player.tsx` - DRM configuration

## References

- [WebRTC Encoded Transform API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor)
- [Encoded Insertable Streams Support](https://bugs.chromium.org/p/chromium/issues/detail?id=678581)
- [DRMtoday FairPlay Support](https://developer.apple.com/streaming/fps/)
