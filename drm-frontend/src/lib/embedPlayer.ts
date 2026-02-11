/**
 * Embed Player Utility
 * Opens the encrypted video stream in a new tab with configuration passed via URL hash
 */

export interface EmbedPlayerOptions {
  /** WHEP endpoint URL for the stream - The only required parameter */
  endpoint?: string;
  /** User ID for DRM callback authorization (optional, uses env default) */
  userId?: string;
  /** Width for iframe generation (default: 1280) */
  width?: number;
  /** Height for iframe generation (default: 720) */
  height?: number;
}

/**
 * Default configuration from environment
 * Note: Merchant, keyId, IV are read from env directly in EmbedPlayerPage
 */
const getDefaultConfig = () => ({
  endpoint: import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN + import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT,
  userId: 'embed-user',
});

/**
 * Encodes config to base64 for URL hash
 */
function encodeConfig(config: Record<string, any>): string {
  const jsonString = JSON.stringify(config);
  return btoa(jsonString);
}

/**
 * Opens a new tab with the embed player
 * Only endpoint is required - all other DRM config comes from .env
 * 
 * @param options - Configuration options for the embed player
 * 
 * @example
 * // Open with default endpoint from env
 * openEmbedPlayer();
 * 
 * @example
 * // Open with custom endpoint
 * openEmbedPlayer({
 *   endpoint: 'https://custom-stream.com/whep',
 *   userId: 'user-123'
 * });
 */
export function openEmbedPlayer(options: EmbedPlayerOptions = {}): Window | null {
  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    userId: options.userId || defaults.userId,
  };

  // Encode config to base64
  const encodedConfig = encodeConfig(config);
  
  // Build URL with hash
  const embedUrl = `/embed#${encodedConfig}`;
  
  // Open in new tab
  const newWindow = window.open(embedUrl, '_blank');

  if (!newWindow) {
    console.error('[Embed Player] Failed to open new tab. Popup may be blocked.');
    alert('Please allow popups for this site to open the embed player.');
    return null;
  }

  console.log('[Embed Player] Opened embed player with endpoint:', config.endpoint);

  return newWindow;
}

/**
 * Opens the embed player as a popup window (centered)
 */
export function openEmbedPopup(options: EmbedPlayerOptions = {}): Window | null {
  const width = 1280;
  const height = 720;
  
  // Center window
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;
  const left = Math.round((screenWidth - width) / 2);
  const top = Math.round((screenHeight - height) / 2);

  const windowFeatures = [
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
  ].join(',');

  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    userId: options.userId || defaults.userId,
  };

  const encodedConfig = encodeConfig(config);
  const embedUrl = `/embed#${encodedConfig}`;
  
  const newWindow = window.open(embedUrl, '_blank', windowFeatures);

  if (!newWindow) {
    console.error('[Embed Player] Failed to open popup. Popup may be blocked.');
    alert('Please allow popups for this site to open the embed player.');
    return null;
  }

  return newWindow;
}

/**
 * Opens the embed player in fullscreen mode
 */
export function openEmbedFullscreen(options: EmbedPlayerOptions = {}): Window | null {
  const windowFeatures = [
    'fullscreen=yes',
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no',
    'scrollbars=no',
  ].join(',');

  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    userId: options.userId || defaults.userId,
  };

  const encodedConfig = encodeConfig(config);
  const embedUrl = `/embed#${encodedConfig}`;
  
  const newWindow = window.open(embedUrl, '_blank', windowFeatures);

  if (!newWindow) {
    console.error('[Embed Player] Failed to open fullscreen. Popup may be blocked.');
    alert('Please allow popups for this site to open the embed player.');
    return null;
  }

  return newWindow;
}

/**
 * Creates a secure embed player URL (returns only URL, doesn't open window)
 * Use this for iframes or manual window opening
 */
export function createSecureEmbedPlayer(options: EmbedPlayerOptions = {}): string {
  const defaults = getDefaultConfig();
  
  const config = {
    endpoint: options.endpoint || defaults.endpoint,
    userId: options.userId || defaults.userId,
  };

  const encodedConfig = encodeConfig(config);
  return `/embed#${encodedConfig}`;
}

/**
 * Generates embed HTML code (for use in external websites)
 * Returns an iframe element with src
 */
export function generateEmbedCode(options: EmbedPlayerOptions = {}): string {
  const embedUrl = createSecureEmbedPlayer(options);
  const width = options.width || 1280;
  const height = options.height || 720;

  return `<iframe 
  src="${window.location.origin}${embedUrl}" 
  width="${width}" 
  height="${height}" 
  frameborder="0" 
  allow="autoplay; encrypted-media; fullscreen" 
  allowfullscreen
></iframe>`;
}

/**
 * Checks if embed player is supported in current browser
 */
export function checkEmbedSupport(): boolean {
  return typeof window !== 'undefined' && 
         !!document.createElement('video').canPlayType &&
         typeof RTCPeerConnection !== 'undefined';
}

/**
 * Convenience alias - opens embed player in new tab
 */
export { openEmbedPlayer as openEmbed };
