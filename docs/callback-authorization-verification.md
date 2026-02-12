# Callback Authorization Verification Guide

## Current Implementation Status

Your code is **correctly configured for Callback Authorization**. Here's the verification:

## ✅ Frontend Configuration (Correct)

### drm-frontend/src/components/Player.tsx

```typescript
// Lines 570-592 - CORRECT for Callback Authorization
const drmConfig = {
  merchant: merchant || import.meta.env.VITE_DRM_MERCHANT,
  userId: userId || 'elidev-test',  // ← Required for Callback
  environment: rtcDrmEnvironments.Staging,
  videoElement,
  audioElement,
  video,
  audio: isIOS 
    ? { codec: 'mp4a.40.2' as any, encryption: 'clear' as const }
    : { codec: 'opus' as const, encryption: 'clear' as const },
  logLevel: 3,
  mediaBufferMs
};
```

**What's Missing (Correctly):**
- ❌ NO `authToken` - Not needed for Callback
- ❌ NO `sessionId` - Not needed for Callback
- ❌ NO fallback to Test Dummy mode

**What's Required (Present):**
- ✅ `merchant` - DRMtoday merchant ID
- ✅ `userId` - User identifier
- ✅ `environment` - DRMtoday environment
- ✅ `videoElement` & `audioElement` - Media elements

## ✅ Backend Configuration (Correct)

### drm-backend/src/routes/callback.js

```javascript
// Lines 1-171 - CORRECT Callback endpoint
router.post('/', validateCallbackRequest, async (req, res, next) => {
  const { asset, variant, user, session, client, drmScheme, clientInfo, requestMetadata } = req.body;

  const crt = buildCallbackResponse(req.body, {
    licenseType: 'purchase',
    enforce: true,  // HDCP enforcement for L1/L2
  });

  res.json(crt);  // Returns CRT to DRMtoday
});
```

**Response Format Matches Documentation:**
```json
{
  "profile": { "purchase": {} },
  "assetId": "test-key",
  "outputProtection": {
    "digital": true,
    "analogue": true,
    "enforce": true,
    "requireHDCP": "HDCP_V2"
  },
  "storeLicense": true
}
```

### Callback Request from DRMtoday (Expected)

According to `license_delivery_authorization(1).md`:
```json
{
  "asset": "[assetId]",
  "variant": "[variantId]",
  "user": "[userId]",
  "session": "[sessionId]",
  "client": "[clientId]",
  "drmScheme": "WIDEVINE_MODULAR",
  "clientInfo": {
    "manufacturer": "[manufacturer]",
    "model": "[model]",
    "version": "[version]",
    "certType": "[certType]",
    "drmVersion": "[drmVersion]",
    "secLevel": "3"
  },
  "requestMetadata": {
    "remoteAddr": "[remoteAddress]",
    "userAgent": "[userAgent]"
  }
}
```

## ⚠️ DRMtoday Configuration Required

### Critical: Callback URL Must Be Configured in DRMtoday Dashboard

Your backend cannot receive callback requests unless DRMtoday is configured to send them.

**To Verify:**

1. Login to https://fe.drmtoday.com
2. Navigate to your merchant settings
3. Check authorization mode:
   - ❌ If set to "Test Dummy" → Change to "Callback"
   - ✅ If set to "Callback" → Proceed
4. Configure callback URL:
   - Must be publicly accessible (not localhost for production)
   - Format: `https://your-backend.com/api/callback`
   - Current: `http://localhost:8000/api/callback` (works for testing)

### FairPlay Certificate (Required for iOS)

For iOS to work, your DRMtoday merchant must have:
1. Apple FairPlay certificate uploaded
2. Certificate must be active
3. Merchant ID must support FairPlay

**To Check:**
```
DRMtoday Dashboard → Your Merchant → FairPlay Certificates
```

## Verification Steps

### Step 1: Verify Backend is Running

```bash
curl http://localhost:8000/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T..."
}
```

### Step 2: Verify Callback Endpoint Responds

