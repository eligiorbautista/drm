# Embed Page Documentation

## Overview

A new `/embed` page has been created for iframe or embedded video playback usage. This page is designed to be visually minimal and provides a full-viewport video player.

## Route

- **URL**: `/embed?encrypted=true` (or `encrypted=false`)
- The `encrypted` query parameter is optional but can be used to indicate the desired encryption state

## Features

### 1. Chrome-Free Design
- No headers, navigation bars, footers, or other UI elements
- Minimal visual design suitable for iframe embedding
- Clean look focused solely on video playback

### 2. Full Viewport Layout
- Video player occupies the entire viewport (full-screen)
- Responsive to window resize
- Uses fixed positioning with `inset: 0` for full coverage

### 3. Autoplay and Muted
- Configures player to autoplay on load
- Starts muted to comply with browser autoplay policies
- Muted state is initialized as `true` by default for both normal and embed modes

### 4. DRM Implementation
- Reuses the existing viewer page implementation
- No new DRM logic introduced
- Identical playback behavior and protection logic as the viewer page
- Supports encrypted media playback with the same DRM pipeline

## Implementation

### Files Created/Modified

1. **Created**: `/drm-frontend/src/pages/EmbedPage.tsx`
   - Simple wrapper component that renders ViewerPage in embed mode
   - No wrapper divs or additional UI elements

2. **Modified**: `/drm-frontend/src/App.tsx`
   - Added import for `EmbedPage`
   - Added route handler for `/embed` path before other routes
   - Embed page renders with AuthProvider and EncryptionProvider

3. **Modified**: `/drm-frontend/src/pages/ViewerPage.tsx`
   - Updated to render without wrapper div when `isEmbedMode={true}`
   - Ensures player can occupy full viewport in embed mode

### Technical Details

#### Embed Mode Behavior

When `isEmbedMode={true}` is set:

1. **Player Component** (`src/components/Player.tsx`):
   - Starts muted: `isMuted` state initialized to `true`
   - Auto-connects and enters fullscreen mode
   - Debug logs are disabled for security and clean output
   - Player container uses fixed positioning for full viewport

2. **ViewerPage Component** (`src/pages/ViewerPage.tsx`):
   - Returns only the `Player` component without wrapper div
   - Settings panels are completely hidden

#### Autoplay Configuration

The video element configuration includes:
```html
<video autoPlay muted ... />
```

This ensures:
- Autoplay on page load
- Compliant with browser autoplay policies (must be muted)

#### Iframe Embedding Requirements

When embedding this page in an iframe, ensure proper permissions:

```html
<iframe 
  src="/embed?encrypted=true"
  allow="encrypted-media; autoplay"
  style="width: 100%; height: 100%; border: none;"
></iframe>
```

The `allow` attribute is required for:
- `encrypted-media`: Required for DRM (EME) to work in cross-origin iframes
- `autoplay`: Required for autoplay to work in cross-origin iframes

## Usage Examples

### Basic Embed
```html
<iframe 
  src="/embed?encrypted=true"
  allow="encrypted-media; autoplay"
  width="640"
  height="360"
></iframe>
```

### Full-Screen Embed
```html
<iframe 
  src="/embed?encrypted=true"
  allow="encrypted-media; autoplay"
  style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none;"
></iframe>
```

### Non-Encrypted Embed
```html
<iframe 
  src="/embed?encrypted=false"
  allow="encrypted-media; autoplay"
  width="640"
  height="360"
></iframe>
```

## Configuration

The embed page uses the same environment variables as the viewer page:

- `VITE_CLOUDFLARE_STREAM_DOMAIN`: Stream domain
- `VITE_WHEP_ENDPOINT_DEFAULT`: Default WHEP endpoint
- `VITE_DRM_MERCHANT`: DRM merchant identifier
- `VITE_NODE_ENV`: Environment (production/development)

## Build and Deploy

The build process includes the new embed page:

```bash
cd drm-frontend
npm run build
```

The build output includes:
- `dist/index.html`
- `dist/assets/main-*.js`
- `dist/assets/main-*.css`

All routes (including `/embed`) are handled client-side by React Router.

## Browser Compatibility

The embed page requires:

1. **Encrypted Media Extensions (EME)**: For DRM playback
2. **WebRTC**: For WHEP streaming
3. **MediaSource Extensions (MSE)**: For adaptive playback

Modern browsers support these features:
- Chrome/Edge 42+
- Firefox 42+
- Safari 11+ (FairPlay)
- Opera 29+

## Security Considerations

1. **Debug logs disabled**: In embed mode, all debug logging is disabled for security
2. **EME permission**: Iframe must include `allow="encrypted-media"` for DRM to work
3. **Auth tokens**: Same authentication flow as viewer page

## Notes

- The `/embed` route is intended for iframe or embedded usage
- It reuses the existing DRM implementation from the viewer page
- No new DRM logic was introduced, ensuring identical behavior
- The page remains visually minimal with only the video player
