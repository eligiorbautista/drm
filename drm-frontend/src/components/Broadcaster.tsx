import React, { useRef, useState, useEffect } from 'react';
import { useWhip, setEncryptionModule } from '../hooks/useWhip';
import { hexToUint8Array } from '../lib/drmUtils';
import { DebugPanel } from './DebugPanel';

export interface BroadcasterProps {
  endpoint: string;
  merchant?: string;
  encrypted?: boolean;
}

const DEBUG_PANEL_ID = 'broadcaster-debug';

export const Broadcaster: React.FC<BroadcasterProps> = ({ endpoint, merchant, encrypted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { isConnected, isConnecting, error, connect, disconnect } = useWhip();
  const [wasConnected, setWasConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isProduction = import.meta.env.VITE_NODE_ENV === 'production';

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

  // Track if we were previously connected to detect interruptions
  useEffect(() => {
    if (isConnected) {
      setWasConnected(true);
    }
  }, [isConnected]);

  // Check if broadcast was interrupted (was connected, now disconnected with no error)
  const isInterrupted = wasConnected && !isConnected && !isConnecting && !error;

  const configureDrm = async (_pc: RTCPeerConnection) => {
    logDebug('[Broadcaster] Configuring DRM encryption...');
    
    const key = hexToUint8Array(import.meta.env.VITE_DRM_CONTENT_KEY);
    const iv = hexToUint8Array(import.meta.env.VITE_DRM_IV);
    const keyId = import.meta.env.VITE_DRM_KEY_ID;
    
    logDebug(`[Broadcaster] Encryption Config:`);
    logDebug(`[Broadcaster]   KeyId: ${keyId}`);
    logDebug(`[Broadcaster]   ContentKey: ${import.meta.env.VITE_DRM_CONTENT_KEY} (${key.length} bytes)`);
    logDebug(`[Broadcaster]   IV: ${import.meta.env.VITE_DRM_IV} (${iv.length} bytes)`);
    
    if (!key || !iv) {
      logError('[Broadcaster] Encryption key or IV missing from environment variables');
      throw new Error('Encryption key or IV missing from environment variables');
    }

    logDebug('[Broadcaster] Loading WASM encryption module...');

    // Check if the Module is loaded from clcrypto.js
    const ModuleGlobal = (window as any).Module;
    if (!ModuleGlobal) {
      logError('[Broadcaster] Module not loaded - clcrypto.js might not have loaded');
      throw new Error('Module not loaded - clcrypto.js might not have loaded');
    }
    logDebug('[Broadcaster] Module global found:', typeof ModuleGlobal);

    try {
      // Load the encryption module from global scope
      // We need to provide locateFile to find the WASM file at the correct path
      
      logDebug('[Broadcaster] Calling Module() with locateFile override...');
      // @ts-ignore - Module is loaded from clcrypto.js
      const crypto = await ModuleGlobal({
        // Override locateFile to find WASM at correct path: /crypto/clcrypto.wasm
        locateFile: (path: string) => {
          logDebug(`[Broadcaster] locateFile called with: ${path}`);
          // The default is ../../crypto/clcrypto.wasm which won't work
          // We need to return /crypto/clcrypto.wasm
          if (path.endsWith('.wasm')) {
            const wasmPath = '/crypto/clcrypto.wasm';
            logDebug(`[Broadcaster] Mapping to: ${wasmPath}`);
            return wasmPath;
          }
          return path;
        }
      });
      
      logDebug('[Broadcaster] WASM encryption module loaded successfully');
      logDebug('[Broadcaster]   crypto.Mode:', crypto.Mode);
      logDebug('[Broadcaster]   crypto.Codec:', crypto.Codec);
      logDebug('[Broadcaster]   crypto.Encryptor:', crypto.Encryptor);

      // Create encryptor with CBC mode (CBCS)
      const mode = crypto.Mode.CBC;
      const maxFrameSize = 1024 * 1024; // 1MB
      
      logDebug('[Broadcaster] Creating Encryptor...');
      const encryptor = new crypto.Encryptor(crypto.Codec.AVC, mode, key, maxFrameSize);
      logDebug('[Broadcaster] Encryptor created successfully');
      logDebug('[Broadcaster]   encryptor.getSrcBuffer:', typeof encryptor.getSrcBuffer);
      logDebug('[Broadcaster]   encryptor.getDstBuffer:', typeof encryptor.getDstBuffer);
      logDebug('[Broadcaster]   encryptor.encrypt:', typeof encryptor.encrypt);
      logDebug('[Broadcaster]   encryptor.setCbcIv:', typeof encryptor.setCbcIv);
      
      // Set the IV for CBC mode
      logDebug('[Broadcaster] Setting CBC IV...');
      encryptor.setCbcIv(iv);
      logDebug('[Broadcaster] CBC IV set successfully');
      
      // Store the encryptor globally for use in transform functions
      setEncryptionModule(encryptor);
      
      logDebug(`[Broadcaster] Encryptor ready: CBC mode, ${key.length}-byte key, IV set`);
      logDebug(`[Broadcaster] Merchant: ${merchant || import.meta.env.VITE_DRM_MERCHANT}, KeyId: ${keyId}`);
    } catch (err: any) {
      logError(`[Broadcaster] Failed to load encryption module: ${err.message}`);
      throw err;
    }
  };

  const handleConnect = async () => {
    if (encrypted) {
      logDebug('DRM ENCRYPTED Broadcasting Mode ENABLED - Stream will be encrypted');
    } else {
      logWarning('DRM ENCRYPTED Broadcasting Mode DISABLED - Stream will NOT be encrypted');
    }
    logDebug('[Broadcaster] Starting connection...');
    await connect({
      endpoint,
      encrypted,
      configureDrm: encrypted ? configureDrm : undefined
    }, videoRef.current);
  };

  const handleDisconnect = async () => {
    logDebug('[Broadcaster] Disconnecting...');
    await disconnect();
    // Clean up debug overlay
    const overlay = document.getElementById('debug-overlay-broadcaster');
    if (overlay) {
      overlay.remove();
    }
  };

  useEffect(() => {
    if (isConnected) {
      setWasConnected(true);
    }
  }, [isConnected]);

  // Toggle fullscreen mode using Fullscreen API
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
      console.error('[Broadcaster] Fullscreen error:', err);
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

  // Auto-enter fullscreen if URL has ?fullscreen=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fullscreen') === 'true') {
      // Delay slightly to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        if (videoContainerRef.current) {
          videoContainerRef.current.requestFullscreen().catch(err => {
            console.log('[Broadcaster] Auto-fullscreen blocked:', err);
          });
        } else {
          console.log('[Broadcaster] Video container ref not available for auto-fullscreen');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Encryption disabled warning */}
      {!encrypted && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p className="text-amber-500 text-sm font-medium">Encryption Disabled</p>
            <p className="text-amber-400/70 text-xs">Stream will be broadcast without DRM protection</p>
          </div>
        </div>
      )}

      {/* Responsive video container */}
      <div className="relative group bg-[#1e1e1e] rounded-lg overflow-hidden w-full">
        {/* Video container - this is what goes fullscreen */}
        <div 
          ref={videoContainerRef}
          className={`transition-all duration-300 ${
            isFullscreen 
              ? 'fixed inset-0 z-50 bg-black' 
              : ''
          }`}
        >
          {/* Fullscreen header */}
          {isFullscreen && (
            <div className="absolute top-0 left-0 right-0 z-30 p-4 bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Local Preview</span>
              </div>
            </div>
          )}

          {/* Video element - fills fullscreen when active */}
          <div className={`${
            isFullscreen ? 'h-screen w-full' : 'aspect-video sm:aspect-video lg:aspect-video xl:aspect-[21/9] max-h-[40vh] sm:max-h-[50vh] lg:max-h-[60vh] xl:max-h-[70vh]'
          }`}>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
              muted // Always mute local preview to avoid feedback
            />
          </div>

          {/* Error Overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-20">
              <div className="p-4 sm:p-6 bg-[#1e1e1e]/90 border border-[#404040] rounded-lg text-center max-w-sm mx-4 backdrop-blur-sm">
                <div className="inline-flex items-center justify-center w-10 sm:w-12 h-10 sm:h-12 bg-[#252525] rounded-xl mb-3 border border-red-500/30">
                  <svg className="w-5 sm:w-6 h-5 sm:h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-white font-bold text-sm sm:text-lg mb-2">Broadcasting Error</h3>
                <p className="text-[#d0d0d0] text-xs sm:text-sm mb-4">{error}</p>
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-white text-black hover:bg-[#e5e5e5] font-semibold rounded transition-colors shadow-lg cursor-pointer min-h-[44px]"
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
                <span className="text-white font-medium text-sm">Starting Broadcast...</span>
              </div>
            </div>
          )}

          {/* Idle Overlay */}
          {!isConnected && !isConnecting && !error && !isInterrupted && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 pointer-events-none">
              <div className="flex flex-col items-center text-center p-4 sm:p-8">
                <div className="inline-flex items-center justify-center w-12 sm:w-16 h-12 sm:h-16 bg-[#252525] rounded-xl sm:rounded-2xl mb-3 sm:mb-4 border border-[#404040]">
                  <svg className="w-6 sm:w-8 h-6 sm:h-8 text-[#a0a0a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-sm sm:text-lg mb-2">Ready to Broadcast</h3>
                <p className="text-[#a0a0a0] text-xs sm:text-sm max-w-xs">Click "Start Broadcasting" to begin streaming</p>
              </div>
            </div>
          )}

          {/* Broadcast Interrupted Overlay */}
          {isInterrupted && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-10">
              <div className="flex flex-col items-center text-center p-4 sm:p-8">
                <div className="inline-flex items-center justify-center w-12 sm:w-16 h-12 sm:h-16 bg-[#252525] rounded-xl sm:rounded-2xl mb-3 sm:mb-4 border border-[#404040]">
                  <svg className="w-6 sm:w-8 h-6 sm:h-8 text-[#a0a0a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-sm sm:text-lg mb-2">Broadcast Stopped</h3>
                <p className="text-[#a0a0a0] text-xs sm:text-sm max-w-xs mb-3 sm:mb-4">The broadcast has been stopped or interrupted</p>
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-white text-[#141414] hover:bg-[#e5e5e5] font-semibold rounded transition-colors shadow-lg cursor-pointer min-h-[44px]"
                >
                  Restart Broadcast
                </button>
              </div>
            </div>
          )}

          {/* Local Preview Label */}
          <div className="absolute top-3 sm:top-4 left-3 sm:left-4 bg-[#252525]/70 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full backdrop-blur-sm border border-[#404040] z-10">
            <span className="text-white text-xs sm:text-sm font-medium">Local Preview</span>
          </div>
        </div>
      </div>

      {/* Controls Bar - Below the video player */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#1e1e1e] rounded-lg border border-[#333333]">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Start/Stop Button */}
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className={`px-4 py-2.5 sm:py-3 text-black rounded-lg font-medium transition-all shadow-lg cursor-pointer min-h-[48px] ${
                isConnecting
                  ? 'bg-[#404040] cursor-not-allowed opacity-75'
                  : 'bg-white hover:bg-[#e5e5e5] hover:scale-105 active:scale-95'
              }`}
            >
              {isConnecting ? 'Starting...' : 'Start Broadcasting'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2.5 sm:py-3 bg-[#404040] hover:bg-[#333333] text-white rounded-lg font-medium transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer min-h-[48px]"
            >
              Stop Broadcasting
            </button>
          )}

          {/* Status Indicator */}
          <div className="flex items-center gap-2 bg-[#252525] px-3 py-1.5 rounded-full border border-[#404040]">
            {isConnected ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"></span>
                <span className="text-white text-xs sm:text-sm font-medium tracking-wide">
                  {isConnected ? 'BROADCASTING' : 'OFFLINE'}
                </span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-white/50"></span>
                <span className="text-white text-xs sm:text-sm font-medium tracking-wide">
                  OFFLINE
                </span>
              </>
            )}
          </div>
        </div>

        {/* Camera/Mic indicator */}
        <div className="flex items-center gap-2">
          {/* Fullscreen Button */}
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

          {isConnected && (
            <>
              <div className="hidden sm:flex p-2.5 bg-[#252525] rounded-lg border border-[#404040]" title="Camera Active">
                <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="hidden sm:flex p-2.5 bg-[#252525] rounded-lg border border-[#404040]" title="Microphone Active">
                <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              {/* Compact indicators for small screens */}
              <div className="flex sm:hidden items-center gap-1">
                <div className="p-2 bg-[#252525] rounded-full border border-[#404040]">
                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="p-2 bg-[#252525] rounded-full border border-[#404040]">
                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Debug Panel - Below the video - Hidden in production */}
      {!isProduction && <DebugPanel id={DEBUG_PANEL_ID} title="Broadcaster Debug Log" />}
    </div>
  );
};
