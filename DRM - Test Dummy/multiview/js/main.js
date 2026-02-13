'use strict'

import {enforceVideoCodec} from '../../shared/utils.js'
import * as Utils from './utils.js'
import * as Drm from './drm-decrypt.js'

const drmDiv = document.getElementById('drm-div')
const localVid = document.getElementById('local-video')
const webcamVid = document.getElementById('local-video-webcam')
const remoteVids = [document.getElementById('remote-video1'), document.getElementById('remote-video2')]
const startBtn = document.getElementById('start-button')

let localPcs = [null, null]
let remotePcs = [null, null]

window.onload = () => {
    startBtn.disabled = false
}

const encryptWorkers = [
    new Worker('./js/encrypt-worker.js', {name: 'encrypt worker 1'}),
    new Worker('./js/encrypt-worker.js', {name: 'encrypt worker 2'})
]

function setupSenderTransform(sender, idx) {
    if (window.RTCRtpScriptTransform) {
        sender.transform = new RTCRtpScriptTransform(encryptWorkers[idx], {operation: `encrypt-${sender.track.kind}`})
        return
    }

    const senderStreams = sender.createEncodedStreams()
    const {readable, writable} = senderStreams
    encryptWorkers[idx].postMessage({
        operation: `encrypt-${sender.track.kind}`,
        readable,
        writable,
    }, [readable, writable])
}

const decryptWorkers = [
    new Worker('./js/decrypt-worker.js', {name: 'decrypt worker 1'}),
    new Worker('./js/decrypt-worker.js', {name: 'decrypt worker 2'})
]

function setupReceiverTransform(receiver, idx) {
    if (window.RTCRtpScriptTransform) {
        receiver.transform = new RTCRtpScriptTransform(decryptWorkers[idx], {operation: `decrypt-${receiver.track.kind}`})
        return
    }

    const receiverStreams = receiver.createEncodedStreams()
    const {readable, writable} = receiverStreams
    decryptWorkers[idx].postMessage({
        operation: `decrypt-${receiver.track.kind}`,
        readable,
        writable,
    }, [readable, writable])
}

async function initCrypto(decryptMode, aesMode, key, iv) {
    for (let idx = 0; idx < 2; ++idx) {
        encryptWorkers[idx].postMessage({operation: 'init', aesMode, key: key[idx], iv: iv[idx]})
        const encryptInit = await Promise.race([
            new Promise(resolve => {encryptWorkers[idx].onmessage = event => resolve(event.data === 'init-done')}),
            new Promise(resolve => setTimeout(resolve, 15000, false))
        ])
        if (!encryptInit)
            return false

        if (decryptMode === Utils.DecryptMode.InPlace) {
            decryptWorkers[idx].postMessage({operation: 'init', aesMode, key: key[idx], iv: iv[idx]})
            const decryptInit = await Promise.race([
                new Promise(resolve => {decryptWorkers[idx].onmessage = event => resolve(event.data === 'init-done')}),
                new Promise(resolve => setTimeout(resolve, 15000, false))
            ])
            if (!decryptInit)
                return false
        }
    }

    return true
}

async function start() {
    const {decryptMode, aesMode, key, iv} = Utils.loadSettings()
    if (!await initCrypto(decryptMode, aesMode, key, iv)) {
        stop()
        alert('Failed to init crypto')
        return
    }

    try {
        let stream = null
        if (localVid.captureStream)
            stream = localVid.captureStream()
        else if (localVid.mozCaptureStream)
            stream = localVid.mozCaptureStream()

        if (!stream) {
            console.log('(moz)CaptureStream not supported (Safari?), using webcam stream instead')

            stream = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 480}, height: {ideal: 270}}, audio: false})
            document.getElementById('local-video-webcam').srcObject = stream
        }

        const pcConfig = {encodedInsertableStreams: true}
        for (let idx = 0; idx < 2; ++idx) {
            localPcs[idx] = new RTCPeerConnection(pcConfig)
            remotePcs[idx] = new RTCPeerConnection(pcConfig)

            localPcs[idx].addTrack(stream.getVideoTracks()[0], stream)
            const transceivers = localPcs[idx].getTransceivers()
            for (const tr of transceivers) {
                tr.direction = 'sendonly'
                setupSenderTransform(tr.sender, idx)

                if (tr.sender.track.kind === 'video') {
                    // prevent resolution switching (which requires costly MSE re-init)
                    let params = tr.sender.getParameters()
                    params.degradationPreference = 'maintain-resolution'
                    await tr.sender.setParameters(params)
                }
            }

            if (decryptMode === Utils.DecryptMode.InPlace) {
                remotePcs[idx].ontrack = e => {
                    setupReceiverTransform(e.transceiver.receiver, idx)
                    remoteVids[idx].srcObject = e.streams[0]
                }
            }
            else
                Drm.configure(remotePcs[idx], idx)

            localPcs[idx].onicecandidate = e => remotePcs[idx].addIceCandidate(e.candidate)
            remotePcs[idx].onicecandidate = e => localPcs[idx].addIceCandidate(e.candidate)

            const localOffer = await localPcs[idx].createOffer()
            // force H264 by means of removing other video codecs from the SDP
            localOffer.sdp = enforceVideoCodec(localOffer.sdp, 'H264')
            await localPcs[idx].setLocalDescription(localOffer)

            await remotePcs[idx].setRemoteDescription(localOffer)
            const remoteAnswer = await remotePcs[idx].createAnswer()
            await remotePcs[idx].setLocalDescription(remoteAnswer)

            localPcs[idx].setRemoteDescription(remoteAnswer)
        }
    }
    catch (e) {
        stop()
        alert(`${e}`)
    }
}

async function onStartButton() {
    if (localVid.captureStream || localVid.mozCaptureStream) {
        // Chrome, FireFox
        webcamVid.style.display = 'none'

        localVid.addEventListener('play', start)
        localVid.play()
    }
    else {
        // Safari (doesn't support capturing from a video element)
        localVid.style.display = 'none'
        start()
    }

    drmDiv.style.display = 'none'
    startBtn.style.display = 'none'
    document.getElementById('video-container').style.display = 'block'
}
window.onStartButton = onStartButton

function stop() {
    drmDiv.style.display = 'block'
    startBtn.style.display = 'block'
    document.getElementById('video-container').style.display = 'none'
    localVid.pause()
    webcamVid.srcObject = null

    for (let idx = 0; idx < 2; ++idx) {
        remoteVids[idx].srcObject = null

        if (localPcs[idx]) {
            localPcs[idx].close()
            localPcs[idx] = null
        }

        if (remotePcs[idx]) {
            remotePcs[idx].close()
            remotePcs[idx] = null
        }
    }
}

function selectDecryptMode(index) {
    const merchant = document.getElementById('dt-merchant-tr')
    const keyid = [document.getElementById('dt-keyid-tr1'), document.getElementById('dt-keyid-tr2')]
    if (index === Utils.DecryptMode.ProdDrm) {
        merchant.style.display = 'table-row'
        keyid[0].style.display = keyid[1].style.display = 'table-row'
    }
    else {
        merchant.style.display = 'none'
        keyid[0].style.display = keyid[1].style.display = 'none'
    }
}
window.selectDecryptMode = selectDecryptMode

// in CBC mode IV is fixed and you have to specify it, while in CTR
// mode it starts with a random value and is incremented for every frame
function selectAesMode(index) {
    const iv1 = document.getElementById('iv1-tr')
    const iv2 = document.getElementById('iv2-tr')
    const display = (index === 0) ? 'none' : 'table-row'
    iv1.style.display = iv2.style.display = display
}
window.selectAesMode = selectAesMode
