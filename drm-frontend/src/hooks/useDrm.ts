import { useCallback, useRef } from 'react';
import { rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments } from '../lib/drm';
import { hexToUint8Array, validateDrmKey } from '../lib/drmUtils';
import type { DrmConfig, TrackConfig } from '../lib/drm';

export interface UseDrmOptions {
  merchant: string;
  videoElement: HTMLVideoElement | null;
  audioElement?: HTMLAudioElement | null;
  environment?: 'Staging' | 'Production' | 'Development';
  userId?: string;  // Required for Callback Authorization
  keyId?: Uint8Array;
  iv?: Uint8Array;
  mediaBufferMs?: number;
  encryptionMode?: 'cenc' | 'cbcs';
}

/**
 * Platform detection utility
 * Note: Firefox reports all devices as "Linux" for privacy, so we detect it via userAgent
 */
function detectPlatform() {
  const uad = (navigator as any).userAgentData;
  const platform = uad?.platform || navigator.platform || '';
  const isMobile = uad?.mobile === true;
  
  // Firefox reports as Linux everywhere - detect via userAgent
  const uaHasAndroid = /Android/i.test(navigator.userAgent);
  const uaHasFirefox = /Firefox/i.test(navigator.userAgent);
  
  // Android detection: prioritize userAgent over platform
  const isAndroid = uaHasAndroid || 
                    platform.toLowerCase() === 'android' ||
                    (isMobile && /linux/i.test(platform));
  
  // Firefox detection
  const isFirefox = uaHasFirefox;
  
  return {
    isAndroid,
    isFirefox,
    platform: isAndroid ? 'Android' : isFirefox ? 'Firefox' : (platform || 'Unknown')
  };
}

/**
 * Detect Android Widevine robustness level
 */
async function detectAndroidRobustness(): Promise<'HW' | 'SW'> {
  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{
        contentType: 'video/mp4; codecs="avc1.42E01E"',
        robustness: 'HW_SECURE_ALL'
      }]
    }]);
    console.log('[DRM] Widevine L1 (HW_SECURE_ALL) is supported');
    return 'HW';
  } catch {
    console.log('[DRM] Widevine L1 (HW) NOT supported — falling back to SW');
    return 'SW';
  }
}

/**
 * Debug logger with on-screen overlay for physical devices
 */
export function logDebug(msg: string) {
  console.log(msg);
  
  // Send to debug panel
  window.dispatchEvent(
    new CustomEvent('debug-log', {
      detail: { id: 'player-debug', level: 'info' as const, message: msg, timestamp: new Date().toLocaleTimeString() },
    })
  );
  
  // Legacy overlay support
  let overlay = document.getElementById('debug-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'debug-overlay';
    overlay.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:30vh;overflow-y:auto;background:rgba(0,0,0,0.85);color:#0f0;font-size:11px;font-family:monospace;padding:6px;z-index:9999;pointer-events:auto;';
    document.body.appendChild(overlay);
  }
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  overlay.appendChild(line);
  overlay.scrollTop = overlay.scrollHeight;
}

/**
 * Error logger that sends to debug panel with error level
 */
export function logError(msg: string) {
  console.error(msg);
  
  // Send to debug panel with error level
  window.dispatchEvent(
    new CustomEvent('debug-log', {
      detail: { id: 'player-debug', level: 'error' as const, message: msg, timestamp: new Date().toLocaleTimeString() },
    })
  );
}

