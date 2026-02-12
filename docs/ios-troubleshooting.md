# iOS DRM Troubleshooting Guide

## Symptom: DRM says "Supported" but stream doesn't display

This guide helps diagnose why iOS shows FairPlay as available but the video/audio doesn't appear.

## Quick Diagnostic Steps

### 1. Check the Browser Console

Open Safari Web Inspector on iOS:
```
Safari (Mac) > Develop > [Your Device] > [Your Page] > Console
```

Look for these specific messages:
- `✓ Key system com.apple.fps.1_0 is available` → FairPlay detected
- `rtcDrmConfigure succeeded` → DRM initialized
- `Track received: video` → Stream track arrived
- `✓ rtcDrmOnTrack succeeded` → DRM processed the track
- `videoElement.play() resolved` → Video should be playing

### 2. Check Common iOS-Specific Issues

| Issue | Symptom | Cause | Fix |
|-------|---------|-------|-----|
| **Audio Codec Mismatch** | Video shows, no audio | Opus codec used instead of AAC | Ensure `audio: { codec: 'mp4a.40.2' }` |
| **Wrong initDataTypes** | "Not supported" error | Missing 'sinf' in initDataTypes | Add `'sinf'` to initDataTypes array |
| **Encrypted Media Not Allowed** | "EME unavailable" | Missing HTTPS or permissions | Ensure HTTPS and proper permissions |
| **FairPlay Certificate Missing** | License request fails | DRM今天 account not configured | Add FairPlay cert in DRMtoday |
| **Stream Not Assigned to Element** | Tracks received but no display | DRM library doesn't assign srcObject | Check rtcDrmOnTrack implementation |

## Root Cause Analysis

### Issue #1: Audio Codec Mismatch (MOST COMMON)

**What's happening:**
```
iOS FairPlay requires: AAC (mp4a.40.2)
Your code might send: Opus
→ DRM library rejects the track → No audio, sometimes no video
```

**How to verify:**
```javascript
// Check audio codec in console log
logDebug(`Audio Codec: ${drmConfig.audio.codec}`)
// Should be: "mp4a.40.2" for iOS
// Should be: "opus" for non-iOS
```

**How it's configured:**
Your `Player.tsx` already handles this correctly:
```typescript
audio: isIOS 
  ? { codec: 'mp4a.40.2' as any, encryption: 'clear' as const }
  : { codec: 'opus' as const, encryption: 'clear' as const }
```

### Issue #2: FairPlay initDataTypes

**iOS FairPlay requires specific initDataTypes:**
```typescript
initDataTypes: ['sinf', 'webm', 'cenc', 'cbcs']
```

- `'sinf'` - **Critical for FairPlay** (contains initialization data)
- `'webm'` - FairPlay sometimes uses webm containers
- `'cenc'` / `'cbcs'` - Encryption schemes

**Current configuration (in `checkEmeAvailability`):**
```typescript
if (isIOS) {
  probeConfigs = [{
    initDataTypes: ['cenc', 'cbcs', 'sinf', 'webm'],  // ✅ Correct
    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
  }];
}
```

### Issue #3: HTTPS Requirement

**FairPlay on iOS REQUIRES HTTPS:**
- ❌ `http://localhost` - May work for testing but not reliable
- ❌ `http://domain.com` - Will NOT work
- ✅ `https://domain.com` - Required

**Even for development:**
```bash
# Use ngrok or similar to get HTTPS
ngrok http 3000  # Gives you https://xxxxxxxx.ngrok.io
```

### Issue #4: FairPlay Certificate in DRMtoday

**Your DRMtoday account must have FairPlay configured:**
1. Log into DRMtoday dashboard (fe.drmtoday.com)
2. Navigate to FairPlay certificates
3. Upload your Apple FairPlay certificate
4. Ensure it's active for your merchant ID

**Without this, you'll get:**
- License request fails
- `403` or `401` errors
- "Certificate not found" messages

### Issue #5: Stream Assignment

