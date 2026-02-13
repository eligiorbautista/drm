'use strict'

import {enforceVideoCodec} from '../../shared/utils.js'
import * as Utils from './utils.js'
import * as Drm from './drm-decrypt.js'

const drmDiv = document.getElementById('drm-div')
const localVid = document.getElementById('local-video')
const remoteVid = document.getElementById('remote-video')
const currLatency = document.getElementById('curr-latency')
const startBtn = document.getElementById('start-button')

let localPc = null
let remotePc = null
let latencyPoller = null

window.onload = () => {
    selectAesMode(document.getElementById('aes-mode').selectedIndex)
    selectDecryptMode(document.getElementById('decrypt-mode').selectedIndex)

    startBtn.disabled = false

    const platform = window?.navigator?.userAgentData?.platform || window?.navigator?.platform
    if (platform === 'Android') {
        document.getElementById('output-protection').checked = true
        document.getElementById('hardware-secure').checked = true
    }
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

const decryptWorker = new Worker('./js/decrypt-worker.js', {name: 'decrypt worker'})
function setupReceiverTransform(receiver) {
    if (window.RTCRtpScriptTransform) {
        receiver.transform = new RTCRtpScriptTransform(decryptWorker, {operation: `decrypt-${receiver.track.kind}`})
        return
    }

    const receiverStreams = receiver.createEncodedStreams()
    const {readable, writable} = receiverStreams
    decryptWorker.postMessage({
        operation: `decrypt-${receiver.track.kind}`,
        readable,
        writable,
    }, [readable, writable])
}

async function initCrypto(videoCodec, decryptMode, aesMode, key, iv) {
    encryptWorker.postMessage({operation: 'init', videoCodec, aesMode, key, iv})
    const encryptInit = await Promise.race([
        new Promise(resolve => {encryptWorker.onmessage = event => resolve(event.data === 'init-done')}),
        new Promise(resolve => setTimeout(resolve, 15000, false))
    ])
    if (!encryptInit)
        return false

    if (decryptMode === Utils.DecryptMode.InPlace) {
        decryptWorker.postMessage({operation: 'init', videoCodec, aesMode, key, iv})
        const decryptInit = await Promise.race([
            new Promise(resolve => {decryptWorker.onmessage = event => resolve(event.data === 'init-done')}),
            new Promise(resolve => setTimeout(resolve, 15000, false))
        ])
        if (!decryptInit)
            return false
    }

    return true
}

async function start() {
    drmDiv.style.display = 'none'
    startBtn.style.display = 'none'
    localVid.style.display = 'block'
    remoteVid.style.display = 'block'

    const {videoCodec, decryptMode, aesMode, key, iv} = Utils.loadSettings()
    if (!await initCrypto(videoCodec, decryptMode, aesMode, key, iv)) {
        stop()
        alert('Failed to init crypto')
        return
    }

    remoteVid.addEventListener('resize', () => {
        if (remoteVid.videoWidth)
            console.log(`Resolution changed: ${remoteVid.videoWidth}x${remoteVid.videoHeight}`)
        if (decryptMode !== Utils.DecryptMode.InPlace)
            currLatency.style.display = 'block'
    })

    try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false})
        localVid.srcObject = stream

        const pcConfig = {encodedInsertableStreams: true}
        localPc = new RTCPeerConnection(pcConfig)
        remotePc = new RTCPeerConnection(pcConfig)

        localPc.addTrack(stream.getVideoTracks()[0], stream)
        const transceivers = localPc.getTransceivers()
        for (const tr of transceivers) {
            tr.direction = 'sendonly'
            setupSenderTransform(tr.sender)
/*
            if (tr.sender.track.kind === 'video') {
                // prevent resolution switching, which requires costly MSE re-init
                // and causes video flickering on Safari
                let params = tr.sender.getParameters()
                params.degradationPreference = 'maintain-resolution'
                await tr.sender.setParameters(params)
            }
*/
        }

        if (decryptMode === Utils.DecryptMode.InPlace) {
            remotePc.ontrack = e => {
                setupReceiverTransform(e.transceiver.receiver)
                remoteVid.srcObject = e.streams[0]
            }
        }
        else
            Drm.configure(remotePc)

        localPc.onicecandidate = e => remotePc.addIceCandidate(e.candidate)
        remotePc.onicecandidate = e => localPc.addIceCandidate(e.candidate)

        const localOffer = await localPc.createOffer()
        // force AV1 or H264 by means of removing other video codecs from the SDP
        localOffer.sdp = enforceVideoCodec(localOffer.sdp, videoCodec)
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

            currLatency.innerText = `Latency: ${latencyMs}ms`
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
    currLatency.style.display = 'none'

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
    const drm = (index === Utils.DecryptMode.ProdDrm)
    document.getElementById('dt-merchant-tr').style.display = drm ? 'table-row' : 'none'
    document.getElementById('dt-keyid-tr').style.display = drm ? 'table-row' : 'none'
    document.getElementById('hardware-secure-tr').style.display = drm ? 'table-row' : 'none'
    document.getElementById('output-protection-tr').style.display = drm ? 'table-row' : 'none'
}
window.selectDecryptMode = selectDecryptMode

// in CBC mode IV is fixed and you have to specify it, while in CTR
// mode it starts with a random value and is incremented for every frame
function selectAesMode(index) {
    const iv = document.getElementById('iv-tr')
    iv.style.display = (index === 0) ? 'none' : 'table-row'
}
window.selectAesMode = selectAesMode
