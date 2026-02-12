import { useState, useCallback, useRef } from 'react';
import { negotiateConnectionWithClientOffer } from '../lib/whipUtils';

export interface WhipOptions {
  endpoint: string;
  encrypted?: boolean;
  configureDrm?: (pc: RTCPeerConnection) => Promise<void>;
}

export function useWhip() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const disconnect = useCallback(async (clearError = true) => {
    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    if (clearError) {
      setError(null);
    }
  }, []);

  const connect = useCallback(
    async (options: WhipOptions, videoElement: HTMLVideoElement | null) => {
      const logToDebug = (level: 'info' | 'error' | 'warning', msg: string) => {
        window.dispatchEvent(
          new CustomEvent('debug-log', {
            detail: { id: 'broadcaster-debug', level, message: msg, timestamp: new Date().toLocaleTimeString() },
          })
        );
      };

      await disconnect();
      setError(null);
      setIsConnecting(true);

      const { endpoint, encrypted, configureDrm } = options;

      try {
        logToDebug('info', 'Starting WHIP connection...');
        
        let pc: RTCPeerConnection;
        
        // Try to create RTCPeerConnection with encodedInsertableStreams
        // Some browsers/devices don't support this feature, so we need fallback
        try {
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
            bundlePolicy: 'max-bundle',
            // @ts-ignore - encodedInsertableStreams for DRM
            encodedInsertableStreams: !!encrypted,
          });
          logToDebug('info', `RTCPeerConnection created with encodedInsertableStreams=${encrypted}`);
        } catch (insertableStreamsError: any) {
          // Fallback: try without encodedInsertableStreams if the browser doesn't support it
          console.warn('[WHIP] encodedInsertableStreams not supported, creating RTCPeerConnection without it:', insertableStreamsError.message);
          logToDebug('warning', `Browser doesn't support encodedInsertableStreams, falling back to standard WebRTC`);
          
          if (encrypted) {
            console.warn('[WHIP] DRM encryption requested but encodedInsertableStreams is not supported. Broadcasting may not work.');
            logToDebug('error', '⚠️ DRM requires encodedInsertableStreams which is not supported on this device. Broadcasting may fail.');
          }
          
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
            bundlePolicy: 'max-bundle',
          });
          logToDebug('info', 'RTCPeerConnection created without encodedInsertableStreams');
        }
        
        pcRef.current = pc;

        // Setup connection state handlers
        const handleStateChange = () => {
          const state = pc.connectionState;
          console.log('WHIP Connection State:', state);
          logToDebug('info', `WHIP Connection State: ${state}`);
          if (state === 'connected') {
            setIsConnected(true);
            setIsConnecting(false);
            logToDebug('info', 'WHIP Connected successfully');
          } else if (['failed', 'closed', 'disconnected'].includes(state)) {
            setIsConnected(false);
            setIsConnecting(false);
            if (state === 'failed') {
              setError('Connection failed');
              logToDebug('error', 'WHIP Connection failed');
            }
          }
        };

        pc.addEventListener('connectionstatechange', handleStateChange);
        pc.addEventListener('iceconnectionstatechange', () => {
          console.log('WHIP ICE Connection State:', pc.iceConnectionState);
          logToDebug('info', `WHIP ICE Connection State: ${pc.iceConnectionState}`);
        });

        // Log actions to backend audit system
        if (endpoint) {
          pc.addEventListener('connectionstatechange', () => {
            console.log('WHIP connection state:', pc.connectionState);
            logToDebug('info', `Connection state: ${pc.connectionState}`);
          });
        }

        // Listen for negotiation needed
        pc.addEventListener('negotiationneeded', async () => {
          console.log('WHIP negotiation starting');
          logToDebug('info', 'WHIP negotiation starting');
          try {
            await negotiateConnectionWithClientOffer(pc, endpoint);
            console.log('WHIP negotiation completed');
            logToDebug('info', 'WHIP negotiation completed');
          } catch (err: any) {
            console.error('WHIP negotiation error:', err);
            logToDebug('error', `WHIP negotiation error: ${err.message || 'Negotiation failed'}`);
            setError(err.message || 'Negotiation failed');
            setIsConnecting(false);
          }
        });

        // Load encryption module FIRST before accessing media (if DRM is enabled)
        if (encrypted && configureDrm) {
          console.info('[WHIP] Loading encryption module before media access...');
          logToDebug('info', 'Loading encryption module before media access...');
          await configureDrm(pc);
        }

        // Access local media (camera/microphone)
        const stream = await accessLocalMediaSources(pc, encrypted);
        localStreamRef.current = stream;

        // Show local preview
        if (videoElement && stream) {
          videoElement.srcObject = stream;
          videoElement.muted = true; // Always mute local preview to avoid feedback
        }
      } catch (err: any) {
        console.error('WHIP connection error:', err);
        window.dispatchEvent(
          new CustomEvent('debug-log', {
            detail: { id: 'broadcaster-debug', level: 'error', message: `WHIP connection error: ${err.message || 'Connection failed'}`, timestamp: new Date().toLocaleTimeString() },
          })
        );
        setError(err.message || 'Connection failed');
        setIsConnecting(false);
        await disconnect(false);
      }
    },
    [disconnect]
  );

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    peerConnection: pcRef.current,
    localStream: localStreamRef.current,
  };
}

/**
 * Access local media sources (camera and microphone)
 * and add them to the peer connection
 */
