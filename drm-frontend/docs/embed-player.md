# Embed Player

A utility for opening an embeddable player window that plays encrypted video streams using DRM protection. The configuration (endpoint, merchant ID, etc.) is hidden from the URL for security.

## Features

- Secure: Endpoint and merchant ID are hidden from the URL
- Opens encrypted video streams in a new popup/fullscreen window
- Full DRM support (Widevine, FairPlay, PlayReady)
- Configurable window dimensions and options
- Generates iframe embed code for third-party sites (with security warning)
- Secure iframe embedding option with hidden configuration
- Browser capability detection
- Auto-reconnect on page visibility changes

## Security Model

### Recommended: `openEmbedPlayer()` - URL-Safe Method

The `openEmbedPlayer()` function opens a blank window and dynamically injects the player HTML. This means:

- Endpoint URL is NOT in the address bar
- Merchant ID is NOT in the address bar
- All configuration is embedded in the page JavaScript
- User cannot copy/paste the URL to share the stream

```typescript
import { openEmbedPlayer } from './lib/embedPlayer';

// Configuration is hidden from URL
openEmbedPlayer({
  endpoint: 'https://secret-stream.com/whep',
  merchant: 'secret-merchant-id',
  userId: 'user-123',
});
// Window opens at: about:blank (then content is injected)
```

### Alternative: `generateEmbedCode()` - URL-Exposed Method

The `generateEmbedCode()` function creates an iframe with the configuration in the URL query parameters. Only use this if the endpoint/merchant are not sensitive.

```typescript
import { generateEmbedCode } from './lib/embedPlayer';

// Configuration is visible in the URL
const code = generateEmbedCode({
  endpoint: 'https://stream.com/whep',
  merchant: 'merchant-id', // Visible in URL!
});
// iframe src: https://yourdomain.com/embed.html?endpoint=...&merchant=...
```

### Secure Iframe: `createSecureEmbedPlayer()`

For embedding in iframes without exposing configuration in URLs:

```typescript
import { createSecureEmbedPlayer } from './lib/embedPlayer';

const container = document.getElementById('player-container');

const player = createSecureEmbedPlayer(container, {
  endpoint: 'https://secret-stream.com/whep',
  merchant: 'secret-merchant-id',
  width: 1280,
  height: 720,
});

// Later: cleanup
player.destroy();
```

## Usage

### Basic Usage (Secure, Hidden Config)

```typescript
import { openEmbedPlayer } from './lib/embedPlayer';

// Open with default settings - endpoint and merchant hidden
openEmbedPlayer();
```

### Custom Configuration (Hidden from URL)

```typescript
import { openEmbedPlayer } from './lib/embedPlayer';

// All configuration is embedded in the page, not the URL
openEmbedPlayer({
  endpoint: 'https://your-stream.com/whep',
  merchant: 'your-merchant-id',
  userId: 'user-123',
  encrypted: true,
  width: 1920,
  height: 1080,
  title: 'Live Stream',
});
// Window URL: about:blank
```

### Fullscreen Mode

```typescript
import { openEmbedFullscreen } from './lib/embedPlayer';

openEmbedFullscreen({
  merchant: 'your-merchant-id',
  userId: 'user-123',
});
```

### Popup with Specific Size

```typescript
import { openEmbedPopup } from './lib/embedPlayer';

openEmbedPopup(1280, 720, {
  endpoint: 'https://custom-stream.com/whep',
});
```

### Secure Iframe Embedding

```typescript
import { createSecureEmbedPlayer } from './lib/embedPlayer';

const player = createSecureEmbedPlayer(
  document.getElementById('container'),
  {
    endpoint: 'https://secret-stream.com/whep',
    merchant: 'secret-merchant',
    width: 1280,
    height: 720,
  }
);

// Cleanup when done
player.destroy();
```

### Check Browser Support

```typescript
import { checkEmbedSupport } from './lib/embedPlayer';

const support = checkEmbedSupport();

if (!support.supported) {
  console.error('Browser not supported:', support.issues);
}
```

## API Reference

### `openEmbedPlayer(options)` Recommended

