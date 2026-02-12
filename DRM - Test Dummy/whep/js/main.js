'use strict'
import * as jose from 'https://cdn.jsdelivr.net/npm/jose@4.15.1/+esm'
import { rtcDrmGetVersion, rtcDrmConfigure, rtcDrmSetBufferSize, rtcDrmOnTrack, rtcDrmEnvironments } from '../../rtc-drm-transform/rtc-drm-transform.min.js'

// DRM Configuration Constants
const DRM_CONFIG = {
    keyId: '5ed8fa5fa9ae4f45fa981793a01f950c',
    iv: 'dc576fccde9d9e3a77cc5f438f50fd0f',
    merchant: 'f43be426-727f-46ff-ba48-97a208ff40e0',
    secret: 'f270c7854ea7278d1c68a68f6222993a175cf4357cdb07aa4da51669744def20424175a6f78dcd7a863611a223b337cd52754d3fb858ee025f5a97107d2f4dcc'
}

// State variables
let mediaBufferMs = -1
let drmConfigured = false
let drmConfig = null

function hexToUint8Array(hexString) {
    if (!hexString) return null
    if ((hexString.length % 2) !== 0) {
        console.error(`Malformed hex string (${hexString}), odd length`)
        return null
    }
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}

function generateRandomString(minLength = 16) {
    let str = ''
    while (str.length < minLength)
        str += Math.random().toString(36).substring(2)

    return str
}


function bufferSizeChanged(idx) {
    const labels = ['Default', 'Zero', '50 ms', '100 ms', '200 ms', '400 ms', '600 ms', '900 ms', '1500 ms', '2500 ms']
    const values = [-1, 0, 50, 100, 200, 400, 600, 900, 1500, 2500]
    mediaBufferMs = values[idx]
    if (drmConfigured) {
        try {
            rtcDrmSetBufferSize(null, mediaBufferMs)
        } catch (err) {
            console.warn('Failed to set buffer size:', err)
        }
    }
    document.getElementById('media-buffer-selected-option-label').textContent = labels[idx]
    localStorage.setItem('buffer', idx)
}

window.addEventListener('DOMContentLoaded', () => {
    console.info(`Using RTC DRM v${rtcDrmGetVersion()}`)

    const endpoint = document.getElementById('endpoint')
    endpoint.value = localStorage.getItem('endpoint') || ''
    endpoint.addEventListener('change', (ev) => {
        localStorage.setItem('endpoint', ev.target.value)
    })

    const encrypted = document.getElementById('encrypted')
    encrypted.checked = localStorage.getItem('encrypted') === 'true'
    encrypted.addEventListener('change', (ev) => {
        localStorage.setItem('encrypted', ev.target.checked)
    })

    const mediaBufferSlider = document.getElementById('media-buffer')
    mediaBufferSlider.value = localStorage.getItem('buffer') || 0
    bufferSizeChanged(mediaBufferSlider.value)
    mediaBufferSlider.addEventListener('input', (ev) => bufferSizeChanged(ev.target.value))
})

async function generateAuthToken(merchant, secret, crt) {
    const optData = { merchant: merchant, userId: "elidev-test" };

    const jwt = await new jose.SignJWT({
        optData: JSON.stringify(optData),
        crt: JSON.stringify(crt)
    })
        .setProtectedHeader({ alg: 'HS512', kid: '890c580d-4b51-4a71-b20e-5e126121bf4c' })
        .setIssuedAt()
        .setJti(generateRandomString())
        .sign(new TextEncoder().encode(secret));
    console.log('Generated JWT:', jwt);
    return jwt;
}

async function configureDrm(pc, useClearKey) {
    // IMPORTANT: These MUST match the sender's keyId and IV from cloudflare-whip/main.js
    const keyId = hexToUint8Array(DRM_CONFIG.keyId)
    const iv = hexToUint8Array(DRM_CONFIG.iv)

    // Configure video encryption settings
    let video = { codec: 'H264', encryption: 'cbcs' }
    if (!useClearKey) {
        if (!DRM_CONFIG.merchant) {
            throw new Error('DRMtoday merchant name not set')
        }
        video.keyId = keyId
        video.iv = iv
    }

    // License configuration
    const crt = {
        profile: { type: "purchase" },
        assetId: "test-key",
        outputProtection: {
            digital: true,
            analogue: true,
            enforce: true
        },
        storeLicense: true
    }

    // Generate authentication token
    const authToken = await generateAuthToken(
        DRM_CONFIG.merchant,
        hexToUint8Array(DRM_CONFIG.secret),
        crt
    );

    drmConfig = {
        merchant: DRM_CONFIG.merchant,
        environment: rtcDrmEnvironments.Staging,
        videoElement: document.getElementById('remote-video'),
        audioElement: document.getElementById('remote-audio'),
        sessionId: `crtjson:${JSON.stringify(crt)}`,
        authToken,
        video,
        audio: { codec: 'opus', encryption: 'clear' },
        logLevel: 3,
        mediaBufferMs
    }

    drmConfig.videoElement.addEventListener('rtcdrmerror', (event) => {
        alert(`DRM error: ${event.detail.message}`)
        unsubscribe()
    })

    rtcDrmConfigure(drmConfig)
    drmConfigured = true

    pc.addEventListener('track', (event) => {
        try { rtcDrmOnTrack(event) }
        catch (err) {
            alert(`rtcDrmOnTrack failed with: ${err.message}`)
            unsubscribe()
        }
    })
}

