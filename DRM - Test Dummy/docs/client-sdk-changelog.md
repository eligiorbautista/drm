# Client-side DRM SDK change log

## 2.7.0 2025-12-09 d67a984
* More robust handling of mixed 3- and 4-byte H.264 start codes.
* Accurate tracking of emulation prevention bytes to improve handling of non-VCL NALU alterations in transit.
* WASM OpenSSL version updated to 3.5.4.

## 2.6.3 2025-07-30 3d3f657
* Persistent license requests disabled in Firefox (to avoid lengthy error messages in Dev Console).
* Emscripten 4.0.7+ crash fix (HEAP** methods have to be exported manually now).
* WASM OpenSSL version updated to 3.5.1.

## 2.6.2 2025-03-21 4932d8c
* Persistent license requests are back (it was a DRMtoday change around Test Authorization sessionId tokens), deprecated sessionId p0 / a1d1f1 replaced with CRT.
* Fix for crash in custom-transform sample in Chrome with Experimental Web Platform Features enabled.
* WASM OpenSSL version updated to 3.4.1.

## 2.6.1 2025-03-19 99c77f2
* requestMediaKeySystemAccess(persistent-license) attempt removed as it breaks the latest Chrome on macOS / DRMtoday interaction (license requests are rejected with 400 / DRM_PERSISTENCE_FORBIDDEN). This could be a side-effect of DRMTODAY-5329 and might be re-enabled later.

## 2.6.0 2025-01-13 96d4176
* AV1 encryption and decryption support (both server-side CENC and TS/JS SDKs).

## 2.5.1 2024-12-12 436f773
* WHIP & WHEP sample apps are now included in SDK.
* Default media buffer size fix for Firefox: had to be increased to 900 ms unfortunately, it would stutter quite often otherwise.

## 2.5.0 2024-12-10 69b04e4
* Pick older InsertableStreams API over RTCRtpScriptTransform if both are present (the latter is still flaky in Chrome).
* Dummy frame buffer handling fix: track detached property as the buffer might get transferred/invalidated by the browser (affects Firefox and experimental RTCRtpScriptTransform implementation in Chrome).
* cross-spawn updated from 7.0.3 to 7.0.5.
* @eslint/plugin-kit updated from 0.2.0 to 0.2.3.
* Adjustable logging verbosity levels, in (raw h.264 and Opus) / out (fmp4 as fed to MSE) media dumps.
* Reset frame seq number tracking on key frames for stream switching purposes.
* Centralized configurable debug logging.

## 2.4.1 2024-10-09 854c418
* Centralized platform checks (fixes React Native freeze).
* saiz box fix for multi-slice frames.
* PlayReady PSSH generation fix (broken by TS changes).

## 2.4.0 2024-10-04 337e773
* TypeScript API for the transformer library.

## 2.3.2 2024-09-19 af80cb8
* Media buffer size setting fixes.
* Pause/Resume fix (handle new rtcDrmConfigure call without accompanying rtcDrmOnTrack).
