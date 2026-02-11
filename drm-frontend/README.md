# DRM Media Platform

A React-based embeddable player component for secure live streaming with DRM protection via WebRTC (WHEP/WHIP).

## Features

- **WHEP Playback:** Low-latency streaming via WebRTC viewer.
- **WHIP Broadcasting:** WebRTC-based live broadcasting with camera/microphone support.
- **DRM Integration:** Built-in support for CastLabs DRM encryption (WHIP) and decryption (WHEP) using `rtc-drm-transform`.
- **Embeddable:** Available as a standalone Iframe page or a React component.
- **Customizable:** Configurable via URL parameters or Props.
- **Dual Mode:** Toggle between viewer and broadcaster modes in the same app.
- **Secure Auth:** Cookie-based authentication with HttpOnly cookies for enhanced security.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Access the demo:
   - **Main App:** `http://localhost:5173/`
   - **Embed Page:** `http://localhost:5173/embed.html`

## Authentication

The application now uses **cookie-based authentication** with HttpOnly cookies for improved security. See [COOKIE_AUTH_GUIDE.md](../COOKIE_AUTH_GUIDE.md) for detailed information.

### How It Works

- Login credentials are sent to the backend
- Backend sets HttpOnly cookies containing access and refresh tokens
- Cookies are automatically sent with all API requests
- JavaScript cannot access the cookies (protects against XSS attacks)

### Setup

Ensure the backend is configured with CORS credentials enabled and the `COOKIE_SECRET` environment variable is set.

## Running Locally

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Start the development server:
    ```bash
    npm run dev
    ```

3.  Access the demo:
    -   **Main App:** `http://localhost:5173/`
    -   **Embed Page:** `http://localhost:5173/embed.html`

## Integration Guide

### Option 1: Iframe Embedding (Recommended for non-React apps)

You can embed the player into any website using an `<iframe>`. The player is configured via URL query parameters.

**Base URL:** `/embed.html`

**Query Parameters:**

| Parameter   | Type     | Required | Description |
| ----------- | -------- | -------- | ----------- |
| `encrypted` | Boolean  | No       | Controls DRM decryption: `true` = decrypt DRM-protected stream, `false` = show stream unencrypted. Default: Read from viewer button (database setting). |

> [NOTE] **DRM Encryption:** The easiest way to open the embed player with the correct encryption setting is to use the "Embed" button on the Viewer page. This automatically sets the correct `encrypted` parameter. Endpoint and merchant configuration come from your environment variables.

**Recommended: Use the "Embed" button**

The Viewer page includes an "Embed" button that automatically sets the correct `encrypted` parameter based on your database settings.

**Manual iframe examples:**

**With DRM Decryption (encrypted=true):**
```html
<iframe
  src="https://your-player-domain.com/embed?encrypted=true"
  width="100%"
  height="500px"
  frameborder="0"
  allow="autoplay; encrypted-media; fullscreen"
  allowfullscreen
></iframe>
```

**Without DRM Decryption (encrypted=false):**
```html
<iframe
  src="https://your-player-domain.com/embed?encrypted=false"
  width="100%"
  height="500px"
  frameborder="0"
  allow="autoplay; fullscreen"
  allowfullscreen
></iframe>
```

> [NOTE] **Configuration:** Endpoint and merchant configuration are loaded from environment variables (`VITE_CLOUDFLARE_STREAM_DOMAIN`, `VITE_WHEP_ENDPOINT_DEFAULT`, `VITE_DRM_MERCHANT`). Only the `encrypted` parameter needs to be set in the URL.

> [NOTE] **DRM Control:** To enable/disable DRM decryption, use the Settings page in the application to toggle the `drm.encryption.enabled` setting. This applies to the embed player automatically.

**Troubleshooting: "output-protection" error in iframes**

If you see an `output-protection` or DRM error when embedding the player:

