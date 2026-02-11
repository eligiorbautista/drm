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
      
      const pc = new RTCPeerConnection({
        bundlePolicy: 'max-bundle',
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
        // @ts-ignore
        encodedInsertableStreams: encrypted
      });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

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
            videoElement.play().catch((e) =>
              console.warn('[non-DRM] video.play() rejected:', e.message)
            );
          } else {
            console.warn('[non-DRM] videoElement is null, cannot assign stream');
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
      logToDebug('error', `Connection error: ${error.message || 'Connection failed'}`);
      setError(error.message || 'Connection failed');
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