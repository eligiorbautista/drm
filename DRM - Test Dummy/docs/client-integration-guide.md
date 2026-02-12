# Client-side DRM integration guide

This SDK consists of the "Transformer" TS/JS library (`rtc-drm-transform.min.js`) and several JS RTCPeerConnection-based sample applications.

Sample integrations with third-party TS/JS browser WebRTC frameworks are also available and are largely identical in terms of the changes required:
* Cloudflare: https://github.com/vitaly-castLabs/cloudflare-integration (private repo)
* LiveKit: https://github.com/vitaly-castLabs/client-sdk-js
* Millicast/Dolby: https://github.com/vitaly-castLabs/millicast-sdk
* Red5: https://github.com/vitaly-castLabs/streaming-html5

The SDK is supposed to be served from the top folder over HTTP with `python3 -m http.server` or similar. However HTTPS is preferred since DRM won't function outside localhost context with HTTP. A simple performant HTTPS server with pre-generated self-signed certtificate can be found at https://github.com/vitaly-castLabs/httpsrv. Once the server is running, load https://localhost:${port}/standalone/ in the browser - Chrome, Edge and Safari are recommended.

## 1. Minimal integration example

Assuming you already have a WebRTC player (if not, get one from https://webrtc.github.io/samples), we'll go through the adjustments to be made to enable playback of DRM-protected media.

Import the needed methods:
```js
import {rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments} from 'rtc-drm-transform.min.js';
```

Enable `encodedInsertableStreams` (aka EncodedStreams API) in `RTCPeerConnection` config:
```js
let rtcPeerConnectionConfig = {
    ...
    encodedInsertableStreams: true
};

let pc = new RTCPeerConnection(rtcPeerConnectionConfig);
```

Fill out the DRM configuration object (required fields are listed in the sample code below) and call `rtcDrmConfigure` with this object. Please note that two `HTMLMediaElement`'s are needed - one for the video stream (has to be `HTMLVideoElement` / `<video>`) and one for the audio stream (can be `<audio>` or `<video>`), in case one of them encrypted and the other is not.

```js
// DRMtoday key id, 16-byte Uint8Array. See DRMtoday's Key ingestion API on how to generate/ingest an encryption key
const keyId = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
// (example, should be random) initialization vector, only needed for Safari/FairPlay
const iv = new Uint8Array([0xd5, 0xfb, 0xd6, 0xb8, 0x2e, 0xd9, 0x3e, 0x4e, 0xf9, 0x8a, 0xe4, 0x09, 0x31, 0xee, 0x33, 0xb7]);

const drmConfig = {
    merchant: '<your DRMtoday merchant id>',

    environment: rtcDrmEnvironments.Staging,

    videoElement: document.getElementById('remote-video'),
    audioElement: document.getElementById('remote-audio'),

    video: {codec: 'H264', encryption: 'cbcs', keyId, iv},
    audio: {codec: 'opus', encryption: 'clear'}
};

try {
    rtcDrmConfigure(drmConfig);
}
catch (err) {
    alert(`DRM initialization error: ${err.message}`);
}
```

And the last step: set up a `track` event listener to notify the transform library about WebRTC audio and video tracks being created:

```js
pc.addEventListener('track', (event) => {
    rtcDrmOnTrack(event);
});
```

That's all for a quick start. However it's recommended to take care of handling of all the DRM errors early on: catching exceptions thrown by `rtcDrmConfigure`, as shown above, is essential, but doesn't cover all the scenarios. The most common one is the output protection failure on macOS when there's an external display(s) in use - it surfaces only when the browser CDM sends a license request and it gets rejected (due to HDCP being unavailable).

These unexpected DRM failures are dispatched as custom `rtcdrmerror` events delivered via the target video element:

```js
drmConfig.videoElement.addEventListener('rtcdrmerror', (event) => {
    // the message can contain a MediaKeyStatus from the EME specification
    // (https://www.w3.org/TR/encrypted-media/#dom-mediakeystatus) as well as
    // the ID (event.detail.keyId) of the failed decryption key
    alert(`DRM error: ${event.detail.message}`);
    // disconnect / unsubscribe
})
```

Note that `rtcDrmOnTrack` might throw an exception just like `rtcDrmConfigure`, so it is recommended to wrap it in `try`/`catch` too - especially if you work with several DRM-protected videos on the same page (there's a dedicated chapter on that below).

## 2. Advanced configuration options

To use ClearKey DRM (not available with Safari) for testing/debugging purposes, omit `keyId` and `iv` parameters (the default test key `3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c` and IV `d5fbd6b82ed93e4ef98ae40931ee33b7` are assumed in this case, the license containing these is generated locally, i.e. no DRMtoday requests sent):
```js
const drmConfig = {
    ...
    video: {codec: 'H264', encryption: 'cbcs'},
    ...
};
```

As of JS/TS SDK 2.6.0, the supported video codecs are 'H264' and 'AV1', and the only supported audio codec is 'opus'.

Other optional DRM config params:
```js
// Customer Rights Token, used for generation of sessionId below (only relevant for Test Authorization, aka Test Dummy)
// https://fe.staging.drmtoday.com/documentation/integration/customer_rights_token.html#customer-rights-token
let crt = {
    "profile": {
        "purchase": {}
    },
    "outputProtection": {
        "enforce": false    // disable screen capture protection
    }
}

const drmConfig = {
    ...
    // use this, if you don't see any video or it throws "output-restricted" error. This can happen on Linux or
    // with non-HDCP-compliant external monitors. A known macOS issue: as soon as an external monitor is attached
    // to an iMac / MacBook, HDCP gets deactivated on all monitors including the built-in
    // one, and license requests will start failing.
    // https://fe.staging.drmtoday.com/documentation/integration/license_delivery_authorization.html#test-authorization-method
    sessionId: `crtjson:${JSON.stringify(crt)}`,

    // average target latency. Can be set to 0, enabling zero-buffering mode (which
    // is not recommended as it affects video playback smoothness). The default value
    // is 100 ms, except when PlayReady or Widevine L1 on Windows are used - those
    // require at least 600 ms buffer for SW-secure decryption/playback and 1200 ms
    // for HW-secure one
    mediaBufferMs: 1000,

    // use 'cenc'/AES-CTR decryption mode, request HW-secure DRM for video and SW-secure
    // one for audio
    video: {codec: 'H264', encryption: 'cenc', robustness: 'HW', keyId: videoKeyId, iv: videoIv},
    audio: {codec: 'opus', encryption: 'cenc', robustness: 'SW', keyId: audioKeyId, iv: audioIv},

    // instruct the browser to use PlayReady CDM. This only makes sense for Edge which
    // supports both PlayReady and Widevine, other browsers support only one DRM type
    // (at best) which will be selected automatically
    type: 'PlayReady',

    // enable extra debug logging (4 is LogLevel.Debug in TS)
    logLevel: 4,

    // this will save:
    // 1) the first 25s of encrypted video feed, as it's delivered by
    // RTCRtpScriptTransform/TransformStream (raw Annex B H.264). The produced media dump files
    // can be inspected with 'cat video.h264 | ./stdin-es-decryptor [key] [iv] | ffplay -f h264 -i -'
    // (./stdin-es-decryptor is a part of castLabs CENC SDK);
    // 2) the first 15s of the encrypted video feed, as it's pushed to the browser CDM
    // via MSE (fmp4). The produced media dump files can be inspected with
    // 'ffplay -decryption_key <key> video.mp4'
    // (in all the cases above the en/decryption key and IV are provided in hex)
    mediaDumps: {
        video: {in: {durationMs: 25000}, out: {durationMs: 15000}}
    }

    ...
};
```

Average target latency (`drmConfig`'s `mediaBufferMs`) can also be adjusted on-the-fly with `rtcDrmSetBufferSize(drmConfig, mediaBufferMs)` call - `drmConfig` argument is optional in a single stream scenario, and can be set to `null`.

Recommended Android settings (enforce HW-security / Widevine L1 because otherwise output protection won't work):
```js
    const platform = window?.navigator?.userAgentData?.platform || window?.navigator?.platform;
    if (platform === 'Android')
        drmConfig.video.robustness = 'HW';
```

### 2.1 License/Certificate request proxying

License and certificate requests can be intercepted/redirected by means of setting `onFetch` callback (see chapter 2.2 as well for a similar mechanism not involving callbacks):

```js
async function onRtcDrmFetch(url, opts) {
    if (!opts.headers)
        opts.headers = new Headers();

    // save the original fetch URL and attach it as a
    // header (not required, just a sample code)
    opts.headers.append('x-org-url', url);
    console.log(...opts.headers);

    // and redirect it to your proxy for processing
    return fetch('https://drm.acme.corp/proxy?authToken=qwerty', opts);
}

const drmConfig = {
    ...
    // this is a wrapper callback for DRM's fetch requests - GET for the
    // certificate (FairPlay mostly, but can also be used with Widevine)
    // and POSTs for license requests
    onFetch: onRtcDrmFetch,
    ...
};
```

### 2.2 Custom certificate and license request URLs

Naming note: Widevine-related parameters in this chapter are prefixed by `wv`, for Apple/Safari's FairPlay Streaming it's `fps` and for Microsoft's PlayReady it's `pr`.

FairPlay and Widevine require the server (aka service) certificate to be fetched and applied before requesting playback licenses. This is handled automatically by the library, however one can save the certificate in order to avoid unnecessary fetch requests to the server, which will lead to faster playback start:
```js
const fpsCert64 = 'MIIE1TCCA72gAwIBAgIIR7FaLXv...';
const wvCert64 = 'CrsCCAMSEKDc0WAwLAQT1SB2ogy...';
const drmConfig = {
    ...
    // these could be set as Uint8Array's or ArrayBuffer's
    fpsCertificate: Uint8Array.from(atob(fpsCert64), c => c.charCodeAt(0)),
    wvCertificate: Uint8Array.from(atob(wvCert64), c => c.charCodeAt(0)),
    ...
};
```

Another option is to set custom URLs to fetch certificates from:
```js
const drmConfig = {
    ...
    // if not set, the FairPlay cert is fetched from
    // https://lic.drmtoday.com/license-server-fairplay/cert/<merchant-id>
    fpsCertificateUrl: 'https://drm.acme.corp/fps/cert',

    // for DRMtoday the Widevine cert is currently stored at (might change without notice):
    // https://service-certificate.artifact.castlabs.com/service-certificate/castlabs.bin
    // (this cert is hard-coded in the library to be used by default)
    wvCertificateUrl: 'https://drm.acme.corp/wv/cert',
    ...
};
```

Similar to the certificate customization described above, it is possible to set license request URLs if you're not using DRMtoday or there's a proxy in-between:
```js
const drmConfig = {
    ...
    // if not set, the license is fetched from
    // https://lic.drmtoday.com/license-server-fairplay/
    fpsLicenseUrl: 'https://drm.acme.corp/fps/lic',

    // if not set, the license is fetched from
    // https://lic.drmtoday.com/license-proxy-widevine/cenc/
    wvLicenseUrl: 'https://drm.acme.corp/wv/lic',

    // if not set, the license is fetched from
    // https://lic.drmtoday.com/license-proxy-headerauth/drmtoday/RightsManager.asmx
    prLicenseUrl: 'https://drm.acme.corp/pr/lic',
    ...
};

```

## 3. Multiple DRM-protected streams on the same page

It is possible to receive multiple individually encrypted streams on the same page - one just needs to pass an individual DRM config for every one of them with a `rtcDrmConfigure` call. In addition to that `rtcDrmOnTrack` should be called with an extra argument to clarify the target DRM instance:
```js
let pc1 = new RTCPeerConnection();
let pc2 = new RTCPeerConnection();

...

const keyId1 = new Uint8Array(...);
const iv1 = new Uint8Array(...);
const keyId2 = new Uint8Array(...);
const iv2 = new Uint8Array(...);

const drmConfig1 = {
    ...
    videoElement: document.getElementById('remote-video-1'),
    video: {codec: 'AV1', encryption: 'cbcs', keyId1, iv1}
};

const drmConfig2 = {
    ...
    videoElement: document.getElementById('remote-video-2'),
    video: {codec: 'H264', encryption: 'cenc', keyId2, iv2}
};

// note an extra argument passed to rtcDrmOnTrack - it allows the
// transformer library to distinguish between DRM instances
pc1.addEventListener('track', (event) => {
    rtcDrmOnTrack(event, drmConfig1);
});
pc2.addEventListener('track', (event) => {
    rtcDrmOnTrack(event, drmConfig2);
});

try {
    rtcDrmConfigure(drmConfig1);
    rtcDrmConfigure(drmConfig2);
}
catch (err) {
    alert(`DRM initialization error: ${err.message}`);
}
```
See the SDK's Multiview sample, specifically its `drm-decrypt.js` for a fully functional implementation.

## 4. Upfront authorization tokens

It is not recommended to use Test Dummy license delivery authorization for anything beyond PoCs. Production deployments should use upfront authorization token (UAT) instead, here's how to enable and start using it:
* Go to the DRMtoday dashboard / License delivery authorization, select Upfront authorization token and save it;
* Go to Upfront token authorization (right underneath License delivery authorization) and add a shared secret - 64-byte long hex string (it's `74657374`, i.e. `test`, repeated 16 times, to match the sample code below). Make sure it's enabled;
* Generate a JWT auth token signed with the shared secret:
```js
import * as jose from 'https://cdnjs.cloudflare.com/ajax/libs/jose/5.2.0/index.bundle.min.js';

function generateRandomString(minLength = 16) {
    let str = '';
    while (str.length < minLength)
        str += Math.random().toString(36).substring(2);

    return str;
}

const secret = new TextEncoder().encode(
    'testtesttesttesttesttesttesttesttesttesttesttesttesttesttesttest'
);
const optData = {merchant: 'your-merchant-id'};
const crt = [{assetId: 'your-asset-id', profile: {purchase: {}}}];
const jwt = await new jose.SignJWT({optData: JSON.stringify(optData),
    crt: JSON.stringify(crt)})
        .setProtectedHeader({alg: 'HS512'})
        .setIssuedAt()
        .setJti(generateRandomString())
        .sign(secret);
```
* Put the token in the DRM config as `authToken`:
```js
const drmConfig = {
    ...
    authToken: jwt
};
```
UAT format is described in detail in https://fe.staging.drmtoday.com/documentation/integration/license_delivery_authorization.html#upfront-authorization-token. Note that `optData` and `crt` have to be serialized JSON objects, passing objects directly won't work. Also ignore `userId` and `sessionId` in `optData` / Merchant Metadata - they are obsolete and irrelevant to the UAT case.

## 5. Custom transform
It's possible to instruct the transformer library to not to inject itself into the RTCPeerConnection pipeline via EncodedStreams / RTCRtpScriptTransform API, if the application logic requires handling that in your own code.

In this case `customTransform: true` needs to be added to the DRM config object, and the media frames received via EncodedStreams / RTCRtpScriptTransform API have to be pushed to the transformer library with `rtcDrmFeedFrame` - see `custom-transform/js/drm-decrypt.js` for details.