export function useDrm() {
  const configRef = useRef<DrmConfig | null>(null);

  const setup = useCallback(async (options: UseDrmOptions, videoTrackConfig?: TrackConfig) => {
    if (!options.videoElement) return null;

    // Get encryption keys from environment variables (DRMtoday configuration)
    const keyIdHex = import.meta.env.VITE_DRM_KEY_ID;
    const ivHex = import.meta.env.VITE_DRM_IV;
    const merchantId = import.meta.env.VITE_DRM_MERCHANT;

    // Validate keys before conversion
    if (!validateDrmKey(keyIdHex, 16)) {
      logError('[DRM] Invalid VITE_DRM_KEY_ID format: ' + keyIdHex);
    }
    if (!validateDrmKey(ivHex, 16)) {
      logError('[DRM] Invalid VITE_DRM_IV format: ' + ivHex);
    }

    // Convert hex strings to Uint8Arrays
    const keyId = options.keyId || hexToUint8Array(keyIdHex);
    const iv = options.iv || hexToUint8Array(ivHex);

    // Detect platform and robustness
    const { isAndroid, isFirefox, platform } = detectPlatform();
    logDebug(`Platform detected: ${platform} (isAndroid=${isAndroid}, isFirefox=${isFirefox})`);

    // Allow URL param override: ?robustness=HW or ?robustness=SW
    const params = new URLSearchParams(window.location.search);
    const robustnessOverride = params.get('robustness')?.toUpperCase() as 'HW' | 'SW' | null;

    let androidRobustness: 'HW' | 'SW' = 'SW';
    if (isAndroid) {
      androidRobustness = await detectAndroidRobustness();
    }

    // Apply override if provided
    if (robustnessOverride === 'HW' || robustnessOverride === 'SW') {
      androidRobustness = robustnessOverride;
      logDebug(`Robustness overridden via URL param: ${robustnessOverride}`);
    }

    // Determine media buffer size based on platform
    let mediaBufferMs = options.mediaBufferMs || -1;
    if (isAndroid && androidRobustness === 'HW' && mediaBufferMs < 600) {
      mediaBufferMs = 1200;
      logDebug(`Increased mediaBufferMs to ${mediaBufferMs} for Android HW robustness`);
    } else if (isFirefox && mediaBufferMs < 900) {
      // Firefox specifically needs 900ms to prevent stuttering (per client-sdk-changelog.md)
      mediaBufferMs = 900;
      logDebug(`Increased mediaBufferMs to ${mediaBufferMs} for Firefox (Firefox-specific requirement)`);
    } else if (mediaBufferMs < 600) {
      // Other desktop browsers using SW CDM need at least 600ms
      mediaBufferMs = 600;
      logDebug(`Increased mediaBufferMs to ${mediaBufferMs} for Desktop/Software DRM`);
    }

    // Encryption mode MUST match the sender
    const encryptionMode = options.encryptionMode || 'cbcs';

    // CALLBACK AUTHORIZATION MODE
    // With Callback Authorization, we don't generate authToken client-side.
    // DRMtoday will call our backend at /api/callback to get the CRT.
    // We only need to pass: merchant, userId, and environment.
    logDebug('Using Callback Authorization - backend will provide CRT');

    // @ts-ignore: Accessing static properties via string index
    const env = rtcDrmEnvironments[options.environment || 'Staging'];

    const robustness: 'HW' | 'SW' = isAndroid ? androidRobustness : 'SW';

    const videoConfig: TrackConfig = videoTrackConfig || {
      codec: 'H264' as const,
      encryption: encryptionMode as 'cenc' | 'cbcs',
      keyId: keyId,
      iv: iv,
      robustness: robustness
    };

    const config: DrmConfig = {
      merchant: options.merchant || merchantId,
      userId: options.userId || 'elidev-test',  // Required for Callback Authorization
      environment: env,
      videoElement: options.videoElement,
      audioElement: options.audioElement || undefined,
      video: videoConfig,
      audio: { codec: 'opus' as const, encryption: 'clear' as const },
      logLevel: 3,
      mediaBufferMs
    };

    // Add DRM type based on platform for proper license request handling
    // This is especially important for Callback Authorization
    if (isAndroid) {
      config.type = 'Widevine' as const;
      logDebug('Setting DRM type to Widevine for Android');
    } else if (isFirefox) {
      // Firefox supports Widevine
      config.type = 'Widevine' as const;
      logDebug('Setting DRM type to Widevine for Firefox');
    }
    // Note: iOS/FairPlay detection should be added here if needed

    logDebug(`DRM config: isAndroid=${isAndroid}, encryption=${encryptionMode}, robustness=${videoConfig.robustness}, mediaBufferMs=${mediaBufferMs}`);
    logDebug(`[Callback Auth] Merchant: ${merchantId}`);
    logDebug(`[Callback Auth] DRMtoday License Server: ${env.baseUrl()}`);
    logDebug(`[Callback Auth] DRMtoday will call your backend at: ${import.meta.env.VITE_DRM_BACKEND_URL}/api/callback`);
    logDebug(`[Callback Auth] UserId: ${options.userId || 'elidev-test'}`);
    logDebug('[Callback Auth] Mode: ENABLED - Backend provides CRT (no client-side authToken)');

    configRef.current = config;

    // Attach error listener for debugging
    const onDrmError = (e: Event) => {
      const errorMsg = (e as CustomEvent).detail?.message || 'Unknown DRM error';
      logDebug(`DRM ERROR: ${errorMsg}`);
      logError('[DRM] DRM Error Event: ' + errorMsg);
    };
    options.videoElement.removeEventListener('rtcdrmerror', onDrmError);
    options.videoElement.addEventListener('rtcdrmerror', onDrmError);

    // Add diagnostic video/audio element event listeners
    const videoElement = options.videoElement;
    const audioElement = options.audioElement;
    
    for (const evName of ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'error', 'emptied', 'suspend']) {
      videoElement.addEventListener(evName, () => logDebug(`video event: ${evName}`));
      if (audioElement) {
        audioElement.addEventListener(evName, () => logDebug(`audio event: ${evName}`));
      }
    }
    videoElement.addEventListener('error', () => {
      const e = videoElement.error;
      logDebug(`video MediaError: code=${e?.code}, message=${e?.message}`);
    });

    try {
      rtcDrmConfigure(config);
      logDebug('rtcDrmConfigure succeeded - License request sent to DRMtoday, waiting for callback...');
    } catch (err: any) {
      logDebug(`rtcDrmConfigure FAILED: ${err.message}`);
      console.error('[DRM-HOOK] rtcDrmConfigure failed:', err);
      throw err;
    }

    return config;
  }, []);

  const handleTrack = useCallback((event: RTCTrackEvent) => {
    logDebug(`Track received: ${event.track.kind}`);
    if (configRef.current) {
      try {
        // Call rtcDrmOnTrack without config arg — single-stream mode, matches whep behavior.
        // The library uses the config stored internally from rtcDrmConfigure.
        rtcDrmOnTrack(event);
        
        // After the DRM library processes the track, try to start playback
        const videoElement = configRef.current.videoElement;
        const audioElement = configRef.current.audioElement;
        
        if (event.track.kind === 'video' && videoElement) {
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => logDebug('videoElement.play() resolved'))
              .catch(err => {
                // Only log non-abort errors  
                if (err.name !== 'AbortError') {
                  logDebug(`videoElement.play() rejected: ${err.message}`);
                }
              });
          }
        } else if (event.track.kind === 'audio' && audioElement) {
          const playPromise = (audioElement as HTMLAudioElement).play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => logDebug('audioElement.play() resolved'))
              .catch(err => {
                if (err.name !== 'AbortError') {
                  logDebug(`audioElement.play() rejected: ${err.message}`);
                }
              });
          }
        }
      } catch (err: any) {
        logDebug(`rtcDrmOnTrack FAILED: ${err.message}`);
        console.error('[DRM-HOOK] rtcDrmOnTrack failed:', err);
        throw err;
      }
    }
  }, []);

  return {
    setup,
    handleTrack,
    config: configRef.current
  };
}