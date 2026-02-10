/**
 * User Agent Parser Utility
 * Parses user agent strings to extract browser, platform, and OS information
 */

export interface ParsedUserAgent {
  browser: string | null;
  platform: string | null;
  os: string | null;
  raw: string | null;
}

/**
 * Parse user agent string to extract browser, platform, and OS information
 */
export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) {
    return {
      browser: null,
      platform: null,
      os: null,
      raw: null,
    };
  }

  const ua = userAgent.toLowerCase();

  // Browser patterns
  const browserPatterns: Array<[RegExp, string]> = [
    [/edge|edg\/|edgios|edga|edg\//, 'Edge'],
    [/chrome|crios|crmo/, 'Chrome'],
    [/firefox|fxios|fennec/, 'Firefox'],
    [/safari|applewebkit(?!.*chrome)/, 'Safari'],
    [/opera|opios|opera mini|opera mobi/, 'Opera'],
    [/msie|trident.*rv/, 'Internet Explorer'],
    [/whale/, 'Whale'],
    [/samsungbrowser/, 'Samsung Internet'],
    [/ucbrowser|ucmini|uc web/, 'UC Browser'],
    [/yabrowser/, 'Yandex Browser'],
    [/baidubrowser/, 'Baidu Browser'],
    [/duckduckgo/, 'DuckDuckGo'],
    [/brave/, 'Brave'],
    [/silk/, 'Amazon Silk'],
    [/vivaldi/, 'Vivaldi'],
  ];

  let browser: string | null = null;
  for (const [pattern, name] of browserPatterns) {
    if (pattern.test(ua)) {
      browser = name;
      break;
    }
  }

  // OS patterns
  const osPatterns: Array<[RegExp, string]> = [
    [/windows nt 10/, 'Windows 10'],
    [/windows nt 6\.3/, 'Windows 8.1'],
    [/windows nt 6\.2/, 'Windows 8'],
    [/windows nt 6\.1/, 'Windows 7'],
    [/windows nt 6\.0/, 'Windows Vista'],
    [/windows nt 5\.2/, 'Windows Server 2003/XP x64'],
    [/windows nt 5\.1|windows xp/, 'Windows XP'],
    [/windows nt 5\.0/, 'Windows 2000'],
    [/windows phone/, 'Windows Phone'],
    [/mac os x ([\d_\.]+)/, 'macOS'],
    [/mac os x/, 'macOS'],
    [/ios|iphone|ipad|ipod/, 'iOS'],
    [/android/, 'Android'],
    [/linux/, 'Linux'],
    [/ubuntu/, 'Ubuntu'],
    [/debian/, 'Debian'],
    [/fedora/, 'Fedora'],
    [/centos/, 'CentOS'],
    [/red hat|redhat/, 'Red Hat'],
    [/arch linux/, 'Arch Linux'],
    [/freebsd/, 'FreeBSD'],
    [/openbsd/, 'OpenBSD'],
  ];

  let os: string | null = null;
  for (const [pattern, name] of osPatterns) {
    if (pattern.test(ua)) {
      os = name;
      break;
    }
  }

  // Platform patterns
  const platformPatterns: Array<[RegExp, string]> = [
    [/mobile|iphone|ipad|ipod|android.*mobile/, 'Mobile'],
    [/android.*tablet|ipad/, 'Tablet'],
    [/xbox/, 'Xbox'],
    [/playstation/, 'PlayStation'],
    [/nintendo/, 'Nintendo'],
    [/smart-tv|smarttv|google tv|appletv|apple tv/, 'Smart TV'],
    [/windows|mac os|linux|ubuntu|debian|fedora|centos|red hat|arch|freebsd|openbsd/, 'Desktop'],
  ];

  let platform: string | null = null;
  for (const [pattern, name] of platformPatterns) {
    if (pattern.test(ua)) {
      platform = name;
      break;
    }
  }

  return {
    browser,
    platform,
    os,
    raw: userAgent,
  };
}

/**
 * Format user agent information for display
 */
export function formatUserAgent(ua: string | null): string {
  const parsed = parseUserAgent(ua);
  
  const parts: string[] = [];
  if (parsed.browser) parts.push(parsed.browser);
  if (parsed.platform) parts.push(parsed.platform);
  if (parsed.os && parsed.os !== parsed.platform) parts.push(parsed.os);

  return parts.length > 0 ? parts.join(' • ') : (ua ? 'Unknown' : 'N/A');
}

/**
 * Get short user agent display
 */
export function getShortUserAgentInfo(ua: string | null): string {
  const parsed = parseUserAgent(ua);
  
  if (parsed.browser && parsed.platform) {
    return `${parsed.browser} (${parsed.platform})`;
  }
  if (parsed.browser) {
    return parsed.browser;
  }
  if (parsed.platform) {
    return parsed.platform;
  }
  
  return ua ? 'Unknown' : 'N/A';
}