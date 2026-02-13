'use strict'

import {enforceVideoCodec} from '../../shared/utils.js'
import * as Utils from './utils.js'
import * as Drm from './drm-decrypt.js'

const drmDiv = document.getElementById('drm-div')
const localVid = document.getElementById('local-video')
const remoteVid = document.getElementById('remote-video')
const latencyOverlay = document.getElementById('latency-overlay')
const startBtn = document.getElementById('start-button')

let localPc = null
let remotePc = null
let latencyPoller = null

window.onload = () => {
    startBtn.disabled = false
}

const encryptWorker = new Worker('./js/encrypt-worker.js', {name: 'encrypt worker'})
function setupSenderTransform(sender) {
    if (window.RTCRtpScriptTransform) {
        sender.transform = new RTCRtpScriptTransform(encryptWorker, {operation: `encrypt-${sender.track.kind}`})
        return
    }

    const senderStreams = sender.createEncodedStreams()
    const {readable, writable} = senderStreams
    encryptWorker.postMessage({
        operation: `encrypt-${sender.track.kind}`,
        readable,
        writable,
    }, [readable, writable])
}

async function initCrypto(aesMode, key, iv) {
    encryptWorker.postMessage({operation: 'init', aesMode, key, iv})
    const encryptInit = await Promise.race([
        new Promise(resolve => {encryptWorker.onmessage = event => resolve(event.data === 'init-done')}),
        new Promise(resolve => setTimeout(resolve, 15000, false))
    ])
    if (!encryptInit)
        return false

    return true
}

async function start() {
    drmDiv.style.display = 'none'
    startBtn.style.display = 'none'
    localVid.style.display = 'block'
    remoteVid.style.display = 'block'
    remoteVid.addEventListener('resize', () => latencyOverlay.style.display = 'block')

    const {aesMode, key, iv} = Utils.loadSettings()
    if (!await initCrypto(aesMode, key, iv)) {
        stop()
        alert('Failed to init crypto')
        return
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({video: {aspectRatio: {ideal: 1}}, audio: false})
        localVid.srcObject = stream

        const pcConfig = {encodedInsertableStreams: true}
        localPc = new RTCPeerConnection(pcConfig)
        remotePc = new RTCPeerConnection(pcConfig)

        localPc.addTrack(stream.getVideoTracks()[0], stream)
        const transceivers = localPc.getTransceivers()
        for (const tr of transceivers) {
            tr.direction = 'sendonly'
            setupSenderTransform(tr.sender)

            if (tr.sender.track.kind === 'video') {
                // prevent resolution switching (which requires costly MSE re-init)
                let params = tr.sender.getParameters()
                params.degradationPreference = 'maintain-resolution'
                await tr.sender.setParameters(params)
            }
        }

        Drm.configure(remotePc)

        localPc.onicecandidate = e => remotePc.addIceCandidate(e.candidate)
        remotePc.onicecandidate = e => localPc.addIceCandidate(e.candidate)

        const localOffer = await localPc.createOffer()
        // force H264 by means of removing other video codecs from the SDP
        localOffer.sdp = enforceVideoCodec(localOffer.sdp, 'H264')
        await localPc.setLocalDescription(localOffer)

        await remotePc.setRemoteDescription(localOffer)
        const remoteAnswer = await remotePc.createAnswer()
        await remotePc.setLocalDescription(remoteAnswer)

        localPc.setRemoteDescription(remoteAnswer)

        latencyPoller = setInterval(() => {
            let latencyMs = 0
            if (remoteVid.buffered.length > 0) {
                const bufferedEnd = remoteVid.buffered.end(remoteVid.buffered.length - 1)
                latencyMs = ((bufferedEnd - remoteVid.currentTime) * 1000) | 0
            }

            latencyOverlay.innerText = `${latencyMs} ms`
        }, 2000)
    }
    catch (e) {
        stop()
        alert(`${e}`)
    }
}
window.start = start

function stop() {
    drmDiv.style.display = 'block'
    startBtn.style.display = 'block'
    localVid.style.display = 'none'
    remoteVid.style.display = 'none'
    document.getElementById('latency-overlay').style.display = 'none'

    localVid.srcObject = null
    remoteVid.srcObject = null

    if (localPc) {
        localPc.close()
        localPc = null
    }

    if (remotePc) {
        remotePc.close()
        remotePc = null
    }

    if (latencyPoller) {
        clearInterval(latencyPoller)
        latencyPoller = null
    }
}

function selectDecryptMode(index) {
    const merchant = document.getElementById('dt-merchant-tr')
    const keyid = document.getElementById('dt-keyid-tr')
    if (index === Utils.DecryptMode.ProdDrm) {
        merchant.style.display = 'table-row'
        keyid.style.display = 'table-row'
    }
    else {
        merchant.style.display = 'none'
        keyid.style.display = 'none'
    }
}
window.selectDecryptMode = selectDecryptMode

// in CBC mode IV is fixed and you have to specify it, while in CTR
// mode it starts with a random value and is incremented for every frame
function selectAesMode(index) {
    const iv = document.getElementById('iv-tr')
    iv.style.display = (index === 0) ? 'none' : 'table-row'
}
window.selectAesMode = selectAesMode
