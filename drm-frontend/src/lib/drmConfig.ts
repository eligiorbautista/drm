/**
 * DRM Configuration Builder Module
 *
 * Builds platform-aware DRM config objects for the rtc-drm-transform library.
 * Handles:
 *   - Platform-specific video track config (FairPlay vs Widevine/PlayReady)
 *   - Media buffer sizing (Android 1200ms, Firefox 900ms, default 600ms)
 *   - Diagnostic event listener attachment
 *   - Track handler setup with retry-play logic
 *
 * This module is shared between /viewer and /embed players.
 */

import { rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments } from './drm';
import type { DrmConfig } from './drm';
import { hexToUint8Array } from './drmUtils';
import type { DrmCapabilityResult } from './drmCapability';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for building a DRM config. */
export interface BuildDrmConfigOptions {
    /** DRMtoday merchant ID (from env or prop). */
    merchant: string;
    /** User ID for Callback Authorization. */
    userId: string;
    /** DRMtoday environment name: 'Staging' | 'Production'. */
    environmentName: string;
    /** The video <video> element. */
    videoElement: HTMLVideoElement;
    /** The audio <audio> element (required by rtc-drm-transform). */
    audioElement?: HTMLAudioElement;
    /** Encryption key ID as hex string. */
    keyIdHex: string;
    /** Initialization vector as hex string. */
    ivHex: string;
    /** Encryption mode — must match the sender's mode. */
    encryptionMode?: 'cenc' | 'cbcs';
    /** DRM capability detection results. */
    capability: DrmCapabilityResult;
    /**
     * Optional fetch interceptor for debugging license requests.
     * If provided, the DRM library will use this instead of global fetch.
     */
    onFetch?: (url: string, opts: any) => Promise<Response>;
}

/** Callbacks from DRM event listeners. */
export interface DrmEventHandlers {
    /** Called for debug/info messages. */
    onDebug?: (msg: string) => void;
    /** Called for error messages. */
    onError?: (msg: string) => void;
    /** Called for warning messages. */
    onWarning?: (msg: string) => void;
    /** Called when a DRM error should be shown in the UI. */
    onDrmError?: (msg: string) => void;
    /** Called when a track starts playing successfully. */
    onPlayStarted?: () => void;
    /** Called to set muted state (for autoplay fallback). */
    onSetMuted?: (muted: boolean) => void;
}

// ---------------------------------------------------------------------------
// Config Builder
// ---------------------------------------------------------------------------

/**
 * Build the DRM config object for `rtcDrmConfigure()`.
 *
 * This creates the full config with platform-specific settings:
 * - iOS/FairPlay: uses iv only (keyId comes from the FairPlay SKD URL)
 * - Others: uses explicit keyId + iv + HW robustness
 * - Media buffer is sized per-platform for smooth hardware decryption
 *
 * @returns The config object ready to pass to `rtcDrmConfigure()`
 */
export function buildDrmConfig(options: BuildDrmConfigOptions): DrmConfig {
    const {
        merchant,
        userId,
        environmentName,
        videoElement,
        audioElement,
        keyIdHex,
        ivHex,
        encryptionMode = 'cbcs',
        capability,
        onFetch,
    } = options;

    const platform = capability.platform;

    // Convert hex keys to Uint8Arrays
    const keyId = hexToUint8Array(keyIdHex);
    const iv = hexToUint8Array(ivHex);

    // ── Video track config ────────────────────────────────────────────────
    // FairPlay on iOS/Safari: keyId is extracted from the SKD URL by the CDM,
    // so we only pass iv. The robustness parameter is not supported by FairPlay.
    let videoConfig: any;  // `any` because requireHDCP is used by the library but not in the TS type

    if (platform.isIOS) {
        videoConfig = {
            codec: 'H264' as const,
            encryption: 'cbcs' as const,  // FairPlay always uses cbcs
            iv,                            // iv is REQUIRED for FairPlay
            requireHDCP: 'HDCP_v1' as const,  // Output protection enforcement
        };
    } else {
        // Widevine/PlayReady: explicit keyId + iv + HW-only robustness
        videoConfig = {
            codec: 'H264' as const,
            encryption: encryptionMode as 'cenc' | 'cbcs',
            robustness: 'HW' as const,    // Only L1/hardware — L3 devices are blocked upstream
            keyId,
            iv,
            requireHDCP: 'HDCP_v1' as const,  // Output protection enforcement
        };
    }

    // ── Media buffer sizing ───────────────────────────────────────────────
    // Hardware decryption pipelines have varying latency requirements:
    // - Android (Widevine L1): 1200ms — MediaCodec HW pipeline needs buffering
    // - Firefox (any platform): 900ms — per client-sdk-changelog.md
    // - All others: 600ms — general SW-to-HW handoff buffer
    let mediaBufferMs = -1;
    if (platform.isAndroid) {
        mediaBufferMs = 1200;
    } else if (platform.isFirefox) {
        mediaBufferMs = 900;
    } else {
        mediaBufferMs = 600;
    }

    // ── DRMtoday environment ──────────────────────────────────────────────
    // @ts-ignore: Accessing static properties via string index
    const env = rtcDrmEnvironments[
        environmentName === 'Production' || environmentName === 'production'
            ? 'Production'
            : 'Staging'
    ];

    // ── Build final config ────────────────────────────────────────────────
    // CALLBACK AUTHORIZATION MODE:
    // DRMtoday calls our backend at /api/callback to get the CRT.
    // We don't generate authToken or sessionId client-side.
    // Just pass: merchant, userId, and environment.
    const config: any = {
        merchant,
        userId,
        environment: env,
        videoElement,
        audioElement: audioElement || undefined,
        video: videoConfig,
        audio: { codec: 'opus' as const, encryption: 'clear' as const },
        logLevel: 3,
        mediaBufferMs,
        type: capability.selectedDrmType,
    };

    // Attach fetch interceptor if provided (for debugging license requests)
    if (onFetch) {
        config.onFetch = onFetch;
    }

    return config as DrmConfig;
}