1. **Verify the `allow` attribute** — The `<iframe>` MUST include `allow="encrypted-media; autoplay"` when `encrypted=true`. This is a browser security requirement for cross-origin DRM playback.
2. **Check the encryption setting** — DRM encryption is controlled by the `encrypted` URL parameter (`true` or `false`). This is set automatically by the "Embed" button based on your database `drm.encryption.enabled` setting.
3. **Use HTTPS** — Both the parent page and the embedded player must be served over HTTPS.
4. **Check browser support** — Ensure the browser supports EME (Chrome, Edge, Safari, Firefox).

### Option 2: React Component

If you are building a React application, you can import the `Player` component directly.

**Installation:**
Ensure you have the necessary peer dependencies installed (`react`, `react-dom`). This package is currently designed to be part of the monorepo, but can be extracted.

**Usage:**

```tsx
import { Player } from './components/Player';

function App() {
  return (
    <div className="my-player-container">
      <Player
        endpoint="https://your-stream.com/whep"
        merchant="sb_live"
        encrypted={true}
        token="your-drm-token"
      />
    </div>
  );
}
```

**Props:**

| Prop        | Type     | Required | Description |
| ----------- | -------- | -------- | ----------- |
| `endpoint`  | string   | **Yes**  | The WHEP playback URL. |
| `merchant`  | string   | **Yes**  | Your CastLabs Merchant ID. |
| `encrypted` | boolean  | No       | Enable DRM decryption. |
| `token`     | string   | No       | DRM token. |

## Building for Production

To build the project for deployment (generates static files in `dist/`):

```bash
npm run build
```

The `dist/` folder will contain:
- `index.html` (Main App with Viewer and Broadcaster modes)
- `embed.html` (Standalone Embed Page)
- Assets (JS/CSS)

## Broadcaster Mode

The embeddable player now includes a **WHIP broadcaster** mode that allows you to stream live video from your camera/microphone using WebRTC.

### Using Broadcaster Mode

1. Switch to **Broadcaster** mode using the toggle button at the top of the app
2. Enter your WHIP endpoint URL (e.g., `https://your-account.cloudflarestream.com/stream-id/webRTC/publish`)
3. Enable DRM encryption if needed (uses the same keys as viewer mode)
4. Click "Start Broadcasting" to begin streaming
5. Allow camera and microphone permissions when prompted

### Features

- **Media Capture:** Works with physical cameras, virtual cameras (OBS), and microphones
- **DRM Encryption:** Optional AES-CBC (CBCS) encryption for secure broadcasts
- **Local Preview:** See what you're broadcasting in real-time
- **Connection Status:** Visual indicators for broadcasting state
- **Error Handling:** User-friendly error messages and retry options

### Environment Variables for Broadcasting

Add the following to your `.env` file:

```env
VITE_WHIP_ENDPOINT_DEFAULT=/<STREAM_ID>/webRTC/publish
```

The broadcaster uses the same DRM keys as the viewer:
- `VITE_DRM_KEY_ID` - Key identifier
- `VITE_DRM_CONTENT_KEY` - Encryption key (hex) 
- `VITE_DRM_IV` - Initialization vector (hex)

## Configuration

### Environment Variables

The following environment variables can be configured in your `.env` file:

**Cloudflare Stream:**
- `VITE_CLOUDFLARE_STREAM_DOMAIN` - Your Cloudflare Stream domain (e.g., `https://<account>.cloudflarestream.com`)
- `VITE_WHEP_ENDPOINT_DEFAULT` - Default WHEP playback endpoint
- `VITE_WHIP_ENDPOINT_DEFAULT` - Default WHIP publishing endpoint

**DRM Configuration:**
- `VITE_DRM_MERCHANT` - Your CastLabs Merchant ID
- `VITE_DRM_BACKEND_URL` - Your DRM backend URL for callback authorization
- `VITE_DRM_KEY_ID` - Key identifier for content encryption
- `VITE_DRM_CONTENT_KEY` - Encryption key (hex)
- `VITE_DRM_IV` - Initialization vector (hex)

See [`.env.example`](.env.example) for all available environment variables.

Deploy the contents of `dist/` to any static file server (Vercel, Netlify, S3, Nginx).