async function accessLocalMediaSources(
  pc: RTCPeerConnection,
  encrypted?: boolean
): Promise<MediaStream> {
  try {
    // Enumerate available devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === 'videoinput');
    const audioDevices = devices.filter((device) => device.kind === 'audioinput');

    console.log('Available video devices:', videoDevices.map((d) => d.label || d.deviceId));
    console.log('Available audio devices:', audioDevices.map((d) => d.label || d.deviceId));

    if (videoDevices.length === 0) {
      throw new Error(
        'No video input devices found. If using OBS Virtual Camera, make sure it is started.'
      );
    }

    // Try different video constraint strategies
    let stream: MediaStream | null = null;
    const videoConstraints: MediaStreamConstraints[] = [
      // Most permissive first (for virtual cameras)
      { video: true, audio: true },
      // Flexible resolution constraints
      {
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
        audio: true,
      },
      // Try specific device if OBS Virtual Camera detected
      ...(videoDevices.some((d) => d.label.toLowerCase().includes('obs'))
        ? [
            {
              video: {
                deviceId: videoDevices.find((d) => d.label.toLowerCase().includes('obs'))!.deviceId,
              },
              audio: true,
            },
          ]
        : []),
      // Specific resolution
      { video: { width: 1280, height: 720 }, audio: true },
      // Video only without audio
      { video: true, audio: false },
    ];

    for (let i = 0; i < videoConstraints.length; i++) {
      const constraints = videoConstraints[i];
      try {
        console.log(
          `Attempt ${i + 1}/${videoConstraints.length}: Trying getUserMedia with constraints:`,
          constraints
        );
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(
          'Successfully got media stream with tracks:',
          stream.getTracks().map((t) => ({ kind: t.kind, label: t.label }))
        );
        break;
      } catch (err: any) {
        console.warn(
          `Attempt ${i + 1} failed with constraints`,
          constraints,
          '- Error:',
          err.name,
          err.message
        );
        if (err.name === 'NotAllowedError') {
          throw new Error(
            'Camera/microphone permission denied. Please allow access and refresh the page.'
          );
        }
        // Continue to next constraint
        continue;
      }
    }

    if (!stream) {
      throw new Error(
        'No camera or microphone found. Make sure OBS Virtual Camera is started and accessible.'
      );
    }

    // Add tracks to peer connection
    stream.getTracks().forEach((track) => {
      console.log(`Adding ${track.kind} track:`, track.label);
      const transceiver = pc.addTransceiver(track, {
        direction: 'sendonly', // WHIP is only for sending
      });

      // Apply video constraints after track is added
      if (track.kind === 'video' && transceiver.sender.track) {
        try {
          transceiver.sender.track.applyConstraints({
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30 },
          });
        } catch (constraintErr: any) {
          console.warn('Could not apply video constraints:', constraintErr.message);
        }
      }

      // Setup sender transforms for encryption if DRM is enabled
      // Note: encryption module is already loaded at this point (loaded before media access)
      if (encrypted) {
        console.info(`[WHIP] Setting up sender transform for ${track.kind} track`);
        setupSenderTransform(transceiver, track.kind);
      }
    });

    return stream;
  } catch (error: any) {
    console.error('Error accessing media devices:', error);
    throw error;
  }
}

/**
 * Setup sender transform for encryption
 */
function setupSenderTransform(transceiver: RTCRtpTransceiver, trackType: string) {
  try {
    // @ts-ignore - createEncodedStreams is not in TypeScript types yet
    const senderStreams = transceiver.sender.createEncodedStreams();
    const { readable, writable } = senderStreams;

    const transformStream = new TransformStream({
      transform:
        trackType === 'video' ? videoTransformFunction : audioTransformFunction,
    });

    readable.pipeThrough(transformStream).pipeTo(writable);
    console.info(`[WHIP] Sender transform set up for ${trackType}`);
  } catch (err) {
    console.error(`[WHIP] Failed to setup sender transform for ${trackType}:`, err);
  }
}

// Global encryption module reference (will be set by configureDrm)
let encryptionModule: any = null;

export function setEncryptionModule(module: any) {
  encryptionModule = module;
}

/**
 * Video transform function for encryption
 */
let frameCount = 0;
async function videoTransformFunction(encodedFrame: any, controller: any) {
  // Wait for encryption module to be loaded
  if (!encryptionModule) {
    // Pass through unencrypted if module not ready yet
    console.warn('[WHIP] Encryption module not loaded, passing frame UNENCRYPTED!');
    controller.enqueue(encodedFrame);
    return;
  }

  try {
    frameCount++;
    console.log(`[WHIP] Frame #${frameCount}: Processing ${encodedFrame.data.byteLength} bytes BEFORE encryption`);
    
    const srcBuf = encryptionModule.getSrcBuffer();
    srcBuf.set(new Uint8Array(encodedFrame.data));
    const encryptedSize = encryptionModule.encrypt(encodedFrame.data.byteLength);

    if (encryptedSize > 0) {
      // Retrieve the encrypted data from the encryptor
      const dstBuf = encryptionModule.getDstBuffer();
      const newData = new ArrayBuffer(encryptedSize);
      new Uint8Array(newData).set(dstBuf);

      encodedFrame.data = newData;
      
      // Log first 10 frames to confirm encryption is working
      if (frameCount <= 10) {
        console.log(`[WHIP] Frame #${frameCount}: ENCRYPTED from ${encodedFrame.data.byteLength} -> ${encryptedSize} bytes`);
      }
    } else {
      console.error(`[WHIP] Frame #${frameCount}: Encryption returned 0 bytes!`);
    }
  } catch (err) {
    console.error(`[WHIP] Frame #${frameCount}: Video encryption FAILED:`, err);
  }

  controller.enqueue(encodedFrame);
}

/**
 * Audio transform function (pass-through, audio is not encrypted)
 */
async function audioTransformFunction(encodedFrame: any, controller: any) {
  // Audio is not encrypted - just pass through
  controller.enqueue(encodedFrame);
}
