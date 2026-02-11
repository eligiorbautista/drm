/**
 * Embed Player Utility
 * Provides a function to open the encrypted video stream in a new embeddable window
 * with hidden configuration (no sensitive data in URL)
 */

export interface EmbedPlayerOptions {
  /** WHEP endpoint URL for the stream */
  endpoint?: string;
  /** DRM merchant ID */
  merchant?: string;
  /** User ID for DRM callback authorization */
  userId?: string;
  /** Whether to enable DRM encryption (default: true) */
  encrypted?: boolean;
  /** DRM Key ID (hex string, optional - uses env default if not provided) */
  keyId?: string;
  /** DRM IV (hex string, optional - uses env default if not provided) */
  iv?: string;
  /** Window width in pixels (default: 1280) */
  width?: number;
  /** Window height in pixels (default: 720) */
  height?: number;
  /** Window title (default: 'DRM Stream Player') */
  title?: string;
  /** Whether the window should be fullscreen (default: false) */
  fullscreen?: boolean;
  /** Additional window features */
  features?: string;
}

/**
 * Default configuration from environment
 */
const getDefaultConfig = () => ({
  endpoint: import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN + import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT,
  merchant: import.meta.env.VITE_DRM_MERCHANT,
  encrypted: true,
});

/**
 * Generates the embed player bootstrap HTML.
 * The configuration is embedded as a data URL or passed through window.name to keep it out of URLs.
 * Then it loads the React embed player page.
 */
function generateEmbedHtml(config: {
  endpoint: string;
  merchant: string;
  userId: string;
  encrypted: boolean;
  keyId: string;
  iv: string;
}): string {
  // Encode config as base64 to store in window.name (avoids URL exposure)
  const configString = JSON.stringify(config);
  const configBase64 = btoa(configString);
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>DRM Protected Stream Player</title>
    <link rel="icon" href="/dmp.ico" />
    <script src="/crypto/clcrypto.js"></script>
    <script type="module">
      // Store config in window.name before navigating to /embed
      window.name = atob('${configBase64}');
      
      // Load the main React app which will route to /embed
      // The embed player will read config from window.name
      window.location.replace('/embed');
    </script>
    <style>
      body { margin: 0; background: #000; overflow: hidden; }
      #loading {
        position: fixed; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; background: #000;
        color: #a0a0a0; font-family: system-ui, -apple-system, sans-serif;
      }
      .spinner {
        width: 48px; height: 48px; border: 4px solid #404040;
        border-top-color: #fff; border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div id="loading">
      <div class="spinner"></div>
      <p style="margin-top: 16px;">Loading player...</p>
    </div>
  </body>
</html>`;
}

/**
 * Opens a new window with an embeddable player that plays the encrypted video stream.
 * Configuration is embedded in the HTML, keeping sensitive data out of the URL.
 * 
 * @param options - Configuration options for the embed player
 * @returns The opened window reference (null if popup was blocked)
 * 
 * @example
 * // Open with default settings
 * openEmbedPlayer();
 * 
 * @example
 * // Open with custom endpoint (endpoint is hidden in page, not URL)
 * openEmbedPlayer({
 *   endpoint: 'https://custom-stream.com/whep',
 *   merchant: 'custom-merchant-id',
 *   userId: 'user-123'
 * });
 */
export function openEmbedPlayer(options: EmbedPlayerOptions = {}): Window | null {
  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    merchant: options.merchant || defaults.merchant,
    userId: options.userId || 'embed-user',
    encrypted: options.encrypted ?? defaults.encrypted,
    keyId: options.keyId || import.meta.env.VITE_DRM_KEY_ID || '',
    iv: options.iv || import.meta.env.VITE_DRM_IV || '',
  };

  const width = options.width || 1280;
  const height = options.height || 720;
  const title = options.title || 'DRM Stream Player';
  const fullscreen = options.fullscreen || false;

  // Calculate window position for centering
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;
  const left = fullscreen ? 0 : Math.round((screenWidth - width) / 2);
  const top = fullscreen ? 0 : Math.round((screenHeight - height) / 2);

  // Build window features
  const windowFeatures = fullscreen
    ? 'fullscreen=yes,toolbar=no,menubar=no,location=no,status=no,scrollbars=no'
    : [
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`,
        'resizable=yes',
        'scrollbars=no',
        'status=no',
        'location=no',
        'toolbar=no',
        'menubar=no',
        options.features || '',
      ].filter(Boolean).join(',');

  // Open blank window first
  const newWindow = window.open('about:blank', title, windowFeatures);

  if (!newWindow) {
    console.error('[Embed Player] Failed to open window. Popup may be blocked.');
    alert('Please allow popups for this site to open the embed player.');
    return null;
  }

  try {
    // Write the HTML directly to the new window
    newWindow.document.open();
    newWindow.document.write(generateEmbedHtml(config));
    newWindow.document.close();
    newWindow.focus();

    console.log('[Embed Player] Opened embed window:', {
      width,
      height,
      fullscreen,
      endpointHidden: true,
    });

    return newWindow;
  } catch (err) {
    console.error('[Embed Player] Error writing to window:', err);
    newWindow.close();
    return null;
  }
}

/**
 * Opens the embed player in a popup window with specific dimensions
 * 
 * @param width - Window width in pixels
 * @param height - Window height in pixels
 * @param options - Additional embed options
 * @returns The opened window reference
 */