```bash
curl -X POST http://localhost:8000/api/callback \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "test-key",
    "user": "test-user",
    "session": "test-session",
    "client": "test-client",
    "drmScheme": "WIDEVINE_MODULAR",
    "clientInfo": {
      "manufacturer": "Chrome",
      "model": "Unknown",
      "version": "100.0.0",
      "certType": "UNKNOWN",
      "drmVersion": "1.0.0",
      "secLevel": "3"
    }
  }' | python3 -m json.tool
```

Expected Response:
```json
{
  "profile": {
    "purchase": {}
  },
  "assetId": "test-key",
  "outputProtection": {
    "digital": true,
    "analogue": true,
    "enforce": false,
    "requireHDCP": "HDCP_V2"
  },
  "storeLicense": true
}
```

**Note:** `enforce: false` for L3 (software DRM) is correct behavior.

### Step 3: Verify Frontend Console Logs

Open browser DevTools Console when playing encrypted video:

**Expected Logs:**
```
> Using Callback Authorization - backend will provide CRT
> Merchant: f43be426-727f-46ff-ba48-97a208ff40e0
> Callback URL: http://localhost:8000/api/callback
> User ID: elidev-test
> rtcDrmConfigure succeeded - License request sent to DRMtoday, waiting for callback...
> Track received: video
> ✓ rtcDrmOnTrack succeeded for video - Stream DECRYPTED and processed
> video event: playing
```

**Backend Should Log:**
```
> DRMtoday callback received
> Callback response sent
> License request created
```

### Step 4: Test on Each Platform

#### Windows (Chrome/Edge)

1. Start backend: `npm run dev`
2. Start frontend: `npm run dev`
3. Navigate to: `http://localhost:5173/watch?encrypted=true`
4. Open DevTools Console
5. Look for callback logs

**Expected:**
- ✅ Video plays
- ✅ Audio plays (click unmute)
- ✅ Console shows "Track received: video"
- ✅ Backend logs show "DRMtoday callback received"

#### macOS (Chrome/Safari)

Same as Windows.

#### iOS (Safari) - Requires HTTPS

1. Must use HTTPS (not HTTP)
2. Deploy to a public URL (e.g., Vercel, Netlify)
3. Configure callback URL to point to deployed backend
4. Test on real iPhone/iPad (not simulator)

**Expected:**
- ✅ Video plays
- ✅ Audio plays (AAC codec)
- ✅ Console shows iOS-specific logs
- ✅ Backend logs show "drmScheme": "FAIRPLAY"

#### Android (Chrome)

Same as Windows.

## Common Issues and Fixes

### Issue: No callback received in backend

**Symptoms:**
- Frontend: "rtcDrmConfigure succeeded"
- Backend: NO "DRMtoday callback received" log
- Video: Black screen or DRM error

