import React, { useRef, useState, useEffect } from 'react';
import { useWhep } from '../hooks/useWhep';
import { detectDrmCapability } from '../lib/drmCapability';
import { initializeDrm, type DrmEventHandlers } from '../lib/drmConfig';
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

export const Player: React.FC<PlayerProps> = ({ endpoint, merchant, userId, encrypted, isEmbedMode = false, onOpenEmbed }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { isConnected, isConnecting, error, connect, disconnect } = useWhep();

  // Always start muted for autoplay compatibility
  const [isMuted, setIsMuted] = useState(true);
  const [drmError, setDrmError] = useState<string | null>(null);
  const [securityLevel, setSecurityLevel] = useState<'L1' | 'L3' | 'checking' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isProduction = import.meta.env.VITE_NODE_ENV === 'production';

  // ---------------------------------------------------------------------------
  // Logging helpers
  // ---------------------------------------------------------------------------
  // In embed mode, disable all logging for security and clean output
  const broadcastDebugEvent = isEmbedMode
    ? () => { }
    : (detail: { id: string; level: 'info' | 'error' | 'warning'; message: string }) => {
      window.dispatchEvent(
        new CustomEvent('debug-log', {
          detail: { ...detail, timestamp: new Date().toLocaleTimeString() },
        })
      );
    };

  const logDebug = isEmbedMode
    ? () => { }
    : (...args: any[]) => {
      const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'info', message });
    };

  const logError = isEmbedMode
    ? () => { }
    : (...args: any[]) => {
      const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'error', message });
    };

  const logWarning = isEmbedMode
    ? () => { }
    : (...args: any[]) => {
      const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      broadcastDebugEvent({ id: DEBUG_PANEL_ID, level: 'warning', message });
    };

  // ---------------------------------------------------------------------------
  // Sync mute state to video/audio elements
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  // ---------------------------------------------------------------------------
  // Fullscreen handling
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Auto-connect and fullscreen for embed mode
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isEmbedMode) {
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        handleConnect();
        setIsFullscreen(true); // Auto-enter fullscreen
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [endpoint]);

  // ---------------------------------------------------------------------------
  // Ensure video is playing when connected
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isConnected && videoRef.current) {
      console.log('[Player] Connected - ensuring video is playing');

      if (videoRef.current.paused) {
        console.log('[Player] Video is paused, attempting to play');
        const playPromise = videoRef.current.play();

        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('[Player] Video play() succeeded');
          }).catch((e) => {
            console.warn('[Player] Video play() failed:', e.name, e.message);
            if (e.name === 'NotAllowedError') {
              console.log('[Player] Autoplay blocked - video may require user interaction');
              if (videoRef.current) {
                videoRef.current.muted = false;
                setIsMuted(false);
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
    }
  }, [isConnected]);

  // ---------------------------------------------------------------------------
  // Track when video is actually playing
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const setPlayState = (playing: boolean) => setIsPlaying(playing);

    video.addEventListener('playing', () => setPlayState(true));
    video.addEventListener('pause', () => setPlayState(false));
    video.addEventListener('waiting', () => setPlayState(false));
    video.addEventListener('ended', () => setPlayState(false));

    if (!isConnected) setIsPlaying(false);

    return () => {
      video.removeEventListener('playing', () => setPlayState(true));
      video.removeEventListener('pause', () => setPlayState(false));
      video.removeEventListener('waiting', () => setPlayState(false));
      video.removeEventListener('ended', () => setPlayState(false));
    };
  }, [isConnected]);

  // ---------------------------------------------------------------------------
  // Extra monitoring for embed mode: ensure video stays playing
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isEmbedMode || !isConnected) return;

    const video = videoRef.current;
    if (!video) return;

    console.log('[Embed Mode] Setting up video monitoring');

    const checkVideo = setInterval(() => {
      if (video.paused && video.srcObject) {
        console.log('[Embed Mode] Video paused unexpectedly, attempting to restart...');

        const audioCtx = (window as any).webkitAudioContext || (window as any).AudioContext;
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            console.log('[Embed Mode] AudioContext resumed');
          });
        }

        video.play()
          .then(() => console.log('[Embed Mode] Video restarted successfully'))
          .catch(e => {
            console.warn('[Embed Mode] Play failed:', e.message);

            if (e.name === 'AbortError' && video.muted) {
              video.muted = false;
              setTimeout(() => {
                video.play().catch(err => console.warn('[Embed Mode] Retry play failed:', err.message));
              }, 100);
            }
          });
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

  // ---------------------------------------------------------------------------
  // DRM Configuration (using shared modules)
  // ---------------------------------------------------------------------------

  /**
   * Configures DRM for the peer connection.
   *
   * Pipeline:
   *   1. Check EME availability (catches iframe permission issues)
   *   2. Detect DRM capabilities (HW security probe across all CDMs)
   *   3. If blocked → set L3 state and abort (fallback overlay shows)
   *   4. Build platform-aware DRM config
   *   5. Attach event listeners + track handler
   *   6. Call rtcDrmConfigure() to start license acquisition
   *
   * @param pc - RTCPeerConnection instance
   */
  const configureDrm = async (pc: RTCPeerConnection) => {
    // Note: EME availability is checked INSIDE detectDrmCapability() below.
    // Do NOT add a separate checkEmeAvailability() call here — it would
    // cause duplicate requestMediaKeySystemAccess probes.
    if (encrypted) {
      logDebug('DRM Encrypted Playback Mode ENABLED');
    } else {
      logWarning('DRM Encrypted Playback Mode DISABLED - Playing unencrypted stream');
    }

    // ── Step 2: DRM capability detection ────────────────────────────────
    // Probes Widevine (HW_SECURE_ALL), PlayReady (SL3000), and FairPlay.
    // Returns security level, selected CDM type, and block reason if any.
    if (encrypted) {
      setSecurityLevel('checking');
      const capability = await detectDrmCapability(logDebug);

      if (!capability.supported) {
        // ── Step 3: Blocked — show fallback overlay ─────────────────────
        // Device only supports Widevine L3 (software) or has no DRM at all.
        // We require L1/hardware-backed security — no exceptions.
        setSecurityLevel('L3');
        const errMsg = capability.blockReason || 'No hardware-backed DRM available';
        logError(`[DRM] ${errMsg}`);
        setDrmError(errMsg);
        return; // Abort DRM setup — L3 overlay will show
      }

      setSecurityLevel('L1');
      logDebug('Hardware-secure DRM available — proceeding with setup');

      // ── Step 4–6: Build config, attach listeners, initialize DRM ──────
      // The initializeDrm function handles:
      //   - Building platform-aware config (FairPlay iv-only vs Widevine/PlayReady keyId+iv)
      //   - Attaching diagnostic event listeners to video/audio elements
      //   - Calling rtcDrmConfigure() to start license acquisition
      //   - Wiring the track handler with retry-play logic
      const handlers: DrmEventHandlers = {
        onDebug: logDebug,
        onError: logError,
        onDrmError: setDrmError,
        onPlayStarted: () => setIsPlaying(true),
        onSetMuted: setIsMuted,
      };

      // Build fetch interceptor for debugging license requests
      const onFetch = isEmbedMode ? undefined : async (url: string, opts: any) => {
        logDebug(`[DRM Fetch] Requesting: ${url}`);
        logDebug(`[DRM Fetch] Method: ${opts.method}`);
        if (opts.body) {
          logDebug(`[DRM Fetch] Body size: ${opts.body.byteLength || opts.body.length} bytes`);
        }
        try {
          const response = await fetch(url, opts);
          logDebug(`[DRM Fetch] Response status: ${response.status} ${response.statusText}`);

          // Check for x-dt-client-info header (Base64 JSON)
          const clientInfo = response.headers.get('x-dt-client-info');
          if (clientInfo) {
            try {
              const decoded = JSON.parse(atob(clientInfo));
              logDebug(`[DRM Fetch] Client Info from header: ${JSON.stringify(decoded)}`);
            } catch (e) {
              logDebug(`[DRM Fetch] Could not decode x-dt-client-info header`);
            }
          }

          return response;
        } catch (err: any) {
          logError(`[DRM Fetch] Network error: ${err.message}`);
          throw err;
        }
      };

      initializeDrm(pc, {
        merchant: merchant || import.meta.env.VITE_DRM_MERCHANT,
        userId: userId || 'elidev-test',
        environmentName: import.meta.env.VITE_DRM_ENVIRONMENT || 'Staging',
        videoElement: videoRef.current!,
        audioElement: audioRef.current!,
        keyIdHex: import.meta.env.VITE_DRM_KEY_ID,
        ivHex: import.meta.env.VITE_DRM_IV,
        encryptionMode: 'cbcs',
        capability,
        onFetch,
      }, handlers);
    }
  };

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------

  /**
   * Initiates connection to the stream, optionally with DRM configuration.
   */
  const handleConnect = async () => {
    await connect({
      endpoint,
      encrypted,
      configureDrm: encrypted ? configureDrm : undefined
    }, videoRef.current, audioRef.current);
  };

  /**
   * Toggles mute state for both video and audio elements.
   */
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
          />
          {/* Hidden audio element for DRM (required by rtc-drm-transform library) */}
          <audio
            ref={audioRef}
            autoPlay
            playsInline
            muted={isMuted}
            style={{ display: 'none' }}
          />

          {/* Unmute Button - Only visible when loader is gone (stream is playing) */}
          {isMuted && isPlaying && !isConnecting && !error && !drmError && (
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = false;
                }
                if (audioRef.current) {
                  audioRef.current.muted = false;
                }
                setIsMuted(false);
                console.log('[Player] Unmute clicked - unmuted both video and audio elements');
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

          {/* Unsupported Device Overlay (Embed Mode) */}
          {securityLevel === 'L3' && (
            <div className="fixed inset-0 flex items-center justify-center bg-[#141414]/95 z-20 p-4">
              <div className="flex flex-col items-center text-center p-6 sm:p-8 max-w-sm sm:max-w-md">
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-[#252525] rounded-2xl mb-4 sm:mb-5 border border-amber-500/30">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-lg sm:text-xl mb-3">Device is not supported</h3>
                <p className="text-[#d0d0d0] text-sm sm:text-base mb-4 leading-relaxed">
                  This device does not support hardware-backed content protection required for playback.
                </p>
                <div className="w-full bg-[#252525]/60 rounded-lg p-4 mb-4 border border-[#333]">
                  <p className="text-[#a0a0a0] text-xs sm:text-sm leading-relaxed text-left mb-2 font-medium text-[#c0c0c0]">What you can try:</p>
                  <ul className="text-[#a0a0a0] text-xs sm:text-sm leading-relaxed text-left space-y-1.5">
                    <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">&#8226;</span><span>Use a different browser on this device</span></li>
                    <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">&#8226;</span><span>Try watching on a different device</span></li>
                    <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">&#8226;</span><span>Contact support if the issue persists</span></li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {(error || drmError) && securityLevel !== 'L3' && (
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
              className={`${(isEmbedMode || isFullscreen)
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
                      {isMuted && isPlaying && !isConnecting && !error && !drmError && (
                        <button
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.muted = false;
                            }
                            if (audioRef.current) {
                              audioRef.current.muted = false;
                            }
                            setIsMuted(false);
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
              <div className={`${isEmbedMode || isFullscreen
                ? 'h-screen w-full'
                : 'aspect-video sm:aspect-video lg:aspect-video xl:aspect-[21/9] max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh] xl:max-h-[70vh]'
                }`}>
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain cursor-pointer"
                  autoPlay
                  playsInline
                  muted={isMuted}
                  onClick={async () => {
                    const video = videoRef.current;
                    if (!video) return;

                    console.log('[Player] Video clicked, ensuring playback');

                    const audioCtx = (window as any).webkitAudioContext || (window as any).AudioContext;
                    if (audioCtx && audioCtx.state === 'suspended') {
                      console.log('[Player] Resuming AudioContext');
                      await audioCtx.resume();
                    }

                    if (video.muted) {
                      video.muted = false;
                      setIsMuted(false);
                      console.log('[Player] Unmuted due to user interaction');
                    }

                    try {
                      await video.play();
                      console.log('[Player] Video play() successful after click');
                    } catch (err: any) {
                      console.warn('[Player] Play failed after click:', err.message);
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
              />

              {/* Unsupported Device Overlay (Viewer Mode) */}
              {securityLevel === 'L3' && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-20">
                  <div className="p-4 sm:p-6 bg-[#1e1e1e]/90 border border-[#404040] rounded-lg text-center max-w-sm mx-4 backdrop-blur-sm">
                    <div className="inline-flex items-center justify-center w-12 sm:w-14 h-12 sm:h-14 bg-[#252525] rounded-xl mb-3 border border-amber-500/30">
                      <svg className="w-6 sm:w-7 h-6 sm:h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <h3 className="text-white font-bold text-sm sm:text-lg mb-2">Device is not supported</h3>
                    <p className="text-[#d0d0d0] text-xs sm:text-sm mb-3 leading-relaxed">
                      This device does not support hardware-backed content protection required for playback.
                    </p>
                    <p className="text-[#a0a0a0] text-[11px] sm:text-xs mb-2">Try a different browser or device.</p>
                    <p className="text-[#555] text-[9px] sm:text-[10px]">
                      {drmError || 'No hardware-backed DRM available'}
                    </p>
                  </div>
                </div>
              )}

              {/* Error Overlay */}
              {(error || drmError) && securityLevel !== 'L3' && (
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
                    className={`px-4 py-2.5 sm:py-3 text-[#141414] rounded-lg font-medium transition-all shadow-lg cursor-pointer min-h-[48px] ${isConnecting
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