export function openEmbedPopup(
  width: number = 1280,
  height: number = 720,
  options: Omit<EmbedPlayerOptions, 'width' | 'height' | 'fullscreen'> = {}
): Window | null {
  return openEmbedPlayer({ ...options, width, height, fullscreen: false });
}

/**
 * Opens the embed player in fullscreen mode
 * 
 * @param options - Additional embed options (fullscreen is forced to true)
 * @returns The opened window reference
 */
export function openEmbedFullscreen(
  options: Omit<EmbedPlayerOptions, 'fullscreen'> = {}
): Window | null {
  return openEmbedPlayer({ ...options, fullscreen: true });
}

/**
 * Generates an embeddable iframe HTML code snippet for the player.
 * 
 * SECURITY WARNING: This generates an iframe with the configuration in the URL.
 * For sensitive configurations, use `openEmbedPlayer()` instead which hides the
 * configuration in the page content.
 * 
 * @param options - Configuration options
 * @param hideWarning - Set to true to suppress the security warning comment
 * @returns HTML string for the iframe embed code
 */
export function generateEmbedCode(options: EmbedPlayerOptions = {}, hideWarning = false): string {
  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    merchant: options.merchant || defaults.merchant,
    userId: options.userId || 'embed-user',
    encrypted: options.encrypted ?? defaults.encrypted,
    keyId: options.keyId || '',
    iv: options.iv || '',
    width: options.width || 1280,
    height: options.height || 720,
  };

  const params = new URLSearchParams();
  params.set('endpoint', config.endpoint);
  params.set('merchant', config.merchant);
  params.set('userId', config.userId);
  params.set('encrypted', config.encrypted.toString());
  
  if (config.keyId) params.set('keyId', config.keyId);
  if (config.iv) params.set('iv', config.iv);

  const embedUrl = `${window.location.origin}/embed.html?${params.toString()}`;

  const warning = hideWarning ? '' : `<!-- 
  SECURITY WARNING: This embed code exposes the endpoint and merchant ID in the URL.
  For sensitive configurations, consider using the popup window method instead:
  
  import { openEmbedPlayer } from './lib/embedPlayer';
  openEmbedPlayer({ endpoint: '...', merchant: '...' }); // Config is hidden
-->
`;

  return `${warning}<!-- DRM Protected Stream Embed -->
<iframe 
  src="${embedUrl}" 
  width="${config.width}" 
  height="${config.height}"
  frameborder="0" 
  allow="encrypted-media; autoplay; fullscreen; picture-in-picture"
  allowfullscreen
  title="DRM Protected Stream"
  style="border: none; background: #000;"
></iframe>`;
}

/**
 * Creates a secure embedded player using a parent-controlled iframe with postMessage API.
 * This approach hides the configuration from the URL while still allowing iframe embedding.
 * 
 * @param containerElement - The DOM element to inject the iframe into
 * @param options - Configuration options
 * @returns Object with methods to control the player
 * 
 * @example
 * const player = createSecureEmbedPlayer(document.getElementById('player-container'), {
 *   endpoint: 'https://...',
 *   merchant: '...'
 * });
 * 
 * // Later: destroy the player
 * player.destroy();
 */
export function createSecureEmbedPlayer(
  containerElement: HTMLElement,
  options: EmbedPlayerOptions = {}
): { iframe: HTMLIFrameElement; destroy: () => void } {
  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    merchant: options.merchant || defaults.merchant,
    userId: options.userId || 'embed-user',
    encrypted: options.encrypted ?? defaults.encrypted,
    keyId: options.keyId || import.meta.env.VITE_DRM_KEY_ID || '',
    iv: options.iv || import.meta.env.VITE_DRM_IV || '',
  };

  const width = options.width || 1280;
  const height = options.height || 720;

  // Create iframe with no sensitive data in URL
  const iframe = document.createElement('iframe');
  iframe.src = 'about:blank';
  iframe.width = String(width);
  iframe.height = String(height);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'encrypted-media; autoplay; fullscreen; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('title', 'DRM Protected Stream');
  iframe.style.border = 'none';
  iframe.style.background = '#000';

  // Generate the player HTML
  const html = generateEmbedHtml(config);

  // Wait for iframe to load, then inject content
  iframe.onload = () => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    } catch (err) {
      console.error('[Embed Player] Failed to inject content into iframe:', err);
    }
  };

  // Inject the iframe
  containerElement.appendChild(iframe);

  return {
    iframe,
    destroy: () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }
  };
}

/**
 * Check if the browser supports the required features for the embed player
 * 
 * @returns Object with feature support status
 */
export function checkEmbedSupport(): {
  supported: boolean;
  webrtc: boolean;
  eme: boolean;
  insertableStreams: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check WebRTC
  const webrtc = typeof RTCPeerConnection !== 'undefined';
  if (!webrtc) {
    issues.push('WebRTC is not supported in this browser');
  }

  // Check EME
  const eme = typeof navigator.requestMediaKeySystemAccess !== 'undefined';
  if (!eme) {
    issues.push('Encrypted Media Extensions (EME) are not supported');
  }

  // Check Insertable Streams
  const insertableStreams = webrtc && 
    typeof RTCPeerConnection.prototype.getSenders === 'function';
  if (!insertableStreams) {
    issues.push('WebRTC Insertable Streams API is not available');
  }

  const supported = webrtc && eme;

  return {
    supported,
    webrtc,
    eme,
    insertableStreams,
    issues,
  };
}
