# DRM Decryption Fix for Embed Page

## Problem

When viewing the embed page (`/embed`), the encrypted video stream was showing but NOT being decrypted by DRM. The video appeared encrypted/green, indicating DRM was not processing the stream.

## Root Cause

The embed page was relying on the `useEncryption()` hook, which fetches the encryption setting from the backend. However:

1. **Authentication Required**: `useEncryption()` requires the user to be authenticated to fetch settings from the backend
2. **Embed Context**: When embedded in an iframe on a different domain, the user is NOT authenticated
3. **Default State**: Without authentication, `encrypted` was likely `undefined` or `false`, causing DRM to not initialize

The original ViewerPage code:
```typescript
const { enabled: encryptedFromSettings, loading: encryptionLoading, error: encryptionError } = useEncryption();

// In embed mode, render just the player without wrapper for full viewport
if (isEmbedMode) {
  return (
    <Player
      endpoint={whepEndpoint}
      merchant={merchant}
      userId="elidev-test"
      encrypted={encryptedFromSettings}  // ← Relies on backend setting
      isEmbedMode={isEmbedMode}
    />
  );
}
```

## Solution

Implemented URL query parameter support for the embed page, allowing the parent page to specify whether the stream is encrypted.

### 1. Modified EmbedPage.tsx

**Before:**
```typescript
export function EmbedPage() {
  return <ViewerPage isEmbedMode={true} />;
}
```

**After:**
```typescript
export function EmbedPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  // Parse encrypted parameter from URL query string
  // Defaults to true if the parameter is not specified (for compatibility)
  const encryptedParam = searchParams.get('encrypted');
  const encrypted = encryptedParam === 'true' || encryptedParam === null;

  console.log('[EmbedPage] encrypted from query param:', encrypted, 'raw param:', encryptedParam);

  return <ViewerPage isEmbedMode={true} encrypted={encrypted} />;
}
```

**Behavior:**
- `/embed` → `encrypted=true` (default)
- `/embed?encrypted=true` → `encrypted=true`
- `/embed?encrypted=false` → `encrypted=false`

### 2. Modified ViewerPage.tsx

Added support for an explicit `encrypted` override parameter:

```typescript
interface ViewerPageProps {
  isEmbedMode?: boolean;
  encrypted?: boolean;  // Optional override for embed mode
}

export function ViewerPage({ isEmbedMode, encrypted: encryptedOverride }: ViewerPageProps = {}) {
  // In non-embed mode, use encryption from settings
  // In embed mode with encryptedOverride, use the override value
  // In embed mode without override, use encryption from settings
  const { enabled: encryptedFromSettings, loading: encryptionLoading, error: encryptionError } = useEncryption();

  // Determine final encrypted value
  // If in embed mode with explicit override, use it
  // Otherwise, use the setting from backend
  const encrypted = (isEmbedMode && encryptedOverride !== undefined)
    ? encryptedOverride
    : encryptedFromSettings;

  // ...
}
```

**Logic:**
- Non-embed mode: Use backend setting (encryptedFromSettings)
- Embed mode with override: Use the override value
- Embed mode without override: Use backend setting (fallback)

### 3. Enabled Debug Logging in Embed Mode

Temporarily enabled console logging in embed mode to help debug DRM issues:

```typescript
// TEMPORARILY ENABLED FOR DEBUGGING DRM DECRYPTION ISSUES
const logDebug = isEmbedMode ? (...args: any[]) => console.log('[Player Debug]', ...args) : /* ... */;
const logError = isEmbedMode ? (...args: any[]) => console.error('[Player Error]', ...args) : /* ... */;
const logWarning = isEmbedMode ? (...args: any[]) => console.warn('[Player Warning]', ...args) : /* ... */;
```

This allows developers to see DRM-related logs in the browser console when debugging embed issues.

### 4. Added Enhanced Logging

Added additional logging to help with debugging:

