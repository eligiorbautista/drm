import React, { useRef, useState, useEffect } from 'react';
import { useWhep } from '../hooks/useWhep';

export interface EmbedPlayerProps {
  endpoint: string;
  onError?: (error: string) => void;
}

/**
 * Simple embed player without DRM configuration
 * This is a clean playback-only component for iframe embedding
 */
export const EmbedPlayer: React.FC<EmbedPlayerProps> = ({ endpoint, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isConnected, isConnecting, error, connect } = useWhep();
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-connect on mount
  useEffect(() => {
    console.log('[EmbedPlayer] Auto-connecting...');
    handleConnect();
  }, []);

  // Handle connection state changes
  useEffect(() => {
    if (isConnected && videoRef.current) {
      // Ensure video is playing
      if (videoRef.current.paused) {
        videoRef.current.play().catch((e) => {
          console.warn('[EmbedPlayer] Video play failed:', e.message);
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

  const handleConnect = async () => {
    try {
      await connect({ endpoint, encrypted: false }, videoRef.current, audioRef.current);
    } catch (err: any) {
      console.error('[EmbedPlayer] Connection error:', err);
      onError?.(err.message || 'Connection failed');
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

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
      {(isConnecting || !isConnected) && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
            <p className="text-white text-sm">
              {isConnecting ? 'Connecting...' : 'Initializing...'}
            </p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center max-w-md">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-white font-medium mb-2">Playback Error</p>
            <p className="text-gray-400 text-sm">{error}</p>
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
      {isPlaying && isMuted && !isConnecting && !error && (
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