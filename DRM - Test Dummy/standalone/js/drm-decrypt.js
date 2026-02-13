'use strict'

import * as Utils from './utils.js'
import {rtcDrmGetVersion, rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments} from '../../rtc-drm-transform/rtc-drm-transform.min.js'

export function configure(pc) {
    console.info(`Using RTC DRM v${rtcDrmGetVersion()}`)

    const {videoCodec, aesMode, iv, decryptMode, merchant, keyId, hwSecure, outputProtection} = Utils.loadSettings()

    let video = {codec: videoCodec}
    if (decryptMode === Utils.DecryptMode.ProdDrm) {
        video.keyId = keyId
        video.iv = iv

        if (hwSecure)
            video.robustness = 'HW'
    }
    video.encryption = aesMode === 'CTR' ? 'cenc' : 'cbcs'

    let crt = {
        "profile": {
            "purchase": {}
        },
        "outputProtection": {
            "digital": true,
            "analogue": true,
            "enforce": outputProtection
        }
    }

    const drmConfig = {
        merchant,
        environment: rtcDrmEnvironments.Staging,
        videoElement: document.getElementById('remote-video'),
        sessionId: `crtjson:${JSON.stringify(crt)}`,

        video,

        logLevel: 4,
        // this will save the first 10s of the encrypted video
        // feed (as it's pushed to the browser via MSE)
        //mediaDumps: {video: {out: {durationMs: 10000}}}
    }

    drmConfig.videoElement.addEventListener('rtcdrmerror', (event) => {
        alert(`DRM error: ${event.detail.message}`)
    })

    rtcDrmConfigure(drmConfig)

    pc.addEventListener('track', (event) => {
        try { rtcDrmOnTrack(event, drmConfig) }
        catch (err) {
            alert(`rtcDrmOnTrack failed with: ${err.message}`)
        }
    })
}