**In configureDrm:**
```typescript
console.log('[Player] configureDrm called with encrypted:', encrypted);

if (encrypted) {
  logDebug('DRM Encrypted Playback Mode ENABLED');
  // ...
} else {
  logWarning('DRM Encrypted Playback Mode DISABLED - Playing unencrypted stream');
  console.warn('[DRM] Stream will NOT be decrypted. If you see encrypted video, check the encrypted flag in ViewerPage or EmbedPage.');
}
```

**In useWhep:**
```typescript
console.log('[useWhep] encrypted:', encrypted, 'configureDrm:', !!configureDrm);
if (encrypted && configureDrm) {
  console.log('[useWhep] Calling configureDrm...');
  await configureDrm(pc);
  console.log('[useWhep] configureDrm completed');
} else {
  console.log('[useWhep] DRM NOT CONFIGURED - Stream will play unencrypted');
}
```

## Usage

### Embedding an Encrypted Stream

```html
<iframe 
  src="/embed?encrypted=true"
  allow="encrypted-media; autoplay"
  style="width: 100%; height: 100%; border: none;"
></iframe>
```

### Embedding an Unencrypted Stream

```html
<iframe 
  src="/embed?encrypted=false"
  allow="encrypted-media; autoplay"
  style="width: 100%; height: 100%; border: none;"
></iframe>
```

### Default Behavior

```html
<iframe 
  src="/embed"
  allow="encrypted-media; autoplay"
  style="width: 100%; height: 100%; border: none;"
></iframe>
```
This defaults to `encrypted=true`.

## Debugging

When experiencing DRM decryption issues in embed mode:

1. **Open browser console** (F12 or Cmd+Option+I)
2. **Look for these key log messages:**

```
[EmbedPage] encrypted from query param: true/false
[ViewerPage] Config: { encrypted: true/false, ... }
[Player] configureDrm called with encrypted: true/false
[useWhep] encrypted: true/false, configureDrm: true/false
[Player] DRM Encrypted Playback Mode ENABLED
[Player Debug] Detected platform: Windows/Android/etc
[Player Debug] Setting DRM type to Widevine for Windows
[Player Debug] rtcDrmConfigure succeeded - License request sent to DRMtoday
[Player Debug] Track received: video
[Player Debug] rtcDrmOnTrack succeeded for video - Stream is being DECRYPTED
```

3. **Common Issues:**

| Symptom | Cause | Solution |
|---------|-------|----------|
| Encrypted/green video | DRM not configured | Add `?encrypted=true` to URL |
| Console: "DRM Encrypted Playback Mode DISABLED" | encrypted flag is false | Use `?encrypted=true` in URL |
| Console: "No supported DRM key system found" | Missing iframe permissions | Add `allow="encrypted-media; autoplay"` |
| Console: "EME blocked" | Permissions policy blocked | Parent page must include `allow="encrypted-media"` |

## Authentication vs Query Parameter

| Approach | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Backend Setting** | authenticated users (Viewer page) | Dynamic, configurable per user | Requires authentication |
| **Query Parameter** | iframe embedding | No auth required, explicitly controlled | Must be managed by parent page |
| **URL Parameter** | embed page | Direct control over encryption state | Less secure (visible in URL) |

## Migration Notes

- Existing embeds without the `encrypted` parameter will continue to work (defaults to `true`)
- To explicitly disable DRM for an embed, use `?encrypted=false`
- Regular viewer page (non-embed) continues to use backend settings

## Future Improvements

1. **Add Token-based Authorization**: Include a JWT token in URL for authenticated embedded playback
2. **Backend Configuration**: Allow embed URLs to fetch encrypted state from backend using a token
3. **CORS Headers**: Ensure proper CORS configuration for cross-origin embeds
4. **Analytics**: Track embed usage and encrypted/unencrypted playback stats

## Summary

The embed page now supports explicit control over DRM encryption through URL query parameters, eliminating the dependency on authentication and backend settings for embedded use cases. This provides reliable DRM decryption for iframe-embedded players while maintaining flexibility for both encrypted and unencrypted streams.
