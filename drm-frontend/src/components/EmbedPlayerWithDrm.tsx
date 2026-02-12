import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useWhep, WhepOptions } from '../hooks/useWhep';
import { rtcDrmConfigure, rtcDrmEnvironments } from '../lib/rtc-drm-transform.min.js';
import { hexToUint8Array } from '../lib/drmUtils';

export interface EmbedPlayerWithDrmProps {
  endpoint: string;
  encrypted?: boolean;
  merchant?: string;
  userId?: string;
  onError?: (error: string) => void;
}

/**
 * Clean embed player with optional DRM support
 * This is a minimal video-only component for iframe embedding
 */
export const EmbedPlayerWithDrm: React.FC<EmbedPlayerWithDrmProps> = ({
  endpoint,
  encrypted = false,
  merchant,
  userId,
  onError
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isConnected, isConnecting, error, connect } = useWhep();
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [drmError, setDrmError] = useState<string | null>(null);

  // DRM configuration function
  const configureDrm = useCallback(async (pc: RTCPeerConnection) => {
    if (!encrypted) return;

    console.log('[EmbedPlayerWithDrm] Configuring DRM...');

    const keyId = hexToUint8Array(import.meta.env.VITE_DRM_KEY_ID || '');
    const iv = hexToUint8Array(import.meta.env.VITE_DRM_IV || '');

    const videoConfig = {
      codec: 'H264' as const,
      encryption: 'cbcs' as const,
      robustness: 'SW' as const,
      keyId,
      iv
    };

    const drmConfig = {
      merchant: merchant || import.meta.env.VITE_DRM_MERCHANT,
      userId: userId || 'elidev-test',
      environment: rtcDrmEnvironments.Staging,
      videoElement: videoRef.current!,
      audioElement: audioRef.current!,
      video: videoConfig,
      audio: { codec: 'opus' as const, encryption: 'clear' as const },
      logLevel: 0, // Minimal logging for embed mode
      mediaBufferMs: 600
    };

    try {
      rtcDrmConfigure(drmConfig);
      console.log('[EmbedPlayerWithDrm] DRM configured successfully');
    } catch (err: any) {
      console.error('[EmbedPlayerWithDrm] DRM configuration failed:', err);
      setDrmError(err.message || 'DRM configuration failed');
      throw err;
    }
  }, [encrypted, merchant, userId]);

  // Handle connection with DRM support
  const handleConnect = useCallback(async () => {
    setDrmError(null);
    
    const options: WhepOptions = {
      endpoint,
      encrypted,
      configureDrm: encrypted ? configureDrm : undefined
    };

    try {
      await connect(options, videoRef.current, audioRef.current);
    } catch (err: any) {
      console.error('[EmbedPlayerWithDrm] Connection error:', err);
      onError?.(err.message || 'Connection failed');
    }
  }, [endpoint, encrypted, configureDrm, connect, onError]);

  // Auto-connect on mount
  useEffect(() => {
    console.log('[EmbedPlayerWithDrm] Auto-connecting...', { encrypted });
    const timer = setTimeout(handleConnect, 100);
    return () => clearTimeout(timer);
  }, []);

  // Handle connection state changes
  useEffect(() => {
    if (isConnected && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch((e) => {
          console.warn('[EmbedPlayerWithDrm] Video play failed:', e.message);
        });
      }
    }
  }, [isConnected]);

  // Track playing state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlaying = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // Show DRM error if present
  const displayError = error || drmError;

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        autoPlay
        playsInline
        muted={isMuted}
      />

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        muted={isMuted}
        style={{ display: 'none' }}
      />

      {/* Loading overlay */}
      {(isConnecting || !isConnected) && !displayError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
            <p className="text-white text-sm">
              {isConnecting ? 'Connecting...' : 'Initializing...'}
            </p>
            {encrypted && <p className="text-gray-400 text-xs mt-2">Initializing DRM...</p>}
          </div>
        </div>
      )}

      {/* Error overlay */}
      {displayError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center max-w-md">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-white font-medium mb-2">Playback Error</p>
            <p className="text-gray-400 text-sm">{displayError}</p>
            <button
              onClick={handleConnect}
              className="mt-4 px-4 py-2 bg-white text-black rounded hover:bg-gray-200 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Unmute button (visible when playing but muted) */}
      {isPlaying && isMuted && !isConnecting && !displayError && (
        <button
          onClick={toggleMute}
          className="absolute bottom-4 right-4 z-30 px-4 py-2 bg-white/80 backdrop-blur-sm text-black rounded-full flex items-center gap-2 hover:bg-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="text-sm font-medium">Unmute</span>
        </button>
      )}
    </div>
  );
};