Opens a new window with the embeddable player. Configuration is hidden from the URL.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | `VITE_WHEP_ENDPOINT` | WHEP endpoint URL (hidden) |
| `merchant` | `string` | `VITE_DRM_MERCHANT` | DRM merchant ID (hidden) |
| `userId` | `string` | `'embed-user'` | User ID for DRM callback (hidden) |
| `encrypted` | `boolean` | `true` | Enable DRM encryption (hidden) |
| `keyId` | `string` | `''` | DRM Key ID (hidden) |
| `iv` | `string` | `''` | DRM IV (hidden) |
| `width` | `number` | `1280` | Window width |
| `height` | `number` | `720` | Window height |
| `title` | `string` | `'DRM Stream Player'` | Window title |
| `fullscreen` | `boolean` | `false` | Open in fullscreen |
| `features` | `string` | `''` | Additional window features |

**Returns:** `Window | null` - The opened window reference (null if blocked)

**Security:** The window opens to `about:blank` and the HTML is injected dynamically. The endpoint and merchant ID are never visible in the URL.

### `createSecureEmbedPlayer(container, options)` Recommended for Iframes

Creates an iframe with the player embedded directly, hiding configuration from URLs.

**Parameters:**
- `containerElement: HTMLElement` - The DOM element to inject the iframe into
- `options: EmbedPlayerOptions` - Same options as `openEmbedPlayer()`

**Returns:** `{ iframe: HTMLIFrameElement; destroy: () => void }`

### `openEmbedPopup(width, height, options)`

Convenience function to open in a popup with specific dimensions. Config is hidden.

### `openEmbedFullscreen(options)`

Convenience function to open in fullscreen mode. Config is hidden.

### `generateEmbedCode(options, hideWarning?)` URL-Exposed

Generates an iframe HTML snippet for embedding on third-party sites. Warning: Configuration is visible in the URL.

**Parameters:**
- `options: EmbedPlayerOptions` - Configuration options
- `hideWarning?: boolean` - Set to `true` to hide the security warning comment

### `checkEmbedSupport()`

Checks if the browser supports required features.

**Returns:**
```typescript
{
  supported: boolean;
  webrtc: boolean;
  eme: boolean;
  insertableStreams: boolean;
  issues: string[];
}
```

## How It Works

### Secure Method (Hidden Config)

1. User clicks "Open Embed Player"
2. `window.open('about:blank')` opens a blank window
3. The function generates the complete player HTML with config embedded in a JavaScript object
4. `document.write()` injects the HTML into the new window
5. The player initializes with the embedded config
6. Result: URL shows about:blank (or stays blank), config is in the page source

### Traditional Method (URL Config)

1. Configuration is encoded in URL query parameters
2. `window.open('/embed.html?endpoint=...&merchant=...')`
3. Result: URL contains all sensitive data

## Embed Player Page

The embed player is now a React/TSX component located at `src/pages/EmbedPlayerPage.tsx` and is accessible at `/embed`. It can be used directly via URL with query parameters:

```
https://yourdomain.com/embed?endpoint=whep-url&merchant=id&userId=user&encrypted=true
```

For secure (hidden config) usage, use the `openEmbedPlayer()` or `createSecureEmbedPlayer()` functions which inject configuration into the window object before navigating to the `/embed` route.

### URL Parameters (for direct /embed usage)

| Parameter | Description |
|-----------|-------------|
| `endpoint` | WHEP endpoint URL (required) |
| `merchant` | DRM merchant ID |
| `userId` | User ID for DRM callback |
| `encrypted` | Enable DRM (`true`/`false`) |
| `keyId` | DRM Key ID (hex string) |
| `iv` | DRM IV (hex string) |

## Iframe Requirements

When embedding the player in an iframe, you must include the `encrypted-media` permission:

```html
<iframe 
  src="https://yourdomain.com/embed?endpoint=..."
  allow="encrypted-media; autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>
```

Without `encrypted-media`, DRM playback will fail with a "NotAllowedError".

## Browser Compatibility

- Chrome/Edge 90+ (Widevine)
- Firefox 90+ (Widevine)
- Safari 14+ (FairPlay)
- Android Chrome 90+

Requires:
- WebRTC support
- Encrypted Media Extensions (EME)
- Insertable Streams API

## Best Practices

1. Always use `openEmbedPlayer()` when the endpoint/merchant are sensitive
2. Never use URL parameters for confidential streams (config is in URL)
3. Use `createSecureEmbedPlayer()` for embedded players on your own site
4. The `/embed` route is provided for third-party integrations where URL exposure is acceptable