// ---------------------------------------------------------------------------
// Event Listener Attachment
// ---------------------------------------------------------------------------

/**
 * Attach diagnostic event listeners to video/audio elements and the
 * rtcdrmerror custom event.
 *
 * These listeners provide visibility into the media pipeline and DRM errors
 * without cluttering the consumer code.
 */
export function attachDrmEventListeners(
    videoElement: HTMLVideoElement,
    audioElement: HTMLAudioElement | undefined,
    handlers: DrmEventHandlers,
): void {
    const log = handlers.onDebug || (() => { });

    // ── Media element diagnostic events ───────────────────────────────────
    const diagnosticEvents = [
        'loadedmetadata', 'loadeddata', 'canplay', 'playing',
        'waiting', 'stalled', 'error', 'emptied', 'suspend',
    ];
    for (const evName of diagnosticEvents) {
        videoElement.addEventListener(evName, () => log(`video event: ${evName}`));
        if (audioElement) {
            audioElement.addEventListener(evName, () => log(`audio event: ${evName}`));
        }
    }

    // Detailed video error logging
    videoElement.addEventListener('error', () => {
        const e = videoElement.error;
        log(`video MediaError: code=${e?.code}, message=${e?.message}`);
    });

    // ── DRM error event ───────────────────────────────────────────────────
    // The rtc-drm-transform library fires 'rtcdrmerror' on the video element
    // for any DRM-related error. We classify them as fatal vs non-fatal.
    videoElement.addEventListener('rtcdrmerror', (event: any) => {
        const msg = event.detail?.message || 'Unknown DRM error';
        log(`DRM ERROR: ${msg}`);

        // Non-fatal DRM events that should NOT block the UI:
        //
        // 1. output-restricted/downscaled: CDM may still allow playback
        // 2. requestMediaKeySystemAccess failures: the DRM library probes multiple
        //    CDMs internally. A failure for ONE CDM is expected if the device uses
        //    a different CDM (e.g., Windows with Widevine L3 will fail
        //    `com.widevine.alpha.experiment` but then succeed with PlayReady).
        // 3. "not usable for decryption": transient key status, often resolves.
        const isNonFatal = msg.includes('output-restricted') ||
            msg.includes('output-downscaled') ||
            msg.includes('status: output-restricted') ||
            msg.includes('not usable for decryption') ||
            msg.includes('requestMediaKeySystemAccess');

        if (isNonFatal) {
            log(`[DRM] Non-fatal DRM event — treating as warning: ${msg}`);
            console.warn('[DRM]', msg);
            return; // Don't block the UI — let the library try other CDMs
        }

        // Fatal DRM error — show in UI
        const isInIframe = window.self !== window.top;
        if (isInIframe && msg.includes('not-allowed')) {
            const iframeHint = 'DRM blocked inside iframe. '
                + 'The parent page must embed with: <iframe allow="encrypted-media; autoplay" ...>';
            log(iframeHint);
            handlers.onDrmError?.(iframeHint);
        } else {
            handlers.onDrmError?.(`DRM error: ${msg}`);
        }
    });
}

// ---------------------------------------------------------------------------
// Track Handler
// ---------------------------------------------------------------------------

