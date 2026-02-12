import React, { useRef, useState, useEffect } from 'react';
import { useWhep } from '../hooks/useWhep';
import { rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments } from '../lib/rtc-drm-transform.min.js';
import { hexToUint8Array } from '../lib/drmUtils';
import { DebugPanel } from './DebugPanel';

export interface PlayerProps {
  endpoint: string;
  merchant?: string;
  userId?: string;  // Required for Callback Authorization
  encrypted?: boolean;
  isEmbedMode?: boolean;  // If true, disables debug logs and makes fullscreen
  onOpenEmbed?: () => void;  // Callback for opening embed player
}

const DEBUG_PANEL_ID = 'player-debug';

/**
 * Check if Encrypted Media Extensions (EME) are available.
 * In cross-origin iframes, EME is blocked unless the parent <iframe> element
 * includes allow="encrypted-media" in its attributes.
 */
function checkEmeAvailability(logDebug: (msg: string) => void): Promise<{ available: boolean; reason?: string }> {
  const isInIframe = window.self !== window.top;

  if (!navigator.requestMediaKeySystemAccess) {
    return Promise.resolve({ available: false, reason: 'Your browser does not support Encrypted Media Extensions (EME). DRM playback is not possible.' });
  }

  // Probe EME with a minimal config to verify the permission is delegated
  // Platform detection for DRM scheme selection
  const uaHasIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  const uaHasAndroid = /Android/i.test(navigator.userAgent);
  const uaHasSafari = /Safari/i.test(navigator.userAgent);
  
  // IMPORTANT: iOS devices (including Safari, Chrome, Firefox) ONLY support FairPlay
  // They do NOT support Widevine at all
  const isIOS = uaHasIOS;
  const isAndroid = uaHasAndroid;
  
  // Select probe config and key systems based on platform
  let probeConfigs: MediaKeySystemConfiguration[];
  let keySystems: string[];
  
  if (isIOS) {
    // iOS: ONLY FairPlay!
    probeConfigs = [{
      // FairPlay config for ALL iOS browsers (Safari, Chrome, Firefox on iOS)
      initDataTypes: ['cenc', 'cbcs', 'sinf', 'webm'],
      videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
      audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
    }];
    // Try FairPlay only (Safari 10+: com.apple.fps.1_0, Safari 11+: com.apple.fps)
    keySystems = ['com.apple.fps.1_0', 'com.apple.fps'];
    logDebug('iOS detected - will ONLY try FairPlay key systems');
  } else if (isAndroid) {
    // Android: Widevine L1/L3
    probeConfigs = [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: '' }]
    }];
    keySystems = ['com.widevine.alpha', 'com.microsoft.playready.recommendation'];
    logDebug('Android detected - will try Widevine first, then PlayReady');
  } else {
    // Desktop (Windows/macOS/Linux): Widevine then PlayReady
    // macOS Safari may also support FairPlay
    if (uaHasSafari) {
      // Safari on macOS: Try FairPlay first, then Widevine
      probeConfigs = [{
        initDataTypes: ['cenc', 'cbcs', 'sinf', 'webm'],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
      }];
      keySystems = ['com.apple.fps.1_0', 'com.apple.fps', 'com.widevine.alpha', 'com.microsoft.playready.recommendation'];
      logDebug('Safari on macOS detected - will try FairPlay first, then Widevine');
    } else {
      // Chrome/Edge on Windows/Linux: Widevine then PlayReady
      probeConfigs = [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: '' }]
      }];
      keySystems = ['com.widevine.alpha', 'com.microsoft.playready.recommendation'];
      logDebug('Desktop detected (Chrome/Edge) - will try Widevine first, then PlayReady');
    }
  }

  for (const ks of keySystems) {
    try {
      logDebug(`Trying key system: ${ks}`);
      return navigator.requestMediaKeySystemAccess(ks, probeConfigs).then(() => {
        logDebug(`✓ Key system ${ks} is available`);
        return { available: true };
      });
    } catch (e: any) {
      // NotAllowedError = Permissions-Policy blocked (iframe without allow="encrypted-media")
      if (e.name === 'NotAllowedError') {
        const msg = isInIframe
          ? 'DRM is blocked because the iframe is missing the "encrypted-media" permission. '
            + 'The embedding page must use: <iframe allow="encrypted-media; autoplay" ...>'
          : 'DRM is blocked by browser permissions policy. Ensure encrypted-media is allowed.';
        logDebug(`EME blocked (${ks}): ${e.name} — ${e.message}`);
        return Promise.resolve({ available: false, reason: msg });
      }
      // NotSupportedError = this key system isn't available, try the next one
    }
  }

  // None of the key systems are supported at all
  return Promise.resolve({
    available: false,
    reason: isInIframe
      ? 'No supported DRM key system found. If this player is in an iframe, make sure the parent uses: <iframe allow="encrypted-media; autoplay" ...>'
      : 'No supported DRM key system found in this browser.'
  });
}