const subscribeBtn = document.getElementById('subscribe-button')
const unsubscribeBtn = document.getElementById('unsubscribe-button')
const loadSpinner = document.getElementById('load-spinner')

let connectAttempt = 1
const connectAttemptLimit = 3

let activePeerConnection = null

async function subscribe() {
    console.log('Subscribing...')
    subscribeBtn.style.display = 'none'
    loadSpinner.style.display = 'block'

    connectAttempt = 1

    const params = new URLSearchParams(window.location.search)

    let useClearKey = false
    if (params.has('clearKey'))
        useClearKey = true

    let encrypted = document.getElementById('encrypted').checked

    if (params.has('mute')) {
        document.getElementById('remote-video').muted = true
        document.getElementById('remote-audio').muted = true
    }

    try {
        let pc = activePeerConnection = new RTCPeerConnection({
            bundlePolicy: 'max-bundle',
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            encodedInsertableStreams: encrypted
        })
        if (encrypted) {
            await configureDrm(pc, useClearKey)
        } else {
            pc.addEventListener('track', onTrack)
        }

        pc.addEventListener('negotiationneeded', onNegotiationNeeded)
        pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange)
        pc.addEventListener('iceconnectionstatechange', onIceStateChange)

        if (!params.has('audio-only'))
            pc.addTransceiver('video', { direction: 'recvonly' })

        if (!params.has('video-only'))
            pc.addTransceiver('audio', { direction: 'recvonly' })
    }
    catch (e) {
        unsubscribe()
        alert(`${e}`)
    }
}

function unsubscribe() {
    // Clean up video elements first to stop playback and trigger MediaSource cleanup
    const videoElement = document.getElementById('remote-video')
    const audioElement = document.getElementById('remote-audio')

    // Pause and clear media before closing peer connection
    // This gives the MediaSource time to clean up SourceBuffers
    if (videoElement) {
        videoElement.pause()
        videoElement.removeAttribute('src')
        videoElement.load() // Force reload to clear MediaSource
        videoElement.srcObject = null
    }
    if (audioElement) {
        audioElement.pause()
        audioElement.removeAttribute('src')
        audioElement.load()
        audioElement.srcObject = null
    }

    // Clear inbound stream and stop tracks
    if (inboundStream) {
        inboundStream.getTracks().forEach(track => track.stop())
        inboundStream = null
    }

    // Small delay to allow MediaSource cleanup before closing peer connection
    setTimeout(() => {
        if (activePeerConnection) {
            activePeerConnection.close()
            activePeerConnection = null
        }
    }, 100)

    drmConfigured = false
    drmConfig = null

    subscribeBtn.style.display = 'block'
    unsubscribeBtn.style.display = 'none'
    loadSpinner.style.display = 'none'
}

window.subscribe = subscribe
window.unsubscribe = unsubscribe

let inboundStream = null
function onTrack(event) {
    // no DRM case, plug it in directly
    if (!inboundStream) {
        inboundStream = new MediaStream()
        document.getElementById('remote-video').srcObject = inboundStream
    }
    inboundStream.addTrack(event.track)
}

async function onNegotiationNeeded(event) {
    let pc = event.target
    const offer = await pc.createOffer()
    pc.setLocalDescription(offer)
}

async function onIceGatheringStateChange(event) {
    let pc = event.target
    if (pc.iceGatheringState === 'complete') {
        if (connectAttempt === 1)
            console.log('Offer with candidates:', pc.localDescription.sdp)

        const params = new URLSearchParams(window.location.search)

        let auth = ''
        if (params.has('auth'))
            auth = params.get('auth')

        let headers = new Headers()
        headers.append('Content-Type', 'application/sdp')
        if (auth)
            headers.append('Authorization', `Bearer ${auth}`)

        let endpoint = document.getElementById('endpoint').value
        if (!endpoint) {
            if (params.has('endpoint'))
                endpoint = params.get('endpoint')
        }

        if (!endpoint || !endpoint.startsWith('http')) {
            alert('No endpoint specified or it is in wrong format: ' + (endpoint ? endpoint : 'undefined'))
            return
        }

        // some streaming servers demand this unique random requestId to be present
        let url = endpoint + '?requestId=' + Math.floor(Math.random() * 0x10000).toString(16)

        try {
            const start = Date.now()
            const response = await fetch(url, { method: 'POST', headers, body: pc.localDescription.sdp, signal: AbortSignal.timeout(3000) })
            const end = Date.now()
            console.info(`Got SDP response in ${end - start} ms`, response)
            if (response.status === 201) {
                const remoteSdp = await response.text()
                console.info('Remote SDP:', remoteSdp)
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: remoteSdp }))
                return
            }
            else {
                if (connectAttempt >= connectAttemptLimit)
                    alert(`POST ${url} returned unexpected status: ${response.status}`)
            }
        }
        catch (e) {
            if (connectAttempt >= connectAttemptLimit)
                alert(`POST ${url} failed with error: ${e}`)
        }

        if (connectAttempt >= connectAttemptLimit) {
            unsubscribe()
            return
        }

        // something failed, retry
        ++connectAttempt
        setTimeout(() => {
            pc.setLocalDescription({ type: 'rollback' })
            pc.restartIce()
        }, 3000)
    }
}

function onIceStateChange(event) {
    let pc = event.target
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        console.log('ICE restart, connection state:', pc.iceConnectionState)
        pc.restartIce()
    }
    else if (pc.iceConnectionState === 'connected') {
        unsubscribeBtn.style.display = 'block'
        loadSpinner.style.display = 'none'
    }
}
