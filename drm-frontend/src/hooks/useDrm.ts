/**
 * useDrm Hook
 *
 * React hook that wraps the shared DRM infrastructure modules to provide
 * a simple `setup()` / `handleTrack()` API for components.
 *
 * Architecture:
 *   detectDrmCapability() → buildDrmConfig() → rtcDrmConfigure() → rtcDrmOnTrack()
 *
 * The hook itself holds a ref to the active DRM config and delegates all
 * heavy lifting to the shared modules in `src/lib/`.
 */

import { useCallback, useRef } from 'react';
import { rtcDrmConfigure, rtcDrmOnTrack } from '../lib/drm';
import type { DrmConfig, TrackConfig } from '../lib/drm';
import { validateDrmKey } from '../lib/drmUtils';
import { detectDrmCapability } from '../lib/drmCapability';
import { buildDrmConfig, attachDrmEventListeners } from '../lib/drmConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDrmOptions {
  merchant: string;
  videoElement: HTMLVideoElement | null;
  audioElement?: HTMLAudioElement | null;
  environment?: 'Staging' | 'Production' | 'Development';
  userId?: string;
  keyId?: Uint8Array;
  iv?: Uint8Array;
  mediaBufferMs?: number;
  encryptionMode?: 'cenc' | 'cbcs';
}

/** Error code thrown when only L3 (software-only) DRM is detected. */
export const WIDEVINE_L3_UNSUPPORTED = 'WIDEVINE_L3_UNSUPPORTED';

// ---------------------------------------------------------------------------
// Logging Helpers
// ---------------------------------------------------------------------------

/** Debug logger that also dispatches to the debug panel overlay. */
export function logDebug(msg: string) {
  console.log(msg);
  window.dispatchEvent(
    new CustomEvent('debug-log', {
      detail: { id: 'player-debug', level: 'info' as const, message: msg, timestamp: new Date().toLocaleTimeString() },
    })
  );
}

/** Error logger that dispatches to the debug panel with error level. */
export function logError(msg: string) {
  console.error(msg);
  window.dispatchEvent(
    new CustomEvent('debug-log', {
      detail: { id: 'player-debug', level: 'error' as const, message: msg, timestamp: new Date().toLocaleTimeString() },
    })
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDrm() {
  const configRef = useRef<DrmConfig | null>(null);

  /**
   * Set up DRM: detect capabilities, build config, and call rtcDrmConfigure.
   * Throws if the device does not support hardware-backed DRM.
   */
  const setup = useCallback(async (options: UseDrmOptions, videoTrackConfig?: TrackConfig) => {
    if (!options.videoElement) return null;

    // ── Validate env keys ─────────────────────────────────────────────
    const keyIdHex = import.meta.env.VITE_DRM_KEY_ID;
    const ivHex = import.meta.env.VITE_DRM_IV;
    const merchantId = import.meta.env.VITE_DRM_MERCHANT;

    if (!validateDrmKey(keyIdHex, 16)) {
      logError('[DRM] Invalid VITE_DRM_KEY_ID format: ' + keyIdHex);
    }
    if (!validateDrmKey(ivHex, 16)) {
      logError('[DRM] Invalid VITE_DRM_IV format: ' + ivHex);
    }

    // ── DRM capability detection ──────────────────────────────────────
    const capability = await detectDrmCapability(logDebug);

    if (!capability.supported) {
      logError(`[DRM] ${capability.blockReason}`);
      const err = new Error(
        capability.blockReason ||
        'This content requires hardware-level content protection. No compatible DRM system found on your device.'
      );
      err.name = WIDEVINE_L3_UNSUPPORTED;
      throw err;
    }

    // ── Build config using shared module ───────────────────────────────
    const config = buildDrmConfig({
      merchant: options.merchant || merchantId,
      userId: options.userId || 'elidev-test',
      environmentName: options.environment || 'Staging',
      videoElement: options.videoElement,
      audioElement: options.audioElement || undefined,
      keyIdHex: keyIdHex,
      ivHex: ivHex,
      encryptionMode: options.encryptionMode || 'cbcs',
      capability,
    });

    // Override video config if caller provided one
    if (videoTrackConfig) {
      config.video = videoTrackConfig;
    }

    configRef.current = config;

    // ── Attach event listeners ────────────────────────────────────────
    attachDrmEventListeners(options.videoElement, options.audioElement || undefined, {
      onDebug: logDebug,
      onError: logError,
    });

    // ── Initialize DRM ────────────────────────────────────────────────
    logDebug('Using Callback Authorization — backend will provide CRT');
    logDebug(`Merchant: ${config.merchant}, UserId: ${options.userId || 'elidev-test'}`);

    try {
      rtcDrmConfigure(config);
      logDebug('rtcDrmConfigure succeeded — license request sent to DRMtoday');
    } catch (err: any) {
      logDebug(`rtcDrmConfigure FAILED: ${err.message}`);
      console.error('[DRM-HOOK] rtcDrmConfigure failed:', err);
      throw err;
    }

    return config;
  }, []);

  /**
   * Handle an incoming RTC track event.
   * Delegates to rtcDrmOnTrack and attempts playback.
   */
  const handleTrack = useCallback((event: RTCTrackEvent) => {
    logDebug(`Track received: ${event.track.kind}`);
    if (configRef.current) {
      try {
        rtcDrmOnTrack(event);

        const videoElement = configRef.current.videoElement;
        const audioElement = configRef.current.audioElement;

        if (event.track.kind === 'video' && videoElement) {
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => logDebug('videoElement.play() resolved'))
              .catch(err => {
                if (err.name !== 'AbortError') {
                  logDebug(`videoElement.play() rejected: ${err.message}`);
                }
              });
          }
        } else if (event.track.kind === 'audio' && audioElement) {
          const playPromise = (audioElement as HTMLAudioElement).play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => logDebug('audioElement.play() resolved'))
              .catch(err => {
                if (err.name !== 'AbortError') {
                  logDebug(`audioElement.play() rejected: ${err.message}`);
                }
              });
          }
        }
      } catch (err: any) {
        logDebug(`rtcDrmOnTrack FAILED: ${err.message}`);
        console.error('[DRM-HOOK] rtcDrmOnTrack failed:', err);
        throw err;
      }
    }
  }, []);

  return {
    setup,
    handleTrack,
    config: configRef.current,
  };
}