/**
 * Create a track event handler that processes incoming RTC tracks through
 * the DRM pipeline and starts playback with retry logic.
 *
 * The handler calls `rtcDrmOnTrack()` to pipe the encrypted track through
 * the CDM, then attempts `element.play()` with exponential backoff and
 * autoplay-policy handling (mute + retry).
 *
 * @param videoElement - The <video> element
 * @param audioElement - The <audio> element
 * @param handlers - Callbacks for logging, error handling, and state updates
 * @returns A function suitable for `pc.addEventListener('track', handler)`
 */
export function createDrmTrackHandler(
    videoElement: HTMLVideoElement,
    audioElement: HTMLAudioElement | undefined,
    handlers: DrmEventHandlers,
): (event: RTCTrackEvent) => void {
    const log = handlers.onDebug || (() => { });
    const logErr = handlers.onError || (() => { });

    /**
     * Retry play() with exponential backoff.
     * On NotAllowedError (autoplay policy), mutes the element and retries.
     */
    const retryPlay = async (
        element: HTMLMediaElement,
        elementName: string,
        maxRetries = 3,
    ): Promise<boolean> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await element.play();
                log(`${elementName}: play() succeeded on attempt ${attempt}`);
                return true;
            } catch (err: any) {
                log(`${elementName}: play() rejected on attempt ${attempt}: ${err.name} - ${err.message}`);

                // Autoplay policy restriction — mute and retry
                if (err.name === 'NotAllowedError') {
                    log(`${elementName}: Autoplay blocked, muting and retrying...`);
                    element.muted = true;
                    if (element === videoElement) handlers.onSetMuted?.(true);

                    try {
                        await element.play();
                        log(`${elementName}: play() succeeded after muting`);
                        return true;
                    } catch (mutePlayErr: any) {
                        logErr(`${elementName}: play() failed even after muting: ${mutePlayErr.message}`);
                    }
                }

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
                    log(`${elementName}: Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    logErr(`${elementName}: Failed to play after ${maxRetries} attempts: ${err.message}`);
                    return false;
                }
            }
        }
        return false;
    };

    // ── Track handler ─────────────────────────────────────────────────────
    return (event: RTCTrackEvent) => {
        log(`Track received: ${event.track.kind}`);
        try {
            // Call rtcDrmOnTrack — the library uses the config from rtcDrmConfigure()
            rtcDrmOnTrack(event);
            log(`rtcDrmOnTrack succeeded for ${event.track.kind} — stream is being DECRYPTED`);

            // Start playback with retry logic
            if (event.track.kind === 'video') {
                retryPlay(videoElement, 'videoElement').then(success => {
                    if (success) handlers.onPlayStarted?.();
                });
            } else if (event.track.kind === 'audio' && audioElement) {
                retryPlay(audioElement, 'audioElement');
            }
        } catch (err: any) {
            log(`rtcDrmOnTrack FAILED: ${err.message}`);
            logErr(`DRM Error — the stream might NOT be encrypted or keys don't match: ${err.message}`);
        }
    };
}

// ---------------------------------------------------------------------------
// Convenience: Full DRM Setup
// ---------------------------------------------------------------------------

/**
 * Initialize DRM on a peer connection with full config + event listeners + track handler.
 *
 * This is the highest-level entry point. It:
 * 1. Builds the DRM config
 * 2. Attaches diagnostic event listeners
 * 3. Calls `rtcDrmConfigure()` to start the license acquisition
 * 4. Wires the track handler for decrypted playback
 *
 * @param pc - The RTCPeerConnection to attach the track handler to
 * @param options - Config building options
 * @param handlers - Event callbacks for logging and UI state
 */
export function initializeDrm(
    pc: RTCPeerConnection,
    options: BuildDrmConfigOptions,
    handlers: DrmEventHandlers,
): DrmConfig {
    const log = handlers.onDebug || (() => { });

    // Step 1: Build config
    const config = buildDrmConfig(options);
    log(`DRM config built: type=${config.type}, encryption=${options.encryptionMode || 'cbcs'}, mediaBufferMs=${config.mediaBufferMs}`);

    // Step 2: Attach event listeners
    attachDrmEventListeners(
        options.videoElement,
        options.audioElement,
        handlers,
    );

    // Step 3: Configure DRM (starts license acquisition)
    log('Using Callback Authorization — backend will provide CRT');
    log(`Merchant: ${options.merchant}, UserId: ${options.userId}`);

    try {
        rtcDrmConfigure(config);
        log('rtcDrmConfigure succeeded — license request sent to DRMtoday, waiting for callback...');
    } catch (err: any) {
        log(`rtcDrmConfigure FAILED: ${err.message}`);
        throw err;
    }

    // Step 4: Wire track handler
    const trackHandler = createDrmTrackHandler(
        options.videoElement,
        options.audioElement,
        handlers,
    );
    pc.addEventListener('track', trackHandler);

    return config;
}
