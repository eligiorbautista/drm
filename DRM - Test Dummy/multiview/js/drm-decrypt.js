'use strict'

import * as Utils from './utils.js'
import {rtcDrmGetVersion, rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments} from '../../rtc-drm-transform/rtc-drm-transform.min.js'

export function configure(pc, idx) {
    console.info(`Using RTC DRM v${rtcDrmGetVersion()}`)

    const {aesMode, iv, decryptMode, merchant, keyId} = Utils.loadSettings()

    let video = {codec: 'H264'}
    if (decryptMode === Utils.DecryptMode.ProdDrm) {
        video.keyId = keyId[idx]
        video.iv = iv[idx]
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

    const videoElement = document.getElementById(`remote-video${idx + 1}`)
    const drmConfig = {
        merchant,
        environment: rtcDrmEnvironments.Staging,
        videoElement,

        sessionId: `crtjson:${JSON.stringify(crt)}`,

        video
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