export const Player: React.FC<PlayerProps> = ({ endpoint, merchant, userId, encrypted, isEmbedMode = false, onOpenEmbed }) => {
  console.log('Player Props Endpoint:', endpoint);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { isConnected, isConnecting, error, connect, disconnect } = useWhep();
  
  // Auto-unmute in embed mode for seamless playback - MUTE by default for mobile autoplay
  const [isMuted, setIsMuted] = useState(isEmbedMode ? true : true);
  const [drmError, setDrmError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const isProduction = import.meta.env.VITE_NODE_ENV === 'production';
  
  // Check if running on iOS for mobile-specific debugging
  const isMobileIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);

  // Enable debug logging for all modes (needed for mobile iOS testing)
  const broadcastDebugEvent = (detail: { id: string; level: 'info' | 'error' | 'warning'; message: string }) => {
    const event = new CustomEvent('debug-log', {
      detail: {
        ...detail,
        timestamp: new Date().toLocaleTimeString()
      } as any
    }) as any;
    window.dispatchEvent(event);
  };

  const logDebug = (...args: any[]) => {
    console.log(...args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'info', message });
  };

  const logError = (...args: any[]) => {
    console.error(...args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'error', message });
  };

  const logWarning = (...args: any[]) => {
    console.warn(...args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'warning', message });
  };

  // Auto-show debug panel on iOS for testing
  useEffect(() => {
    if (isMobileIOS && !isProduction) {
      setShowDebugPanel(true);
      logDebug('iOS detected - Debug panel auto-enabled for testing');
    }
  }, [isMobileIOS, isProduction]);

  useEffect(() => {
    console.log('[Player] isMuted changed to:', isMuted);
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      console.log('[Player] Video muted set to:', videoRef.current.muted);
    }
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      if (!isMuted) {
        audioRef.current.volume = 1.0;
        audioRef.current.play().catch(e => console.warn('[Player] Auto-play failed on unmute:', e.message));
      }
      console.log('[Player] Audio muted set to:', audioRef.current.muted, 'volume:', audioRef.current.volume);
    }
  }, [isMuted]);

  // Toggle fullscreen mode using Fullscreen API with CSS fallback for iframe compatibility
  const toggleFullscreen = async () => {
    if (!videoContainerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('[Player] Fullscreen error:', err);
      // Fallback: toggle CSS-based fullscreen for iframe compatibility
      setIsFullscreen(!isFullscreen);
    }
  };

  // Listen for fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-connect and auto-fullscreen if in embed mode (for iframe embedding)
  useEffect(() => {
    if (isEmbedMode) {
      console.log('[Player] Auto-connecting and entering fullscreen mode...', { isEmbedMode, endpoint });
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        console.log('[Player] Calling handleConnect...');
        handleConnect();
        setIsFullscreen(true); // Auto-enter fullscreen
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [endpoint]);

  // Watch for connection state changes and ensure stream is assigned to video element
  useEffect(() => {
    if (isConnected && videoRef.current) {
      console.log('[Player] Connected - ensuring video is playing');

      // Check if video is already playing
      if (videoRef.current.paused) {
        console.log('[Player] Video is paused, attempting to play');
        const playPromise = videoRef.current.play();

        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('[Player] Video play() succeeded');
          }).catch((e) => {
            console.warn('[Player] Video play() failed:', e.name, e.message);
            // Try again with unmute if it's an autoplay policy issue
            if (e.name === 'NotAllowedError') {
              console.log('[Player] Autoplay blocked - video may require user interaction');
              if (videoRef.current) {
                videoRef.current.muted = false;
                setIsMuted(false);
                // Try play again after unmute
                setTimeout(() => {
                  if (videoRef.current && videoRef.current.paused) {
                    videoRef.current.play().catch(e2 => console.warn('[Player] Second play attempt failed:', e2.message));
                  }
                }, 100);
              }
            }
          });
        }
      } else {
        console.log('[Player] Video is already playing');
      }

      // Also ensure audio is playing
      if (audioRef.current) {
        console.log('[Player] Connected - ensuring audio is playing');
        if (audioRef.current.paused) {
          console.log('[Player] Audio is paused, attempting to play');
          audioRef.current.volume = 1.0;
          audioRef.current.playbackRate = 1.0;  // Fix chipmunk sound
          audioRef.current.play()
            .then(() => {
              console.log('[Player] Audio play() succeeded');
              console.log('[Player] Audio playbackRate:', audioRef.current?.playbackRate);
            })
            .catch((e) => console.warn('[Player] Audio play() failed:', e.name, e.message));
        } else {
          console.log('[Player] Audio is already playing');
          audioRef.current.playbackRate = 1.0;  // Ensure correct rate
        }
        console.log('[Player] Audio volume:', audioRef.current.volume, 'muted:', audioRef.current.muted);
      }
    }
  }, [isConnected]);

  // Track when video is actually playing
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    const handleVideoPlaying = () => {
      console.log('[Player] Video is now playing');
      setIsPlaying(true);
    };

    const handleAudioPlaying = () => {
      console.log('[Player] Audio is now playing');
      setIsPlaying(true);
    };

    const handleVideoPause = () => {
      console.log('[Player] Video paused');
      setIsPlaying(false);
    };

    const handleAudioPause = () => {
      console.log('[Player] Audio paused');
      setIsPlaying(false);
    };

    const handleWaiting = () => {
      console.log('[Player] Waiting for data');
      setIsPlaying(false);
    };

    const handleEnded = () => {
      console.log('[Player] Video/audio ended');
      setIsPlaying(false);
    };

    video.addEventListener('playing', handleVideoPlaying);
    video.addEventListener('pause', handleVideoPause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('ended', handleEnded);

    if (audio) {
      audio.addEventListener('playing', handleAudioPlaying);
      audio.addEventListener('pause', handleAudioPause);
      audio.addEventListener('waiting', handleWaiting);
      audio.addEventListener('ended', handleEnded);
    }

    // Reset playing state when disconnected
    if (!isConnected) {
      setIsPlaying(false);
    }

    return () => {
      video.removeEventListener('playing', handleVideoPlaying);
      video.removeEventListener('pause', handleVideoPause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('ended', handleEnded);
      if (audio) {
        audio.removeEventListener('playing', handleAudioPlaying);
        audio.removeEventListener('pause', handleAudioPause);
        audio.removeEventListener('waiting', handleWaiting);
        audio.removeEventListener('ended', handleEnded);
      }
    };
  }, [isConnected]);

  // Extra monitoring for embed mode - ensure video stays playing
  useEffect(() => {
    if (!isEmbedMode || !isConnected) return;
    
    const video = videoRef.current;
    if (!video) return;
    
    console.log('[Embed Mode] Setting up video monitoring');
    
    const checkVideo = setInterval(() => {
      if (video.paused) {
        console.log('[Embed Mode] Video paused unexpectedly, restarting...');
        video.play().catch(e => console.warn('[Embed Mode] Play failed:', e.message));
      }
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        if (stream.getVideoTracks().length > 0) {
          const track = stream.getVideoTracks()[0];
          console.log('[Embed Mode] Video track:', track.label, 'readyState:', track.readyState);
        }
      } else {
        console.log('[Embed Mode] WARNING: video has no srcObject');
      }
    }, 2000);
    
    return () => clearInterval(checkVideo);
  }, [isConnected, isEmbedMode]);

  const configureDrm = async (pc: RTCPeerConnection) => {
    // Early check: verify EME is available (catches iframe permission issues)
    if (encrypted) {
      logDebug('DRM Encrypted Playback Mode ENABLED');
      const emeCheck = await checkEmeAvailability(logDebug);
      if (!emeCheck.available) {
        const errMsg = emeCheck.reason || 'EME unavailable';
        logError(`EME check failed: ${errMsg}`);
        setDrmError(errMsg);
        throw new Error(errMsg);
      }
      logDebug('EME availability check passed');
    } else {
      logWarning('DRM Encrypted Playback Mode DISABLED - Playing unencrypted stream');
    }
    const keyId = hexToUint8Array(import.meta.env.VITE_DRM_KEY_ID);
    const iv = hexToUint8Array(import.meta.env.VITE_DRM_IV);

    // Validate IV and KeyId for FairPlay (iOS)
    // FairPlay requires 16-byte (128-bit) IV and KeyId
    if (keyId.length !== 16) {
      const err = `Invalid KeyId length: ${keyId.length} bytes. Expected 16 bytes (128-bit) for FairPlay.`;
      logError(err);
      throw new Error(err);
    }
    if (iv.length !== 16) {
      const err = `Invalid IV length: ${iv.length} bytes. Expected 16 bytes (128-bit) for FairPlay.`;
      logError(err);
      throw new Error(err);
    }
    
    logDebug(`✓ IV validation: ${iv.length} bytes (valid for FairPlay)`);
    logDebug(`✓ KeyId validation: ${keyId.length} bytes (valid for FairPlay)`);

    // Platform detection (same as whep)
    const uad = (navigator as any).userAgentData;
    const platform = uad?.platform || navigator.platform || '';
    const isMobile = uad?.mobile === true;
    
    // Firefox reports all devices as "Linux" for privacy, so we need to detect it via userAgent
    // and also check for Android in userAgent before checking platform
    const uaHasAndroid = /Android/i.test(navigator.userAgent);
    const uaHasFirefox = /Firefox/i.test(navigator.userAgent);
    const uaHasMobile = /Mobile|Tablet/i.test(navigator.userAgent);
    const uaHasIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
    // NOTE: Chrome on iOS (CriOS) uses Safari's WebKit engine and only supports FairPlay
    const uaHasSafari = /Safari/i.test(navigator.userAgent);
    
    // Android detection: prioritize userAgent over platform (Firefox/Chrome on Android)
    const isAndroid = uaHasAndroid || 
                      platform.toLowerCase() === 'android' ||
                      (isMobile && /linux/i.test(platform));
    
    // iOS detection - ALL iOS browsers (including Chrome/CriOS) use FairPlay only
    const isIOS = uaHasIOS;
    const isSafari = uaHasSafari; // Only used for desktop Safari on macOS
    
    // Firefox detection: check userAgent (works cross-platform)
    const isFirefox = uaHasFirefox;
    
    // Windows detection (for non-Firefox browsers)
    const isWindows = !isFirefox && (/windows/i.test(platform) || /Win/i.test(navigator.userAgent));
    
    let detectedPlatform: string;
    let drmScheme: string;
    
    if (isIOS) {
      detectedPlatform = 'iOS';
      drmScheme = 'FAIRPLAY (com.apple.fps)';
    } else if (isAndroid) {
      detectedPlatform = 'Android';
      drmScheme = 'WIDEVINE_MODULAR (com.widevine.alpha)';
    } else if (isWindows) {
      detectedPlatform = 'Windows';
      drmScheme = 'WIDEVINE_MODULAR or PLAYREADY';
    } else if (isFirefox) {
      detectedPlatform = 'Firefox (Linux/Other)';
      drmScheme = 'WIDEVINE_MODULAR (com.widevine.alpha)';
    } else if (isSafari && !isIOS) {
      detectedPlatform = 'macOS Safari';
      drmScheme = 'FAIRPLAY or WIDEVINE_MODULAR';
    } else {
      detectedPlatform = platform || 'Unknown';
      drmScheme = 'WIDEVINE_MODULAR (com.widevine.alpha)';
    }
    
    logDebug(`Platform detection: platform="${platform}", uad.mobile=${uad?.mobile}, uaHasAndroid=${uaHasAndroid}, ios=${isIOS}, safari=${isSafari}, isAndroid=${isAndroid}, isFirefox=${isFirefox}, uaHasMobile=${uaHasMobile}`);
    logDebug(`Detected platform: ${detectedPlatform}`);
    logDebug(`Will use DRM scheme: ${drmScheme}`);

    const params = new URLSearchParams(window.location.search);
    const robustnessOverride = params.get('robustness')?.toUpperCase();

    let androidRobustness = 'SW';
    if (isAndroid) {
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
          initDataTypes: ['cenc'],
          videoCapabilities: [{
            contentType: 'video/mp4; codecs="avc1.42E01E"',
            robustness: 'HW_SECURE_ALL'
          }]
        }]);
        androidRobustness = 'HW';
        logDebug('Widevine L1 (HW_SECURE_ALL) is supported on this device');
      } catch {
        logDebug('Widevine L1 (HW) NOT supported — falling back to SW');
        androidRobustness = 'SW';
      }
    }

    if (robustnessOverride === 'HW' || robustnessOverride === 'SW') {
      androidRobustness = robustnessOverride;
      logDebug(`Robustness overridden via URL param: ${robustnessOverride}`);
    }

    // Media buffer sizing - BASED ON OFFICIAL DOCUMENTATION RECOMMENDATIONS:
    // From castLabs SDK changelog and integration guide:
    // - Firefox: 900ms minimum (v2.5.1 required to prevent stuttering)
    // - Windows PlayReady/Widevine SW: 600ms minimum
    // - Windows PlayReady/Widevine HW: 1200ms minimum
    // - iOS/Safari (FairPlay): 600ms minimum
    // - Android HW (Widevine L1): 1200ms minimum
    // - Android SW (Widevine L3): 600ms minimum
    // - Default (other browsers): 100ms
    let mediaBufferMs = -1;
    if (isIOS || isSafari) {
      // iOS/Safari with FairPlay
      mediaBufferMs = 600;
      logDebug(`Set mediaBufferMs=600 for iOS/Safari (FairPlay, documentation recommended)`);
    } else if (isFirefox) {
      // Firefox specifically needs 900ms minimum to prevent stuttering
      // From client-sdk-changelog.md v2.5.1
      mediaBufferMs = 900;
      logDebug(`Set mediaBufferMs=900 for Firefox (documentation recommended)`);
    } else if (isAndroid) {
      // Android follows same requirements as Windows:
      // - HW (Widevine L1): 1200ms minimum
      // - SW (Widevine L3): 600ms minimum
      if (androidRobustness === 'HW') {
        mediaBufferMs = 1200;
        logDebug(`Set mediaBufferMs=1200 for Android HW (Widevine L1, documentation minimum)`);
      } else {
        mediaBufferMs = 600;
        logDebug(`Set mediaBufferMs=600 for Android SW (Widevine L3, documentation minimum)`);
      }
    } else if (isWindows) {
      // Windows PlayReady/Widevine requirements from client-integration-guide.md:
      // - SW-secure: 600ms minimum
      // - HW-secure: 1200ms minimum
      // Default to SW-secure for Edge/Chrome on Windows
      mediaBufferMs = 600;
      logDebug(`Set mediaBufferMs=600 for Windows (playback minimum from documentation)`);
    } else {
      // Default for other browsers (Chrome/Edge on macOS/Linux, etc.)
      // Default value is 100ms per documentation
      mediaBufferMs = 100;
      logDebug(`Set mediaBufferMs=100 (default per documentation)`);
    }

    // FairPlay on iOS doesn't support 'robustness' property like Widevine
    // Desktop Safari on macOS may support Widevine as well
    const robustness = isIOS ? undefined : (isAndroid ? androidRobustness : 'SW' as 'HW' | 'SW');
    
    const encryptionType = 'cbcs' as const; // Same for all platforms

    // IMPORTANT: FairPlay on iOS REQUIRES the IV (initialization vector)
    // The IV must be 16 bytes and should match what the broadcaster is using
    logDebug(`Initializing DRM configuration with IV: ${Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')}`);
    logDebug(`KeyId: ${Array.from(keyId).map(b => b.toString(16).padStart(2, '0')).join('')}`);
    
    if (isIOS) {
      logDebug(`✓ FairPlay on iOS: IV is REQUIRED and will be used for decryption`);
      logDebug(`✓ FairPlay on iOS: Using ${encryptionType} encryption scheme`);
    } else {
      logDebug(`✓ Non-iOS platform: IV will be used with ${encryptionType} encryption`);
    }

    const video = {
      codec: 'H264' as const,
      encryption: encryptionType,
      robustness: robustness as 'HW' | 'SW' | undefined,
      keyId,
      iv
    };

    // CALLBACK AUTHORIZATION MODE
    // With Callback Authorization, DRMtoday calls our backend at /api/callback
    // to get the CRT. We don't need to generate authToken or sessionId client-side.
    // Just pass: merchant, userId, and environment.
    logDebug('Using Callback Authorization - backend will provide CRT');

    const videoElement = videoRef.current!;
    const audioElement = audioRef.current!;

    const drmConfig = {
      merchant: merchant || import.meta.env.VITE_DRM_MERCHANT,
      userId: userId || 'elidev-test',  // Required for Callback Authorization
      environment: rtcDrmEnvironments.Staging,
      videoElement,
      audioElement,
      video,
      // iOS devices (including Safari, Chrome, Firefox on iOS) use FairPlay with AAC audio
      // FairPlay requires 'clear' audio encryption, not opus
      // Android/Windows/Linux use opus codec
      audio: isIOS 
        ? { codec: 'mp4a.40.2' as any, encryption: 'clear' as const } 
        : { codec: 'opus' as const, encryption: 'clear' as const },
      logLevel: 3,
      mediaBufferMs  // Ultra-low latency buffer for smooth streaming
    };

    // Event listeners (same as whep)
    for (const evName of ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'error', 'emptied', 'suspend']) {
      videoElement.addEventListener(evName, () => logDebug(`video event: ${evName}`));
      audioElement.addEventListener(evName, () => logDebug(`audio event: ${evName}`));
    }
    videoElement.addEventListener('error', () => {
      const e = videoElement.error;
      logDebug(`video MediaError: code=${e?.code}, message=${e?.message}`);
    });

    videoElement.addEventListener('rtcdrmerror', (event: any) => {
      const msg = event.detail?.message || 'Unknown DRM error';
      logDebug(`DRM ERROR: ${msg}`);

      // output-restricted / output-downscaled are non-fatal in many cases —
      // the CDM may still allow playback. Only show a fatal overlay for errors
      // that truly block decryption (e.g. expired, internal-error, not-allowed).
      const isOutputIssue = msg.includes('output-restricted') || msg.includes('output-downscaled');
      if (isOutputIssue) {
        logDebug('[DRM] output-restricted/downscaled detected — treating as warning, not fatal');
        console.warn('[DRM]', msg);
        return; // don't block the UI
      }

      // Frame gap errors are common in real-time streaming - treat as warning, not fatal
      // The library will recover automatically
      const isFrameGap = msg.includes('Frame gap') || msg.includes('Duplicate/reordered frame');
      if (isFrameGap) {
        logDebug('[DRM] Frame gap detected - library will auto-recover');
        return; // don't block the UI, let the library handle it
      }

      const isInIframe = window.self !== window.top;
      if (isInIframe && msg.includes('not-allowed')) {
        const iframeHint = 'DRM blocked inside iframe. '
          + 'The parent page must embed with: <iframe allow="encrypted-media; autoplay" ...>';
        logDebug(iframeHint);
        setDrmError(iframeHint);
      } else {
        setDrmError(`DRM error: ${msg}`);
      }
    });

    const keyIdHex = Array.from(keyId).map(b => b.toString(16).padStart(2, '0')).join('');
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    
    logDebug(`╔════════════════════════════════════════════════════════════════════════════════╗`);
    logDebug(`║ DRM CONFIGURATION                                                            ║`);
    logDebug(`╠════════════════════════════════════════════════════════════════════════════════╣`);
    logDebug(`║ Platform:         ${detectedPlatform.padEnd(35)} ║`);
    logDebug(`║ DRM Scheme:       ${drmScheme.padEnd(35)} ║`);
    logDebug(`║ Audio Codec:      ${(isIOS ? 'mp4a.40.2 (AAC)' : 'opus').padEnd(35)} ║`);
    logDebug(`║ Video Codec:      ${video.codec.padEnd(35)} ║`);
    logDebug(`║ Encryption:       ${video.encryption.padEnd(35)} ║`);
    logDebug(`║ Robustness:       ${String(video.robustness || 'N/A').padEnd(35)} ║`);
    logDebug(`║ Media Buffer:     ${mediaBufferMs + 'ms'.padEnd(35)} ║`);
    logDebug(`╠════════════════════════════════════════════════════════════════════════════════╣`);
    if (isIOS) {
      logDebug(`║ ★ IV (REQUIRED):   ${ivHex.padEnd(35)} ║`);
      logDebug(`║ ★ KeyId:          ${keyIdHex.padEnd(35)} ║`);
      logDebug(`║                                                                               ║`);
      logDebug(`║ ✅ FairPlay on iOS REQUIRES IV for decryption                              ║`);
    } else {
      logDebug(`║ IV:               ${ivHex.padEnd(35)} ║`);
      logDebug(`║ KeyId:            ${keyIdHex.padEnd(35)} ║`);
    }
    logDebug(`╠════════════════════════════════════════════════════════════════════════════════╣`);
    logDebug(`║ Merchant:         ${(merchant || import.meta.env.VITE_DRM_MERCHANT).padEnd(35)} ║`);
    logDebug(`║ Callback URL:     ${(import.meta.env.VITE_DRM_BACKEND_URL + '/api/callback')}`);
    logDebug(`║ User ID:          ${(userId || 'elidev-test').padEnd(35)} ║`);
    logDebug(`╚════════════════════════════════════════════════════════════════════════════════╝`);

    try {
      logDebug('Calling rtcDrmConfigure with:', {
        platform: isIOS ? 'iOS' : 'Desktop',
        audioCodec: drmConfig.audio.codec,
        videoCodec: drmConfig.video.codec,
        encryption: drmConfig.video.encryption,
        robustness: drmConfig.video.robustness
      });
      rtcDrmConfigure(drmConfig);
      logDebug('rtcDrmConfigure succeeded - License request sent to DRMtoday, waiting for callback...');
      console.log('[Player] DRM configuration successful, waiting for stream tracks...');
    } catch (err: any) {
      logDebug(`✗ rtcDrmConfigure FAILED: ${err.message}`);
      console.error('[Player] DRM configuration FAILED:', err);
      throw err;
    }

    pc.addEventListener('track', (event) => {
      logDebug(`Track received: ${event.track.kind}, enabled=${event.track.enabled}, readyState=${event.track.readyState}`);
      
      // iOS-specific diagnostic logging
      if (isIOS) {
        console.log('[iOS DRM] Track received:', {
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          muted: event.track.muted,
          label: event.track.label,
          settings: event.track.getSettings?.() || 'unavailable'
        });
      }
      
      try {
        rtcDrmOnTrack(event);
        logDebug(`✓ rtcDrmOnTrack succeeded for ${event.track.kind} - Stream DECRYPTED and processed`);
        console.log('[Player] DRM processed', event.track.kind, 'track successfully');
        
        // iOS-specific: Check if stream was assigned
        if (isIOS) {
          setTimeout(() => {
            const videoStream = videoRef.current?.srcObject as MediaStream;
            const audioStream = audioRef.current?.srcObject as MediaStream;
            console.log('[iOS DRM] After rtcDrmOnTrack:', {
              videoStream: !!videoStream,
              videoTracks: videoStream?.getVideoTracks?.().length || 0,
              audioStream: !!audioStream,
              audioTracks: audioStream?.getAudioTracks?.().length || 0,
              videoPlaying: !videoRef.current?.paused,
              audioPlaying: !audioRef.current?.paused
            });
          }, 500);
        }
        // Explicitly call play() after DRM processes the track (matches whep behavior)
        if (event.track.kind === 'video') {
          // Set isPlaying to true when video is ready
          setIsPlaying(true);
          videoElement.playbackRate = 1.0;  // Ensure video plays at normal speed
          videoElement.play()
            .then(() => {
              logDebug('videoElement.play() resolved');
              console.log('[Player] Video playing');
            })
            .catch((err: any) => logDebug(`videoElement.play() rejected: ${err.message}`));
        } else if (event.track.kind === 'audio') {
          // Set isPlaying to true when audio is ready
          setIsPlaying(true);
          audioElement.volume = 1.0;
          audioElement.playbackRate = 1.0;  // Fix chipmunk sound
          audioElement.play()
            .then(() => {
              logDebug('audioElement.play() resolved');
              console.log('[Player] Audio playing, volume:', audioElement.volume, 'muted:', audioElement.muted, 'playbackRate:', audioElement.playbackRate);
            })
            .catch((err: any) => logDebug(`audioElement.play() rejected: ${err.message}`));
        }
      } catch (err: any) {
        logDebug(`✗ rtcDrmOnTrack FAILED: ${err.message}`);
        console.error('[Player] Failed to process track:', err);
        logError(`DRM Error - The stream might NOT be encrypted or keys don't match: ${err.message}`);
      }
    });

    if (isIOS) {
      logDebug('========================================');
      logDebug('iOS DRM DIAGNOSTICS ENABLED');
      logDebug('========================================');
      
      // Periodic check for iOS to see if stream is playing
      const iosDiagInterval = setInterval(() => {
        const videoEl = videoRef.current;
        const audioEl = audioRef.current;
        if (videoEl && audioEl) {
          const vStream = videoEl.srcObject as MediaStream;
          const aStream = audioEl.srcObject as MediaStream;
          const vTracks = vStream?.getVideoTracks() || [];
          const aTracks = aStream?.getAudioTracks() || [];
          
          console.log('[iOS Diagnostics]', {
            videoStream: !!vStream,
            videoTracks: vTracks.length,
            videoTrackEnabled: vTracks[0]?.enabled,
            videoTrackReady: vTracks[0]?.readyState,
            videoPlaying: !videoEl.paused,
            audioStream: !!aStream,
            audioTracks: aTracks.length,
            audioTrackEnabled: aTracks[0]?.enabled,
            audioTrackReady: aTracks[0]?.readyState,
            audioPlaying: !audioEl.paused
          });
        }
      }, 3000);
      
      // Clean up interval after 30 seconds
      setTimeout(() => clearInterval(iosDiagInterval), 30000);
    }
  };

  const handleConnect = async () => {
    console.log('[Player] handleConnect called, encrypted:', encrypted, 'isEmbedMode:', isEmbedMode);
    await connect({
      endpoint,
      encrypted,
      configureDrm: encrypted ? configureDrm : undefined
    }, videoRef.current, audioRef.current);
  };



  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      audioRef.current.volume = !isMuted ? 1.0 : 0;
      audioRef.current.playbackRate = 1.0;  // Prevent chipmunk sound
    }
    setIsMuted(!isMuted);
  };

  return (
    <>
      {isEmbedMode ? (
        <>
          {/* Video element - autoplay muted for mobile compatibility */}
          <video
            ref={videoRef}
            className="fixed inset-0 w-full h-full object-cover bg-black z-0"
            autoPlay
            playsInline
            muted={isMuted}
            disablePictureInPicture
            disableRemotePlayback
            // Low-latency optimization attributes
            // @ts-ignore - preload is valid
            preload="auto"
            // @ts-ignore - controlsList is valid  
            controlsList="nodownload norotate nofullscreen noremoteplayback"
            // @ts-ignore - onLoadedMetadata type
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.volume = 1.0;
              }
            }}
          />
          {/* Hidden audio element for DRM (required by rtc-drm-transform library) */}
          <audio
            ref={audioRef}
            autoPlay
            playsInline
            muted={isMuted}
            style={{ display: 'none' }}
            // Note: crossCrossOrigin removed as it causes issues with FairPlay on iOS
            // @ts-ignore - onCanPlay type
            onCanPlay={() => {
              if (audioRef.current) {
                audioRef.current.volume = 1.0;
                audioRef.current.playbackRate = 1.0;  // Prevent chipmunk sound
                audioRef.current.play().catch(e => console.warn('[Audio] Auto-play failed on canPlay:', e.message));
                console.log('[Audio] Setup: volume=1.0, playbackRate=1.0');
              }
            }}
          />

          {/* Debug Toggle - Top left corner, visible on iOS and when explicitly toggled */}
          {(!isProduction || isMobileIOS) && (
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="fixed top-4 left-4 z-50 p-2 bg-black/60 backdrop-blur-sm text-white rounded-lg flex items-center gap-2 hover:bg-black/80 transition-colors border border-white/20"
              title={showDebugPanel ? "Hide Debug" : "Show Debug"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {showDebugPanel ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                )}
              </svg>
              <span className="text-xs font-medium">Debug</span>
            </button>
          )}

          {showDebugPanel && (
            <div 
              className="fixed top-16 left-4 right-4 bottom-auto max-h-80 z-40 bg-black/95 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <DebugPanel id={DEBUG_PANEL_ID} title="Debug Log" />
            </div>
          )}

          {/* Unmute Button - Only visible when loader is gone (stream is playing)
              In embed mode, show when connected and muted regardless of isPlaying state */}
          {isMuted && (isEmbedMode ? isConnected : isPlaying) && !isConnecting && !error && !drmError && (
            <button
              onClick={async () => {
                console.log('[Embed Player] Unmute button clicked');
                
                // First, ensure video is unmuted and playing
                if (videoRef.current) {
                  console.log('[Embed Player] Unmuting video, current muted:', videoRef.current.muted, 'volume:', videoRef.current.volume);
                  videoRef.current.muted = false;
                  videoRef.current.volume = 1.0;
                  
                  // Force video to play
                  if (videoRef.current.paused) {
                    console.log('[Embed Player] Video paused, forcing play');
                    videoRef.current.play().catch(e => console.error('[Embed Player] Video play failed:', e));
                  }
                  console.log('[Embed Player] Video unmuted, muted:', videoRef.current.muted, 'volume:', videoRef.current.volume);
                }
                
                // Then ensure audio element is also unmuted
                if (audioRef.current) {
                  console.log('[Embed Player] Unmuting audio, current muted:', audioRef.current.muted, 'volume:', audioRef.current.volume);
                  audioRef.current.muted = false;
                  audioRef.current.volume = 1.0;
                  audioRef.current.playbackRate = 1.0;
                  
                  // Force audio to play
                  if (audioRef.current.paused) {
                    console.log('[Embed Player] Audio paused, forcing play');
                    try {
                      await audioRef.current.play();
                      console.log('[Embed Player] Audio play succeeded');
                    } catch (e) {
                      console.error('[Embed Player] Audio play failed:', e);
                    }
                  } else {
                    console.log('[Embed Player] Audio already playing');
                  }
                  console.log('[Embed Player] Audio unmuted, muted:', audioRef.current.muted, 'volume:', audioRef.current.volume);
                }
                
                // Update state after everything is set up
                console.log('[Embed Player] Setting isMuted to false');
                setIsMuted(false);
                
                // Verify the state after a short delay
                setTimeout(() => {
                  console.log('[Embed Player] State check - isMuted:', isMuted, 'video muted:', videoRef.current?.muted, 'audio muted:', audioRef.current?.muted);
                }, 100);
              }}
              className="fixed bottom-4 right-4 z-30 px-4 py-2 bg-[#252525]/80 backdrop-blur-sm text-white rounded-lg flex items-center gap-2 hover:bg-[#333333] transition-colors cursor-pointer border border-[#404040]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
              <span className="text-sm font-medium">Unmute</span>
            </button>
          )}

          {/* Loading/Connecting Overlay - Shown when connecting OR connected but not yet playing */}
          {(isConnecting || (isConnected && !isPlaying)) && !error && !drmError && (
            <div className="fixed inset-0 flex items-center justify-center bg-[#141414]/95 z-20">
              <div className="flex flex-col items-center text-center p-8 max-w-md">
                <div className="relative w-20 h-20 mb-6">
                  {/* Outer spinning ring */}
                  <div className="absolute inset-0 border-4 border-[#404040] rounded-full"></div>
                  {/* Inner spinning ring */}
                  <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  {/* Center icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-white font-semibold text-xl mb-3">
                  {isConnected ? 'Loading Stream...' : 'Connecting...'}
                </h3>
                <p className="text-[#a0a0a0] text-sm">
                  {isConnected 
                    ? 'Buffering stream content. Please wait...'
                    : 'Please wait while we connect to the stream.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Idle Overlay - Shown when not connected, not connecting, and no error */}
          {!isConnected && !isConnecting && !error && !drmError && (
            <div className="fixed inset-0 flex items-center justify-center bg-[#141414]/95">
              <div className="flex flex-col items-center text-center p-8 max-w-md">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-[#252525] rounded-2xl mb-6 border border-[#404040]">
                  <svg className="w-10 h-10 text-[#a0a0a0] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-xl mb-3">Stream Offline</h3>
                <p className="text-[#a0a0a0] text-sm">
                  The broadcaster has not started the stream yet. Please wait for the stream to begin.
                </p>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {(error || drmError) && (
            <div className="fixed inset-0 flex items-center justify-center bg-[#141414]/95 z-20 p-4">
              <div className="flex flex-col items-center text-center p-6 sm:p-8 max-w-sm sm:max-w-md">
                <div className="inline-flex items-center justify-center w-12 sm:w-16 h-12 sm:h-16 bg-[#252525] rounded-xl sm:rounded-2xl mb-3 sm:mb-4 border border-red-500/30">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-base sm:text-xl mb-2">{drmError ? 'DRM Error' : 'Connection Error'}</h3>
                <p className="text-[#d0d0d0] text-xs sm:text-sm mb-4">{drmError || error}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Encryption disabled warning - hide in embed mode */}
          {!encrypted && !isEmbedMode && (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-amber-500 text-sm font-medium">Encryption Disabled</p>
                <p className="text-amber-400/70 text-xs">Stream will be played without DRM protection</p>
              </div>
            </div>
          )}

          {/* Responsive video container - adaptive aspect ratio */}
          <div className={`relative group w-full ${isEmbedMode || isFullscreen ? 'fixed inset-0 m-0 p-0 rounded-none bg-black z-50' : 'bg-[#1e1e1e] rounded-lg'}`}>
            {/* Video container - this goes fullscreen */}
            <div 
              ref={videoContainerRef}
              className={`${
                (isEmbedMode || isFullscreen)
                  ? 'fixed inset-0 bg-black' 
                  : ''
              }`}
              style={isEmbedMode || isFullscreen ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 } : {}}
            >
              {/* Fullscreen header */}
              {(isFullscreen || isEmbedMode) && (
                <div className="absolute top-0 left-0 right-0 z-30 p-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 pointer-events-auto">
                      {/* Unmute Button - Show when embedded and muted, or fullscreen and muted
                          In embed mode, show when connected and muted regardless of isPlaying state */}
                      {isMuted && (isEmbedMode ? isConnected : isPlaying) && !isConnecting && !error && !drmError && (
                        <button
                          onClick={async () => {
                            console.log('[Player] Fullscreen unmute button clicked');
                            if (videoRef.current) {
                              videoRef.current.muted = false;
                              videoRef.current.volume = 1.0;
                              console.log('[Player] Video unmuted (fullscreen)');
                            }
                            if (audioRef.current) {
                              audioRef.current.muted = false;
                              audioRef.current.volume = 1.0;
                              audioRef.current.playbackRate = 1.0;
                              try {
                                await audioRef.current.play();
                                console.log('[Player] Audio unmuted and playing (fullscreen)');
                              } catch (e) {
                                console.warn('[Player] Audio play failed:', e);
                              }
                            }
                            setIsMuted(false);
                            console.log('[Player] isMuted state set to false (fullscreen)');
                          }}
                          className="px-3 py-1.5 bg-[#252525] hover:bg-[#333333] text-white text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                          title="Click to unmute"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          </svg>
                          <span>Tap to unmute</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Video element - fills entire screen in fullscreen mode */}
              <div className={`${
                isEmbedMode || isFullscreen 
                  ? 'h-screen w-full' 
                  : 'aspect-video sm:aspect-video lg:aspect-video xl:aspect-[21/9] max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh] xl:max-h-[70vh]'
              }`}>
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                  muted={isMuted}
                  // Low-latency optimization attributes
                  // @ts-ignore - preload is valid
                  preload="auto"
                  // @ts-ignore - controlsList is valid
                  controlsList="nodownload norotate noremoteplayback"
                  // @ts-ignore - onLoadedMetadata type
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.volume = 1.0;
                    }
                  }}
                />
              </div>

              {/* Hidden audio element for DRM (required by rtc-drm-transform library) */}
              <audio
                ref={audioRef}
                autoPlay
                playsInline
                muted={isMuted}
                style={{ display: 'none' }}
                // Note: crossOrigin removed as it causes issues with FairPlay on iOS
                // @ts-ignore - onCanPlay type
                onCanPlay={() => {
                  if (audioRef.current) {
                    audioRef.current.volume = 1.0;
                    audioRef.current.playbackRate = 1.0;  // Prevent chipmunk sound
                    audioRef.current.play().catch(e => console.warn('[Audio] Auto-play failed on canPlay:', e.message));
                    console.log('[Audio] Setup: volume=1.0, playbackRate=1.0');
                  }
                }}
              />

              {/* Debug Toggle - Top right corner of video container */}
              {(!isProduction || isMobileIOS) && (
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className="absolute top-4 right-4 z-30 p-2 bg-black/60 backdrop-blur-sm text-white rounded-lg flex items-center gap-2 hover:bg-black/80 transition-colors border border-white/20"
                  title={showDebugPanel ? "Hide Debug" : "Show Debug"}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {showDebugPanel ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    )}
                  </svg>
                  <span className="text-xs font-medium">Debug</span>
                </button>
              )}

              {showDebugPanel && (
                <div 
                  className="absolute top-16 left-4 right-4 bottom-auto max-h-80 z-30 bg-black/95 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DebugPanel id={DEBUG_PANEL_ID} title="Debug Log" />
                </div>
              )}

              {/* Error Overlay */}
              {(error || drmError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-20">
                  <div className="p-4 sm:p-6 bg-[#1e1e1e]/90 border border-[#404040] rounded-lg text-center max-w-sm mx-4 backdrop-blur-sm">
                    <div className="inline-flex items-center justify-center w-10 sm:w-12 h-10 sm:h-12 bg-[#252525] rounded-xl mb-3 border border-red-500/30">
                      <svg className="w-5 sm:w-6 h-5 sm:h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-bold text-sm sm:text-lg mb-2">{drmError ? 'DRM Error' : 'Connection Error'}</h3>
                    <p className="text-[#d0d0d0] text-xs sm:text-sm mb-4">{drmError || error}</p>
                    {drmError && window.self !== window.top && (
                      <p className="text-[#a0a0a0] text-xs mb-4 font-mono bg-[#252525]/60 p-2 rounded">
                        &lt;iframe allow="encrypted-media; autoplay" ...&gt;
                      </p>
                    )}
                    <button
                      onClick={() => { setDrmError(null); handleConnect(); }}
                      className="px-4 py-2 bg-white text-[#141414] hover:bg-[#e5e5e5] font-semibold rounded transition-colors shadow-lg cursor-pointer min-h-[44px]"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Connecting Overlay */}
              {isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/50 z-10 pointer-events-none">
                  <div className="flex flex-col items-center">
                    <div className="w-8 sm:w-10 h-8 sm:h-10 border-4 border-[#a0a0a0] border-t-transparent rounded-full animate-spin mb-2"></div>
                    <span className="text-white font-medium text-sm sm:text-base">Connecting...</span>
                  </div>
                </div>
              )}

              {/* Idle Overlay - Shown when not connected, not connecting, and no error */}
              {!isConnected && !isConnecting && !error && !drmError && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 pointer-events-none">
                  <div className="flex flex-col items-center text-center p-4 sm:p-8">
                    <div className="inline-flex items-center justify-center w-12 sm:w-16 h-12 sm:h-16 bg-[#252525] rounded-xl sm:rounded-2xl mb-3 sm:mb-4 border border-[#404040]">
                      <svg className="w-6 sm:w-8 h-6 sm:h-8 text-[#a0a0a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-semibold text-sm sm:text-lg mb-2">Not Connected</h3>
                    <p className="text-[#a0a0a0] text-xs sm:text-sm max-w-xs">Click "Connect" to start viewing the stream</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controls Bar - Below the video player - hidden in embed mode */}
          {!isEmbedMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#1e1e1e] rounded-lg border border-[#333333]">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Connect/Disconnect Button */}
                {!isConnected ? (
                  <button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className={`px-4 py-2.5 sm:py-3 text-[#141414] rounded-lg font-medium transition-all shadow-lg cursor-pointer min-h-[48px] ${
                      isConnecting
                        ? 'bg-[#404040] cursor-not-allowed opacity-75'
                        : 'bg-white hover:bg-[#e5e5e5] hover:scale-105 active:scale-95'
                    }`}
                  >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <button
                    onClick={() => disconnect()}
                    className="px-4 py-2.5 sm:py-3 bg-white hover:bg-[#e5e5e5] text-[#141414] rounded-lg font-medium transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer min-h-[48px]"
                  >
                    Disconnect
                  </button>
                )}

                {/* Live Indicator */}
                <div className="flex items-center gap-2 bg-[#252525] px-3 py-1.5 rounded-full border border-[#404040]">
                  <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-white/50'}`}></span>
                  <span className="text-white text-xs sm:text-sm font-medium tracking-wide">
                    {isConnected ? 'LIVE' : 'OFFLINE'}
                  </span>
                </div>

                {/* Open Embed Button - Outline style */}
                {!isEmbedMode && onOpenEmbed && (
                  <button
                    onClick={onOpenEmbed}
                    className="px-3 py-1.5 border border-white/30 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    title="Open in embed player"
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>Embed</span>
                  </button>
                )}
              </div>

              {/* Right side controls */}
              <div className="flex items-center gap-2">
                {/* Fullscreen Button */}
                {!isEmbedMode && (
                  <button
                    onClick={toggleFullscreen}
                    className="p-2.5 bg-[#252525] hover:bg-[#333333] text-white rounded-lg border border-[#404040] transition-colors cursor-pointer min-w-[48px] min-h-[48px] flex items-center justify-center"
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? (
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    )}
                  </button>
                )}

                {/* Mute Button */}
                <button
                  onClick={toggleMute}
                  className="p-2.5 bg-[#252525] hover:bg-[#333333] text-white rounded-lg border border-[#404040] transition-colors cursor-pointer min-w-[48px] min-h-[48px] flex items-center justify-center"
                  title={isMuted ? 'Unmute' : 'Mute'}
                  aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                >
                  {isMuted ? (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Debug Panel - Below the video player - Hidden in production and embed mode */}
          {!isProduction && !isEmbedMode && <DebugPanel id={DEBUG_PANEL_ID} title="Player Debug Log" />}
        </div>
      )}
    </>
  );
};