**The rtc-drm-transform library should automatically:**
1. Decrypt the incoming WebRTC track
2. Wrap it in fmp4 format
3. Assign to MSE (Media Source Extensions)
4. Not manually set `videoElement.srcObject`

**iOS expects MSE playback, not direct WebRTC assignment.**

## Debugging Your Specific Issue

### Step-by-Step Diagnosis

#### 1. Check EME Availability

```
Expected log:
> iOS detected - will ONLY try FairPlay key systems
> Trying key system: com.apple.fps.1_0
> ✓ Key system com.apple.fps.1_0 is available
```

**If you see "Not supported":**
→ FairPlay not detected (HTTPS issue or browser issue)

#### 2. Check DRM Configuration

```
Expected log:
> Initialize DRM configuration with IV: [hex]
> KeyId: [hex]
> ✓ FairPlay on iOS: IV is REQUIRED and will be used for decryption
> ✓ FairPlay on iOS: Using cbcs encryption scheme
```

**If you see errors here:**
→ Invalid KeyId/IV length or format

#### 3. Check rtcDrmConfigure Success

```
Expected log:
> Calling rtcDrmConfigure with: {
    platform: 'iOS',
    audioCodec: 'mp4a.40.2',
    videoCodec: 'H264',
    encryption: 'cbcs',
    robustness: undefined
  }
> rtcDrmConfigure succeeded - License request sent to DRMtoday, waiting for callback...
```

**If this fails:**
→ License request failed (check backend logs for DRMtoday callback)

#### 4. Check Track Reception

```
Expected log:
> Track received: video, enabled=true, readyState=live
> [iOS DRM] Track received: { kind: 'video', enabled: true, ... }
> ✓ rtcDrmOnTrack succeeded for video - Stream DECRYPTED and processed
```

**If you don't see tracks:**
→ WebRTC connection issue, not DRM issue

#### 5. Check MSE Assignment (iOS-only)

```
Expected console output:
> [iOS DRM] After rtcDrmOnTrack: {
    videoStream: false,  // ← MSE doesn't assign srcObject
    videoTracks: 0,
    audioStream: false,
    audioTracks: 0,
    videoPlaying: true,  // ← Should be true
    audioPlaying: true   // ← Should be true
  }
```

**Note:** On iOS with MSE, `videoElement.srcObject` is `null`. The library uses MSE APIs instead.

#### 6. Check Video Element State

```
Expected console output:
> video element readyState: 4 (HAVE_ENOUGH_DATA)
> video event: canplay
> video event: playing
```

**Common failure states:**
- `readyState: 0` (HAVE_NOTHING) → No data
- `readyState: 1` (HAVE_METADATA) → Metadata loaded but no data
- `paused: true` → Video not playing

## Common Error Messages and Solutions

### Error: "EME unavailable"

**Cause:** EME (Encrypted Media Extensions) blocked or not available

**Solutions:**
1. Ensure you're using HTTPS
2. Check if in iframe → Add `allow="encrypted-media; autoplay"`
3. Try Safari (iOS) - other browsers may have EME issues on iOS

### Error: "output-restricted" or "output-downscaled"

**Cause:** HDCP protection requirement

**Solution:**
- Expected on iOS - can be ignored
- Video will still play but may be lower quality

### Error: "RTC DRM Error"

**Cause:** License request failed

**Check:**
1. Backend logs for DRMtoday callback errors
2. Merchant ID is correct
3. FairPlay certificate is configured in DRMtoday
4. User ID is being sent correctly

### Error: "Frame gap detected"

**Cause:** Network or buffer issues

**Solutions:**
1. Increase `mediaBufferMs` to 900-1200ms
2. Check network stability
3. Verify streaming server is sending frames consistently

## Backend Verification Checklist

### 1. Check DRMtoday Callback

Check `/tmp/backend.log` for:
```
> DRMtoday callback received
> Built callback response
> Callback response sent
```

