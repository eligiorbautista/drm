import { useState, useCallback, useRef } from 'react';

export interface WhepOptions {
  endpoint: string;
  encrypted?: boolean;
  configureDrm?: (pc: RTCPeerConnection) => Promise<void>;
}

export function useWhep() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const disconnect = useCallback((clearError = true) => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    streamRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    if (clearError) {
      setError(null);
    }
  }, []);

  const connect = useCallback(async (options: WhepOptions, videoElement: HTMLVideoElement | null, audioElement: HTMLAudioElement | null) => {
    const logToDebug = (level: 'info' | 'error' | 'warning', msg: string) => {
      window.dispatchEvent(
        new CustomEvent('debug-log', {
          detail: { id: 'player-debug', level, message: msg, timestamp: new Date().toLocaleTimeString() },
        })
      );
    };

    // Log platform info for debugging
    const platformInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      product: navigator.product,
      vendor: navigator.vendor,
      maxTouchPoints: navigator.maxTouchPoints,
      isIOS: /iPad|iPhone|iPod/i.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1),
      isAndroid: /Android/i.test(navigator.userAgent),
      isSafari: /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent),
      encodedInsertableStreamsSupported: 'RTCRtpScriptTransform' in window || 'RTCEncodedVideoFrame' in window
    };
    console.log('[WHEP connect] Platform info:', platformInfo);
    logToDebug('info', `Platform: ${platformInfo.platform}, iOS: ${platformInfo.isIOS}, Android: ${platformInfo.isAndroid}, Safari: ${platformInfo.isSafari}`);
    logToDebug('info', `Encoded Insertable Streams supported: ${platformInfo.encodedInsertableStreamsSupported}`);

    disconnect();
    setError(null);
    setIsConnecting(true);

    // Clear previous media state (mirrors whep's unsubscribe cleanup)
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.srcObject = null;
    }
    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute('src');
      audioElement.srcObject = null;
    }

    const { endpoint, encrypted, configureDrm } = options;
    streamRef.current = new MediaStream();

    try {
      logToDebug('info', 'Starting WHEP connection...');
      
      let pc: RTCPeerConnection;
      
      // Try to create RTCPeerConnection with encodedInsertableStreams
      // Some browsers/devices don't support this feature, so we need fallback
      try {
        pc = new RTCPeerConnection({
          bundlePolicy: 'max-bundle',
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          // @ts-ignore - encodedInsertableStreams is not in TypeScript lib but is valid in modern browsers
          encodedInsertableStreams: encrypted,
          // Optimize for ultra-low latency
          // @ts-ignore - iceTransportPolicy is valid
          iceTransportPolicy: 'all'
        });
        logToDebug('info', `RTCPeerConnection created with encodedInsertableStreams=${encrypted}`);
      } catch (insertableStreamsError: any) {
        // Fallback: try without encodedInsertableStreams if the browser doesn't support it
        console.warn('[WHEP] encodedInsertableStreams not supported, creating RTCPeerConnection without it:', insertableStreamsError.message);
        logToDebug('warning', `Browser doesn't support encodedInsertableStreams, falling back to standard WebRTC`);
        
        if (encrypted) {
          console.warn('[WHEP] DRM encryption requested but encodedInsertableStreams is not supported. Playback may not work.');
          logToDebug('error', '⚠️ DRM requires encodedInsertableStreams which is not supported on this device. Playback may fail.');
        }
        
        pc = new RTCPeerConnection({
          bundlePolicy: 'max-bundle',
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          // @ts-ignore - iceTransportPolicy is valid
          iceTransportPolicy: 'all'
        });
        logToDebug('info', 'RTCPeerConnection created without encodedInsertableStreams');
      }
      
      pcRef.current = pc;

      // Optimize transceivers for low-latency streaming
      // Prefer codecs with lower latency and better compression
      pc.addTransceiver('video', { 
        direction: 'recvonly',
        streams: [streamRef.current]
      });
      pc.addTransceiver('audio', { 
        direction: 'recvonly',
        streams: [streamRef.current]
      });

      // Configure DRM or setup direct playback
      if (encrypted && configureDrm) {
        logToDebug('info', 'Configuring DRM for encrypted stream...');
        await configureDrm(pc);
      } else {
        logToDebug('info', 'Setting up non-DRM playback...');
        // Direct playback without DRM — mirrors whep's onTrack pattern exactly
        pc.addEventListener('track', (event) => {
          console.log('[non-DRM] Track received:', event.track.kind);
          logToDebug('info', `Track received: ${event.track.kind}`);
          if (!streamRef.current) {
            streamRef.current = new MediaStream();
          }
          streamRef.current.addTrack(event.track);
          console.log('[non-DRM] Stream has', streamRef.current.getTracks().length, 'tracks');

          if (videoElement) {
            console.log('[non-DRM] Assigning stream to video element');
            videoElement.srcObject = streamRef.current;
            videoElement.playbackRate = 1.0;  // Ensure normal speed
            videoElement.play().catch((e) =>
              console.warn('[non-DRM] video.play() rejected:', e.message)
            );
          } else {
            console.warn('[non-DRM] videoElement is null, cannot assign stream');
          }

          // Also assign to audio element for non-DRM playback
          if (audioElement) {
            console.log('[non-DRM] Assigning stream to audio element');
            audioElement.srcObject = streamRef.current;
            audioElement.volume = 1.0;
            audioElement.playbackRate = 1.0;  // Fix chipmunk sound
            audioElement.muted = false;
            audioElement.play().catch((e) =>
              console.warn('[non-DRM] audio.play() rejected:', e.message)
            );
          } else {
            console.warn('[non-DRM] audioElement is null, cannot assign stream');
          }
        });
      }

      const handleStateChange = () => {
        const state = pc.connectionState;
        console.log('[WHEP] Connection State:', state);
        logToDebug('info', `WebRTC Connection State: ${state}`);
        if (state === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
          console.log('[WHEP] Connected - checking stream assignment');
          
          // Debug: check if videoElement has stream assigned
          if (videoElement) {
            console.log('[WHEP] Video element exists, checking srcObject:', !!videoElement.srcObject);
            if (videoElement.srcObject) {
              console.log('[WHEP] Stream has', (videoElement.srcObject as MediaStream).getTracks().length, 'tracks');
            }
          } else {
            console.log('[WHEP] WARNING: videoElement is null');
          }
          
          // Ensure video is playing after connection (both DRM and non-DRM)
          if (videoElement) {
            console.log('[WHEP] Connection established, ensuring video is playing');
            videoElement.play().then(() => {
              console.log('[WHEP] video.play() succeeded');
            }).catch((e) =>
              console.warn('[WHEP] video.play() rejected:', e.name, e.message)
            );
          }
          // Backup: ensure srcObject is assigned for non-DRM playback
          if (!encrypted && videoElement && streamRef.current) {
            console.log('[WHEP] Assigning stream to videoElement for non-DRM');
            videoElement.srcObject = streamRef.current;
          }
        } else if (['failed', 'closed', 'disconnected'].includes(state)) {
          setIsConnected(false);
          setIsConnecting(false);
          console.log('[WHEP] Connection ended:', state);
          logToDebug('error', `WebRTC connection ${state}`);
        }
      };

      pc.addEventListener('connectionstatechange', handleStateChange);
      pc.addEventListener('iceconnectionstatechange', () => {
        console.log('ICE Connection State:', pc.iceConnectionState);
        logToDebug('info', `ICE Connection State: ${pc.iceConnectionState}`);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      logToDebug('info', 'Waiting for ICE gathering...');
      // Wait for ICE gathering
      if (pc.iceGatheringState !== 'complete') {
        await Promise.race([
          new Promise<void>((resolve) => {
            const check = () => {
              if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
              }
            };
            pc.addEventListener('icegatheringstatechange', check);
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 2000))
        ]);
      }

      logToDebug('info', `ICE gathering complete. Sending WHEP request to: ${endpoint}`);

      const headers = new Headers();
      headers.append('Content-Type', 'application/sdp');

      console.log('WHEP Signaling URL:', endpoint);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers,
        body: pc.localDescription?.sdp,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log('WHEP Response Status:', response.status);
      logToDebug('info', `WHEP Response Status: ${response.status}`);

      if (response.status === 201) {
        const answerSdp = await response.text();
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
        console.log('Remote description set successfully');
        logToDebug('info', 'Remote description set successfully');
      } else {
        throw new Error(`WHEP signaling failed with status ${response.status}`);
      }

    } catch (error: any) {
      console.error('WHEP connection error:', error);
      
      // Provide more helpful error messages
      let errorMessage = error.message || 'Connection failed';
      
      // Check if it's an encodedInsertableStreams error
      if (errorMessage.includes('Unsupported keySystem') || errorMessage.includes('supportedConfigurations')) {
        errorMessage = 'DRM not supported on this device. Try with encryption disabled or use a different browser/device.';
        logToDebug('error', '⚠️ This device does not support required DRM features (encodedInsertableStreams)');
      }
      // Check if it's an encrypted media error
      else if (errorMessage.includes('encrypted-media') || errorMessage.includes('EME') || errorMessage.includes('media key system')) {
        errorMessage = 'DRM initialization failed. Ensure you are using HTTPS and try again.';
        logToDebug('error', '⚠️ DRM initialization error - check HTTPS and browser compatibility');
      }
      // Check if it's a network error
      else if (error.name === 'AbortError') {
        errorMessage = 'Connection timed out. Check your network connection.';
      }
      
      logToDebug('error', `Connection error: ${errorMessage}`);
      setError(errorMessage);
      setIsConnecting(false);
      disconnect(false);
    }
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    peerConnection: pcRef.current
  };
}