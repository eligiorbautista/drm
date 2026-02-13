'use strict'

self.importScripts('../../crypto/clcrypto.js')

let crypto = null
let decryptor = null
async function initializeDecryptor(aesMode, key, iv) {
    if (!crypto)
        crypto = await Module()

    if (decryptor) {
        decryptor.delete()
        decryptor = null
    }

    decryptor = new crypto.Decryptor(crypto.Codec.AVC, aesMode === 'CTR' ? crypto.Mode.CTR : crypto.Mode.CBC, key, 1024 * 1024)
    if (aesMode === 'CBC')
        decryptor.setCbcIv(iv)
}

function decryptVideo(encodedFrame, controller) {
    const srcBuf = decryptor.getSrcBuffer()
    srcBuf.set(new Uint8Array(encodedFrame.data))
    const decryptedSize = decryptor.decrypt(encodedFrame.data.byteLength)

    if (decryptedSize > 0) {
        // retrieve the encrypted data from the encryptor
        const dstBuf = decryptor.getDstBuffer()
        const newData = new ArrayBuffer(decryptedSize)
        const newBuf = new Uint8Array(newData)
        newBuf.set(dstBuf)

        encodedFrame.data = newData
    }

    controller.enqueue(encodedFrame)
}

function decryptAudio(encodedFrame, controller) {
    // no encryption for audio for now
    controller.enqueue(encodedFrame)
}

function handleTransform(operation, readable, writable) {
    if (operation === 'decrypt-video') {
        const transformStream = new TransformStream({transform: decryptVideo})
        readable.pipeThrough(transformStream).pipeTo(writable)
    }
    else if (operation === 'decrypt-audio') {
        const transformStream = new TransformStream({transform: decryptAudio})
        readable.pipeThrough(transformStream).pipeTo(writable)
    }
}

onmessage = (event) => {
    if (event.data.operation === 'decrypt-video' || event.data.operation === 'decrypt-audio')
        return handleTransform(event.data.operation, event.data.readable, event.data.writable)

    if (event.data.operation === 'init') {
        console.log(`${new Date().toISOString().slice(11, -1)} starting to load decryptor (wasm)`)
        initializeDecryptor(event.data.aesMode, event.data.key, event.data.iv).then(() => {
            console.log(`${new Date().toISOString().slice(11, -1)} decryptor ready`)
            postMessage('init-done')
        })
    }
}

// Handler for RTCRtpScriptTransforms
if (self.RTCTransformEvent) {
    self.onrtctransform = (event) => {
        const transformer = event.transformer
        handleTransform(transformer.options.operation, transformer.readable, transformer.writable)
    }
}
