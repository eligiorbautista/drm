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
  const probeConfigs: MediaKeySystemConfiguration[] = [{
    initDataTypes: ['cenc'],
    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: '' }]
  }];

  // Try Widevine first (Chrome/Edge/Android), then FairPlay (Safari), then PlayReady (Edge)
  const keySystems = ['com.widevine.alpha', 'com.apple.fps.1_0', 'com.microsoft.playready.recommendation'];

  for (const ks of keySystems) {
    try {
      return navigator.requestMediaKeySystemAccess(ks, probeConfigs).then(() => ({ available: true }));
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

export const Player: React.FC<PlayerProps> = ({ endpoint, merchant, userId, encrypted, isEmbedMode = false }) => {
  console.log('Player Props Endpoint:', endpoint);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isConnected, isConnecting, error, connect, disconnect } = useWhep();
  const [isMuted, setIsMuted] = useState(isEmbedMode ? false : true);
  const [drmError, setDrmError] = useState<string | null>(null);
  const [wasConnected, setWasConnected] = useState(false);
  const isProduction = import.meta.env.VITE_NODE_ENV === 'production';

  // In embed mode, disable all logging for security and clean output
  const broadcastDebugEvent = isEmbedMode ? () => {} : (detail: { id: string; level: 'info' | 'error' | 'warning'; message: string }) => {
    const event = new CustomEvent('debug-log', {
      detail: {
        ...detail,
        timestamp: new Date().toLocaleTimeString()
      } as any
    }) as any;
    window.dispatchEvent(event);
  };

  const logDebug = isEmbedMode ? () => {} : (...args: any[]) => {
    console.log(...args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'info', message });
  };

  const logError = isEmbedMode ? () => {} : (...args: any[]) => {
    console.error(...args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'error', message });
  };

  const logWarning = isEmbedMode ? () => {} : (...args: any[]) => {
    console.warn(...args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'warning', message });
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Track if we were previously connected to detect interruptions
  useEffect(() => {
    if (isConnected) {
      setWasConnected(true);
    }
  }, [isConnected]);

  // Check if stream was interrupted (was connected, now disconnected with no error)
  const isInterrupted = wasConnected && !isConnected && !isConnecting && !error && !drmError;

  // Auto-connect on mount when in embed mode
  useEffect(() => {
    if (isEmbedMode) {
      console.log('[Embed Mode] Starting auto-connect...', { isConnected, isConnecting });
      // Use setTimeout to ensure refs are attached to DOM
      const timer = setTimeout(() => {
        console.log('[Embed Mode] Checking refs...', {
          videoRef: !!videoRef.current,
          audioRef: !!audioRef.current
        });
        if (videoRef.current && audioRef.current) {
          console.log('[Embed Mode] Calling handleConnect');
          handleConnect();
        } else {
          console.error('[Embed Mode] Refs not available, cannot connect');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedMode]);

  // Re-connect when encrypted prop changes in embed mode
  useEffect(() => {
    if (isEmbedMode) {
      console.log('[Embed Mode] Encryption setting changed ', { encrypted, isConnected, isConnecting });
      // Only reconnect if we have refs and we're not currently connecting
      if (videoRef.current && audioRef.current && !isConnecting) {
        const timer = setTimeout(() => {
          console.log('[Embed Mode] Re-connecting with new encryption setting: ', encrypted);
          handleConnect();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encrypted]);

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

    // Platform detection (same as whep)
    const uad = (navigator as any).userAgentData;
    const platform = uad?.platform || navigator.platform || '';
    const isMobile = uad?.mobile === true;
    
    // Firefox reports all devices as "Linux" for privacy, so we need to detect it via userAgent
    // and also check for Android in userAgent before checking platform
    const uaHasAndroid = /Android/i.test(navigator.userAgent);
    const uaHasFirefox = /Firefox/i.test(navigator.userAgent);
    const uaHasMobile = /Mobile|Tablet/i.test(navigator.userAgent);
    
    // Android detection: prioritize userAgent over platform (Firefox/Chrome on Android)
    const isAndroid = uaHasAndroid || 
                      platform.toLowerCase() === 'android' ||
                      (isMobile && /linux/i.test(platform));
    
    // Firefox detection: check userAgent (works cross-platform)
    const isFirefox = uaHasFirefox;
    
    // Windows detection (for non-Firefox browsers)
    const isWindows = !isFirefox && (/windows/i.test(platform) || /Win/i.test(navigator.userAgent));
    
    const detectedPlatform = isAndroid ? 'Android' : isWindows ? 'Windows' : isFirefox ? 'Firefox' : (platform || 'Unknown');
    logDebug(`Platform detection: platform="${platform}", uad.mobile=${uad?.mobile}, uaHasAndroid=${uaHasAndroid}, isAndroid=${isAndroid}, isFirefox=${isFirefox}, uaHasMobile=${uaHasMobile}`);
    logDebug(`Detected platform: ${detectedPlatform}`);

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

    // Media buffer sizing:
    // - Android HW (Widevine L1) needs at least 1200ms
    // - Firefox needs at least 900ms (from client-sdk-changelog.md)
    // - Other platforms (Chrome/Edge SW on Linux/macOS/Windows) need at least 600ms for SW-secure decryption
    let mediaBufferMs = -1;
    if (isAndroid && androidRobustness === 'HW') {
      mediaBufferMs = 1200;
      logDebug(`Set mediaBufferMs=1200 for Android HW robustness`);
    } else if (isFirefox && mediaBufferMs < 900) {
      // Firefox specifically needs 900ms to prevent stuttering
      mediaBufferMs = 900;
      logDebug(`Set mediaBufferMs=900 for Firefox (Firefox-specific requirement)`);
    } else if (mediaBufferMs < 600) {
      // Apply 600ms buffer for Software CDMs (Chrome SW, Edge SW on Mac/Linux/Windows, etc.)
      mediaBufferMs = 600;
      logDebug(`Set mediaBufferMs=600 for Software DRM/Desktop browsers`);
    }

    const video = {
      codec: 'H264' as const,
      encryption: 'cbcs' as const,
      robustness: (isAndroid ? androidRobustness : 'SW') as 'HW' | 'SW',
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
      audio: { codec: 'opus' as const, encryption: 'clear' as const },
      logLevel: 3,
      mediaBufferMs
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

    logDebug(`DRM config: isAndroid=${isAndroid}, encryption=${video.encryption}, robustness=${video.robustness}, mediaBufferMs=${mediaBufferMs}`);
    logDebug(`[Callback Auth] Merchant: ${merchant || import.meta.env.VITE_DRM_MERCHANT}, KeyId: ${import.meta.env.VITE_DRM_KEY_ID}`);
    logDebug(`[Callback Auth] DRMtoday License Server: ${rtcDrmEnvironments.Staging.baseUrl()}`);
    logDebug(`[Callback Auth] DRMtoday will call your backend at: ${import.meta.env.VITE_DRM_BACKEND_URL}/api/callback`);
    logDebug(`[Callback Auth] UserId: ${userId || 'elidev-test'}`);
    logDebug('[Callback Auth] Mode: ENABLED - Backend provides CRT (no client-side authToken)');
    logDebug('');
    logDebug('IMPORTANT: DRM will only work if the stream is ENCRYPTED with matching keys!');
    logDebug('   - Stream MUST be encrypted with the same KEY_ID:KEY_ID}');
    logDebug('   - Otherwise, the player will just play unencrypted content');
    logDebug('');

    try {
      rtcDrmConfigure(drmConfig);
      logDebug('rtcDrmConfigure succeeded - License request sent to DRMtoday, waiting for callback...');
    } catch (err: any) {
      logDebug(`rtcDrmConfigure FAILED: ${err.message}`);
      throw err;
    }

    pc.addEventListener('track', (event) => {
      logDebug(`Track received: ${event.track.kind}`);
      try {
        rtcDrmOnTrack(event);
        logDebug(`rtcDrmOnTrack succeeded for ${event.track.kind} - Stream is being DECRYPTED`);
        // Explicitly call play() after DRM processes the track (matches whep behavior)
        if (event.track.kind === 'video') {
          videoElement.play()
            .then(() => logDebug('videoElement.play() resolved'))
            .catch((err: any) => logDebug(`videoElement.play() rejected: ${err.message}`));
        } else if (event.track.kind === 'audio') {
          audioElement.play()
            .then(() => logDebug('audioElement.play() resolved'))
            .catch((err: any) => logDebug(`audioElement.play() rejected: ${err.message}`));
        }
      } catch (err: any) {
        logDebug(`rtcDrmOnTrack FAILED: ${err.message}`);
        logError(`DRM Error - The stream might NOT be encrypted or keys don't match: ${err.message}`);
      }
    });
  };

  const handleConnect = async () => {
    console.log('[Player] handleConnect called, encrypted:', encrypted, 'isEmbedMode:', isEmbedMode);
    await connect({
      endpoint,
      encrypted,
      configureDrm: encrypted ? configureDrm : undefined
    }, videoRef.current, audioRef.current);
  };

  const openEmbedPage = () => {
    // Embed page now uses environment defaults for merchant and encrypted=true
    // No URL parameters needed
    const embedUrl = `${window.location.origin}/embed.html`;
    window.open(embedUrl, '_blank');
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  useEffect(() => {
    if (isConnected) {
      setWasConnected(true);
    }
  }, [isConnected]);

  return (
    <>
      {isEmbedMode ? (
        <>
          <video
            ref={videoRef}
            className="fixed inset-0 w-full h-full object-cover bg-black"
            autoPlay
            playsInline
            muted={isMuted}
          />
          {/* Hidden audio element for DRM (required by rtc-drm-transform library) */}
          <audio
            ref={audioRef}
            autoPlay
            playsInline
            muted={isMuted}
            style={{ display: 'none' }}
          />

          {/* Loading Overlay - Shown when connecting */}
          {isConnecting && (
            <div className="fixed inset-0 flex items-center justify-center bg-[#141414]/80 z-10 pointer-events-none">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-[#a0a0a0] border-t-transparent rounded-full animate-spin mb-4"></div>
                <span className="text-white font-medium">Connecting to stream...</span>
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
                {isConnecting && (
                  <div className="mt-6 flex items-center gap-2 text-[#d0d0d0] text-sm">
                    <div className="w-4 h-4 border-2 border-[#d0d0d0] border-t-transparent rounded-full animate-spin"></div>
                    <span>Trying to connect...</span>
                  </div>
                )}
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
          {/* Encryption disabled warning */}
          {!encrypted && (
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
          <div className="relative group bg-[#1e1e1e] rounded-lg overflow-hidden w-full">
            {/* Aspect ratio container - different ratios for different screen sizes */}
            <div className="aspect-video sm:aspect-video lg:aspect-video xl:aspect-[21/9] max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh] xl:max-h-[70vh]">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                autoPlay
                playsInline
                muted={isMuted}
              />
            </div>
            {/* Hidden audio element for DRM (required by rtc-drm-transform library) */}
            <audio
              ref={audioRef}
              autoPlay
              playsInline
              muted={isMuted}
              style={{ display: 'none' }}
            />

            {/* Error Overlay */}
            {(error || drmError) && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-20">
                <div className="p-4 sm:p-6 bg-[#1e1e1e]/90 border border-[#404040] rounded-lg text-center max-w-sm mx-4 backdrop-blur-sm">
                  <div className="inline-flex items-center justify-center w-10 sm:w-12 h-10 sm:h-12 bg-[#252525] rounded-xl mb-3 border border-[#404040]">
                    <svg className="w-5 sm:w-6 h-5 sm:h-6 text-[#a0a0a0] animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
            {!isConnected && !isConnecting && !error && !drmError && !isInterrupted && (
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

            {/* Stream Interrupted Overlay */}
            {isInterrupted && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-10">
                <div className="flex flex-col items-center text-center p-4 sm:p-8">
                  <div className="inline-flex items-center justify-center w-12 sm:w-16 h-12 sm:h-16 bg-[#252525] rounded-xl sm:rounded-2xl mb-3 sm:mb-4 border border-[#404040]">
                    <svg className="w-6 sm:w-8 h-6 sm:h-8 text-[#a0a0a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-sm sm:text-lg mb-2">Stream Interrupted</h3>
                  <p className="text-[#a0a0a0] text-xs sm:text-sm max-w-xs mb-3 sm:mb-4">The broadcast has been stopped or interrupted</p>
                  <button
                    onClick={handleConnect}
                    className="px-4 py-2 bg-white text-[#141414] hover:bg-[#e5e5e5] font-semibold rounded transition-colors shadow-lg cursor-pointer min-h-[44px]"
                  >
                    Reconnect
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar - Below the video player */}
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

              {/* Open Embed Button - hidden on small mobile */}
              <button
                onClick={openEmbedPage}
                className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-[#252525] hover:bg-[#333333] text-white text-sm font-medium rounded-lg transition-colors border border-[#404040] cursor-pointer min-h-[48px]"
                title="Open fullscreen embed in new window"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Open Embed</span>
              </button>

              {/* Live Indicator */}
              <div className="flex items-center gap-2 bg-[#252525] px-3 py-1.5 rounded-full border border-[#404040]">
                <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-white/50'}`}></span>
                <span className="text-white text-xs sm:text-sm font-medium tracking-wide">
                  {isConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2">
              {/* Open Embed for mobile */}
              <button
                onClick={openEmbedPage}
                className="sm:hidden p-2.5 bg-[#252525] hover:bg-[#333333] text-white rounded-lg border border-[#404040] cursor-pointer min-w-[48px] min-h-[48px] flex items-center justify-center"
                title="Open fullscreen embed"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>

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

          {/* Debug Panel - Below the video player - Hidden in production */}
          {!isProduction && !isEmbedMode && <DebugPanel id={DEBUG_PANEL_ID} title="Player Debug Log" />}
        </div>
      )}
    </>
  );
};
