'use strict'

import * as Utils from './utils.js'
import {rtcDrmGetVersion, rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments, rtcDrmFeedFrame} from '../../rtc-drm-transform/rtc-drm-transform.min.js'

export function configure(pc) {
    console.info(`Using RTC DRM v${rtcDrmGetVersion()}`)

    const {aesMode, iv, decryptMode, merchant, keyId} = Utils.loadSettings()

    let video = {codec: 'H264'}
    if (decryptMode === Utils.DecryptMode.ProdDrm) {
        video.keyId = keyId
        video.iv = iv
    }
    video.encryption = aesMode === 'CTR' ? 'cenc' : 'cbcs'

    // disable output protection to make it work on Android. Another option is
    // set video.roubstness = 'HW' on Android (see Client Integration Guide and
    // DRMtoday documentation for details)
    let crt = {
        "profile": {
            "purchase": {}
        },
        "outputProtection": {
            "enforce": false
        }
    }

    const drmConfig = {
        merchant,
        environment: rtcDrmEnvironments.Staging,
        videoElement: document.getElementById('remote-video'),
        customTransform: true,

        sessionId: `crtjson:${JSON.stringify(crt)}`,

        video,

        logLevel: 4
    }

    drmConfig.videoElement.addEventListener('rtcdrmerror', event => {
        alert(`DRM error: ${event.detail.message}`)
    })

    rtcDrmConfigure(drmConfig)

    pc.addEventListener('track', event => {
        try { rtcDrmOnTrack(event, drmConfig) }
        catch (err) {
            alert(`rtcDrmOnTrack failed with: ${err.message}`)
        }

        setupReceiverTransform(event.transceiver.receiver, drmConfig)
    })
}

function setupEncodedStreams(receiver, drmConfig) {
    console.log('Using EncodedStreams API')

    const drmBind = {
        drmConfig,
        transform: null
    }
    drmBind.transform = (encryptedEncodedFrame, controller) => {rtcDrmFeedFrame(encryptedEncodedFrame, controller, drmConfig)}

    const receiverStreams = receiver.createEncodedStreams()
    const transformStream = new TransformStream({transform: drmBind.transform.bind(drmBind)})
    const {readable, writable} = receiverStreams
    readable.pipeThrough(transformStream).pipeTo(writable)
}

function setupRTCRtpScriptTransform(receiver, drmConfig) {
    console.log('Using RTCRtpScriptTransform API')

    const worker = new Worker('./js/recv-transform-worker.js', {name: 'Receiver transform worker'})
    worker.onmessage = msg => {
        if (rtcDrmFeedFrame(msg.data.frame, null, drmConfig))
            worker.postMessage({operation: 'keyframe'})
    }
    receiver.transform = new RTCRtpScriptTransform(worker, {operation: `decrypt-${receiver.track.kind}`})
}

function setupReceiverTransform(receiver, drmConfig) {
    let supportsEncodedStreams = false
    if (RTCRtpSender.prototype.createEncodedStreams) {
        try {
            const stream = new ReadableStream()
            window.postMessage(stream, '*', [stream])
            supportsEncodedStreams = true
        }
        catch {}
    }

    // Chrome and derivatives traditionally implemented "old" EncodedStreams API, while Safari
    // and Firefox joined the party much later with RTCRtpScriptTransform.
    // These days you can also enable RTCRtpScriptTransform in chrome://flags (Experimental Web
    // Platform features: Enabled), however, EncodedStreams is still preferrable. The main reason
    // is that Chrome's RTCRtpScriptTransform implementation "consumes" data buffers, so you need
    // to clone them or Chrome will go Aw, Snap!
    if (supportsEncodedStreams)
        setupEncodedStreams(receiver, drmConfig)
    else if (window.RTCRtpScriptTransform)
        setupRTCRtpScriptTransform(receiver, drmConfig)
    else
        alert('The browser does not support EncodedStreams or RTCRtpScriptTransform')
}
