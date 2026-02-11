import { useEffect, useRef, useState } from 'react';
import { rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments } from '../lib/rtc-drm-transform.min.js';

interface EmbedPlayerPageProps {
  searchParams?: URLSearchParams;
}

/**
 * Helper to decode config from window.name (base64 encoded JSON)
 */
function getEmbeddedConfig(): any {
  try {
    if (typeof window !== 'undefined' && window.name) {
      const decoded = atob(window.name);
      return JSON.parse(decoded);
    }
  } catch (e) {
    console.error('[Embed Player] Failed to decode embedded config:', e);
  }
  return null;
}

/**
 * Embed Player Page Component
 * This page serves as an embeddable player that can be opened in a new window or iframe.
 * Configuration comes from:
 * 1. window.name (base64 encoded) - for secure/embedded mode
 * 2. URL search parameters - for direct URL access
 */
export function EmbedPlayerPage({ searchParams }: EmbedPlayerPageProps = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [status, setStatus] = useState<'loading' | 'connected' | 'error' | 'offline'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Parse configuration from URL params (used when accessed directly via URL)
  const params = typeof window !== 'undefined' ? searchParams || new URLSearchParams(window.location.search) : new URLSearchParams();
  
  // Try to get embedded config first (from window.name), then fall back to URL params
  const embeddedConfig = getEmbeddedConfig();
  
  const config = embeddedConfig || {
    endpoint: params.get('endpoint') || '',
    merchant: params.get('merchant') || '',
    userId: params.get('userId') || 'embed-user',
    encrypted: params.get('encrypted') !== 'false',
    keyId: params.get('keyId') || '',
    iv: params.get('iv') || '',
  };

  useEffect(() => {
    console.log('[Embed Player] Initializing with config:', {
      ...config,
      keyId: config.keyId ? '[REDACTED]' : '',
      iv: config.iv ? '[REDACTED]' : '',
    });

    let pc: RTCPeerConnection | null = null;
    let stream: MediaStream | null = null;

    const connect = async () => {
      try {
        setStatus('loading');
        
        pc = new RTCPeerConnection({
          bundlePolicy: 'max-bundle',
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          // @ts-ignore - encodedInsertableStreams is a non-standard API
          encodedInsertableStreams: config.encrypted,
        });

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // Check EME availability
        const checkEmeAvailability = async () => {
          if (!navigator.requestMediaKeySystemAccess) {
            throw new Error('Your browser does not support Encrypted Media Extensions (EME).');
          }
          const probeConfigs = [{
            initDataTypes: ['cenc'],
            videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: '' }]
          }];
          const keySystems = ['com.widevine.alpha', 'com.apple.fps.1_0', 'com.microsoft.playready.recommendation'];
          for (const ks of keySystems) {
            try {
              await navigator.requestMediaKeySystemAccess(ks, probeConfigs);
              return true;
            } catch (e) {
              if ((e as any).name === 'NotAllowedError') {
                throw new Error('DRM blocked by browser permissions. Ensure encrypted-media is allowed.');
              }
            }
          }
          throw new Error('No supported DRM key system found.');
        };

        // Configure DRM
        if (config.encrypted) {
          await checkEmeAvailability();

          const videoElement = videoRef.current;
          const audioElement = audioRef.current;
          
          if (!videoElement || !audioElement) {
            throw new Error('Video or audio element not available.');
          }

          // Helper function
          const hexToUint8Array = (hex: string): Uint8Array => {
            const cleanHex = hex.replace(/[\s:-]/g, '');
            if (cleanHex.length % 2 !== 0) {
              throw new Error(`Invalid hex string length: ${cleanHex.length}`);
            }
            const bytes = [];
            for (let i = 0; i < cleanHex.length; i += 2) {
              bytes.push(parseInt(cleanHex.substr(i, 2), 16));
            }
            return new Uint8Array(bytes);
          };

          // Detect platform
          const uad = (navigator as any).userAgentData;
          const platform = uad?.platform || navigator.platform || '';
          const isMobile = uad?.mobile === true;
          const isAndroid = /Android/i.test(navigator.userAgent) || platform.toLowerCase() === 'android' || (isMobile && /linux/i.test(platform));

          let androidRobustness = 'SW';
          if (isAndroid) {
            try {
              await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
                initDataTypes: ['cenc'],
                videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: 'HW_SECURE_ALL' }]
              }]);
              androidRobustness = 'HW';
            } catch {}
          }

          const keyId = hexToUint8Array(config.keyId || '5ed8fa5fa9ae4f45fa981793a01f950c');
          const iv = hexToUint8Array(config.iv || 'dc576fccde9d9e3a77cc5f438f50fd0f');

          let mediaBufferMs = 600;
          if (isAndroid && androidRobustness === 'HW') {
            mediaBufferMs = 1200;
          } else if (/Firefox/i.test(navigator.userAgent)) {
            mediaBufferMs = 900;
          }

          rtcDrmConfigure({
            merchant: config.merchant,
            userId: config.userId,
            environment: rtcDrmEnvironments.Staging,
            videoElement,
            audioElement,
            video: {
              codec: 'H264',
              encryption: 'cbcs',
              // @ts-ignore - Type issue with robustness
              robustness: isAndroid ? androidRobustness as any : 'SW',
              keyId,
              iv,
            },
            audio: { codec: 'opus', encryption: 'clear' },
            logLevel: 1,
            mediaBufferMs,
          });

          pc.addEventListener('track', (event) => {
            try {
              rtcDrmOnTrack(event);
              if (event.track.kind === 'video') {
                videoElement.play().catch(console.warn);
              } else if (event.track.kind === 'audio') {
                audioElement.play().catch(console.warn);
              }
            } catch (err) {
              console.error('[DRM] Track error:', err);
            }
          });
        } else {
          // Non-DRM mode
          stream = new MediaStream();
          pc.addEventListener('track', (event) => {
            if (!stream) {
              stream = new MediaStream();
            }
            stream.addTrack(event.track);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(console.warn);
            }
          });
        }

        // Connection state handler
        pc.addEventListener('connectionstatechange', () => {
          if (pc?.connectionState === 'connected') {
            setStatus('connected');
          } else if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed') {
            setStatus('offline');
          }
        });

        // ICE gathering
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise<void>((resolve) => {
          if (pc?.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkState = () => {
              if (pc?.iceGatheringState === 'complete') {
                pc?.removeEventListener('icegatheringstatechange', checkState);
                resolve();
              }
            };
            pc?.addEventListener('icegatheringstatechange', checkState);
          }
        });

        // Send WHEP request
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const answerSdp = await response.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      } catch (err) {
        console.error('[Embed Player] Connection error:', err);
        setStatus('error');
        setErrorMsg((err as Error).message);
      }
    };

    connect();

    // Cleanup
    return () => {
      if (pc) {
        pc.close();
      }
    };
  }, []); // Empty deps - run once on mount

  // Mute handling
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  return (
    <div className="embed-player-container">
      <style>{`
        .embed-player-container {
          width: 100vw;
          height: 100vh;
          margin: 0;
          padding: 0;
          background: #000;
          overflow: hidden;
        }
        .video-container {
          position: fixed;
          inset: 0;
          background: #000;
        }
        .video-container video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .controls-overlay {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 20px;
          background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
          display: flex;
          align-items: center;
          justify-content: space-between;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .video-container:hover .controls-overlay,
        .controls-overlay:hover {
          opacity: 1;
        }
        .control-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          color: #fff;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .control-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .live-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0,0,0,0.5);
          padding: 6px 12px;
          border-radius: 4px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .live-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          box-shadow: 0 0 8px #22c55e;
          animation: pulse 2s infinite;
        }
        .live-dot.offline {
          background: #666;
          box-shadow: none;
          animation: none;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .loading-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #141414;
          z-index: 100;
        }
        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #404040;
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .loading-text {
          margin-top: 16px;
          color: #a0a0a0;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .error-overlay {
          position: fixed;
          inset: 0;
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #141414;
          z-index: 101;
          padding: 24px;
          text-align: center;
        }
        .error-overlay.visible {
          display: flex;
        }
        .error-icon {
          width: 64px;
          height: 64px;
          background: #252525;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          border: 1px solid #404040;
        }
        .error-icon svg {
          width: 32px;
          height: 32px;
          color: #ef4444;
        }
        .error-title {
          color: #fff;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .error-message {
          color: #a0a0a0;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          max-width: 400px;
          line-height: 1.5;
        }
      `}</style>

      {/* Loading Overlay */}
      {status === 'loading' && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Initializing player...</div>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="error-overlay visible">
          <div className="error-icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="error-title">Playback Error</div>
          <div className="error-message">{errorMsg}</div>
        </div>
      )}

      {/* Video Container */}
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
        />
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          muted={isMuted}
          style={{ display: 'none' }}
        />

        {/* Controls Overlay */}
        <div className="controls-overlay">
          <div className="live-indicator">
            <span className={`live-dot ${status !== 'connected' ? 'offline' : ''}`}></span>
            <span>{status === 'connected' ? 'Live' : 'Offline'}</span>
          </div>
          <button
            className="control-btn"
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <path d="M23 9l-6 6M17 9l6 6"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