**If you don't see this:**
→ DRMtoday is not calling your backend
→ Check merchant ID and callback URL configuration

### 2. Check CRT Response

```
Expected in logs:
> outputProtection: {
    digital: true,
    analogue: true,
    enforce: false,
    requireHDCP: 'HDCP_V2'
  }
```

### 3. Check License Request

```
Expected:
> License request created
> License request tracking complete
```

## Testing Strategy

### 1. Isolate DRM Issue

**Test with unencrypted stream first:**
```
URL: /watch?endpoint=...&encrypted=false
```

If unencrypted works:
→ DRM configuration issue
→ Key ID / IV mismatch
→ FairPlay certificate issue

If unencrypted doesn't work:
→ WHEP/WebRTC configuration issue
→ Network/staging issue

### 2. Test Across iOS Browsers

| Browser | FairPlay Support | Expected Result |
|---------|------------------|-----------------|
| Safari | ✅ Native | Should work |
| Chrome iOS | ✅ Uses Safari engine | Should work |
| Firefox iOS | ✅ Uses Safari engine | Should work |

All iOS browsers use Safari's WebKit engine, so they all support FairPlay.

### 3. Real Device Testing

**iOS Simulator may have limitations:**
- EME may not work properly in Simulator
- Always test on real iPhone/iPad
- Test on multiple iOS versions (iOS 16, 17, 18)

## Configuration Checklist

### Frontend (drm-frontend)

- [ ] HTTPS enabled
- [ ] `initDataTypes` includes `'sinf'`
- [ ] Audio codec is `'mp4a.40.2'` for iOS
- [ ] Video codec is `'H264'`
- [ ] Encryption is `'cbcs'` or `'cenc'`
- [ ] Key ID is 16 bytes (128-bit)
- [ ] IV is 16 bytes (128-bit)
- [ ] mediaBufferMs is at least 600ms
- [ ] robustness is `undefined` for iOS

### Backend (drm-backend)

- [ ] Merchant ID configured correctly
- [ ] FairPlay certificate in DRMtoday
- [ ] Callback URL is correct and accessible
- [ ] `/api/callback` endpoint working
- [ ] CRT includes outputProtection
- [ ] User ID is passed to DRMtoday

### DRMtoday Account

- [ ] FairPlay certificate uploaded
- [ ] Merchant ID matching frontend
- [ ] Certificate is active/valid
- [ ] Callback URL whitelisted (if required)

## Next Steps

### If Nothing Works:

1. **Capture full debug logs:**
   ```
   Open Console → Right-click → Save as...
   ```

2. **Check backend logs:**
   ```bash
   tail -f /tmp/backend.log | grep -i drm
   ```

3. **Verify DRMtoday configuration:**
   - Login to fe.drmtoday.com
   - Check FairPlay certificate status
   - View license request logs

4. **Contact DRMtoday support:**
   - Provide merchant ID
   - Share error messages
   - Include callback logs

### If Video Shows But No Audio:

1. Click the "Unmute" button
2. Increase volume to maximum
3. Check browser has audio permission
4. Try headphones/external speakers

### If DRM Says Supported But No Tracks Arrive:

This is NOT a DRM issue - it's a WebRTC/WHEP issue:
1. Test with `encrypted=false`
2. Check WHEP endpoint URL
3. Verify streaming server is running
4. Check network connectivity

## Summary

| Symptom | Most Likely Cause | Quick Fix |
|---------|-------------------|-----------|
| DRM not available | No HTTPS or wrong initDataTypes | Use HTTPS, add 'sinf' |
| Tracks arrive but no display | Audio codec wrong (Opus vs AAC) | Already fixed in your code |
| License request fails | FairPlay cert missing in DRMtoday | Upload cert to DRMtoday |
| Video black screen | Buffer too small | Increase mediaBufferMs to 900ms |
| No audio | Muted by default, wrong codec | Unmute, check codec is 'mp4a.40.2' |

The diagnostic logging I added will help identify exactly which step is failing on your iOS device.