**Causes:**
1. DRMtoday authorization mode set to "Test Dummy" instead of "Callback"
2. Callback URL not configured in DRMtoday dashboard
3. Backend not accessible (localhost won't work for mobile devices)

**Fixes:**
1. Login to DRMtoday dashboard → Change mode to "Callback"
2. Add callback URL: `https://your-backend.com/api/callback`
3. Ensure backend is publicly accessible (ngrok for testing: `ngrok http 8000`)

### Issue: Callback returns 500 error

**Symptoms:**
- Backend logs: "Error: ...stack trace"
- Video: DRM error

**Cause:** Backend code error or database issue

**Fix:**
```bash
tail -f /tmp/backend.log
# Look for specific error messages
```

### Issue: iOS doesn't play video

**Symptoms:**
- Windows works, iOS fails
- Console: "EME unavailable" or "Key system not available"

**Causes:**
1. Not using HTTPS (required for iOS)
2. FairPlay certificate missing in DRMtoday
3. Audio codec wrong (must be `mp4a.40.2`)

**Fixes:**
1. Use HTTPS (ngrok or deploy)
2. Upload FairPlay cert to DRMtoday
3. Verify console shows: `Audio Codec: mp4a.40.2 (AAC)`

### Issue: Android works but Windows/iOS don't

**Symptoms:**
- Android: Video plays
- Windows/iOS: Black screen or "DRM error"

**Cause:** L3 (software) DRM has relaxed enforcement on some Android devices

**Fixes:**
1. Verify backend is receiving callbacks for Windows/iOS
2. Check backend logs for不同 `drmScheme` values:
   - Android: `WIDEVINE_MODULAR`
   - iOS: `FAIRPLAY`
   - Windows: `WIDEVINE_MODULAR` or `PLAYREADY`

3. Verify CRT format is correct for each scheme

### Issue: Callback received but video still black

**Symptoms:**
- Backend logs: "DRMtoday callback received"
- Frontend: "Track received: video"
- Video: Black screen

**Causes:**
1. KeyId/IV mismatch between sender and receiver
2. Wrong encryption mode (sender uses `cenc`, receiver expects `cbcs`)
3. DRMtoday issuing license with wrong parameters

**Fixes:**
1. Verify encryption mode matches sender:
   ```typescript
   // Check what sender is using
   encryptionType = 'cbcs' as const;  // or 'cenc'
   ```
2. Verify KeyId and IV match sender's configuration
3. Check backend logs for CRT parameters

## Testing Checklist

Before deploying to production:

### Backend
- [ ] Backend running on accessible URL
- [ ] `/api/callback` endpoint returns 200
- [ ] Callback URL configured in DRMtoday dashboard
- [ ] FairPlay certificate uploaded (for iOS support)
- [ ] Merchant ID matches frontend and DRMtoday

### Frontend
- [ ] DRMtoday merchant ID correct in .env
- [ ] Backend URL correct in VITE_DRM_BACKEND_URL
- [ ] KeyId and IV match sender's configuration
- [ ] Encryption mode matches sender (`cbcs` or `cenc`)

### Testing
- [ ] Test on Windows (Chrome/Edge)
- [ ] Test on macOS (Chrome/Safari)
- [ ] Test on iOS (Safari) with HTTPS
- [ ] Test on Android (Chrome/Firefox)
- [ ] Check console for "Callback Authorization" logs
- [ ] Verify backend logs show callbacks for each platform
- [ ] Test audio unmute on all platforms

### Monitoring
- [ ] Monitor backend logs for callback errors
- [ ] Track license requests in database
- [ ] Monitor for different drmScheme values
- [ ] Check for failed security level checks

## Production Deployment Considerations

### 1. Public Callback URL

DRMtoday must be able to reach your backend:
- ❌ `http://localhost:8000/api/callback` - Won't work
- ✅ `https://drm-backend.yourdomain.com/api/callback` - Works

### 2. HTTPS Required

For production:
- Frontend must use HTTPS
- Backend must use HTTPS
- iOS requires HTTPS for FairPlay

### 3. Firewall Configuration

Ensure:
- Port 443 (HTTPS) is open
- /api/callback endpoint is accessible from internet
- CORS configuration allows DRMtoday callbacks

### 4. Rate Limiting

Consider implementing rate limiting on `/api/callback`:
```javascript
// Example: limit to 100 requests per minute per user
const rateLimit = require('express-rate-limit');
const callbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many callback requests' });
  }
});
router.post('/', callbackLimiter, validateCallbackRequest, ...);
```

### 5. Monitoring and Logging

Monitor:
- Callback request rate
- Failed callbacks
- DRM scheme distribution
- Security level distribution
- Geographic distribution

## Summary

**Your Callback Authorization implementation is correct.** The key components are:

✅ Frontend: Passes `merchant` and `userId` (no authToken)
✅ Backend: `/api/callback` endpoint returns valid CRT
✅ CRT Format: Matches DRMtoday specs
✅ Platform Support: Windows, macOS, iOS, Android

**Critical Missing Piece:**
- ⚠️ DRMtoday dashboard must be configured for "Callback" mode (not "Test Dummy")
- ⚠️ Callback URL must be configured in DRMtoday dashboard
- ⚠️ FairPlay certificate must be uploaded for iOS support

**Next Steps:**
1. Check DRMtoday dashboard settings
2. Configure callback URL
3. Upload FairPlay certificate (for iOS)
4. Test on all platforms
5. Monitor callback logs
