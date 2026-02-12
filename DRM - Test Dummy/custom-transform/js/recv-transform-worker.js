'use strict'

function parseNalus(encodedFrame) {
    const buffer = new Uint8Array(encodedFrame.data)

    let offset = 0, zeroCnt = 0
    let naluRanges = []

    let naluString = ''
    while (offset <= buffer.byteLength) {
        if (offset < buffer.byteLength) {
            const byteVal = buffer[offset++]

            if (byteVal !== 0) {
                if (byteVal === 1 && zeroCnt > 1) {
                    const startcodeLen = (zeroCnt > 2 ? 4 : 3)
                    naluRanges.push(offset - startcodeLen)
                }
                zeroCnt = 0
            }
            else
                ++zeroCnt
        }
        else
            naluRanges.push(offset++)

        if (naluRanges.length > 1) {
            const naluStart = naluRanges.shift()
            const naluEnd = naluRanges[0]

            offset = naluStart + 3
            while (offset < naluEnd) {
                const naluTypeByte = buffer[offset++]
                if (naluTypeByte > 1) {
                    const naluType = naluTypeByte & 0x1f
                    const naluTypes = {
                        1: 'Non-IDR',
                        5: 'IDR',
                        6: 'SEI',
                        7: 'SPS',
                        8: 'PPS',
                        9: 'AUD'
                    }
                    const naluTypeString = naluTypes[naluType] || `Unknown(${naluType})`
                    const sep = (naluString.length > 0 ? ', ' : '')
                    naluString += `${sep}${naluTypeString}/${naluEnd - naluStart}`
                    break
                }
            }
        }
    }

    return naluString
}

// a 320x192 black IDR frame. Reportedly, smaller resolutions can be problematic with
// HW decoders (f.e. Android fails on anything less than 320x180):
// https://bugs.chromium.org/p/webrtc/issues/detail?id=7206
const fakeIdrFrame = new Uint8Array([
    // SPS
    0x00, 0x00, 0x00, 0x01, 0x27, 0x64, 0x00, 0x0d, 0xac, 0x57, 0x05, 0x06, 0x64,
    // PPS
    0x00, 0x00, 0x00, 0x01, 0x28, 0xee, 0x3c, 0xb0,
    // IDR Slice
    0x00, 0x00, 0x00, 0x01, 0x25, 0xb8, 0x20, 0x00, 0xcb, 0xff, 0x26, 0x1d, 0xd9, 0x18, 0xc0, 0xa1,
    0x60, 0x00, 0x00, 0x0c, 0xe5, 0xae, 0xa6, 0x06, 0x07, 0x14, 0x03, 0x54, 0x00, 0xf7, 0x60, 0xc1,
    0xb5, 0xe5, 0x80, 0x00, 0x20, 0x20
]).buffer

const fakeBrokenFrame = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x41, 0x9a, 0xff, 0xff]).buffer

let lastReportTime = Date.now()
let keyFrameNeeded = false
function decryptVideo(encodedFrame, controller) {
    const now = Date.now()
    if (encodedFrame.type === 'key' || now - lastReportTime > 3000) {
        const naluString = parseNalus(encodedFrame)
        console.log(`${encodedFrame.type} frame, ${encodedFrame.data.byteLength} bytes, NALUs: ${naluString}`)
        lastReportTime = now
    }

    postMessage({streamType: 'video', frame: {type: encodedFrame.type, timestamp: encodedFrame.timestamp, data: encodedFrame.data}})

    if (encodedFrame.type === 'key')
        keyFrameNeeded = false

    // Two scenarios:
    // 1. Normal operation. Feed dummy black frame back into the webrtc pipeline - if we don't
    // do this (or enqueue encrypted encodedFrame), the webrtc's video decoder will start
    // requesting key frames unnecessarily;
    // 2. MSE threw an error or a frame gap was detected. Feed a bogus corrupted P-frame into
    // the webrtc pipeline, in order to get a key frame and recover asap.
    encodedFrame.data = keyFrameNeeded ? fakeBrokenFrame : fakeIdrFrame

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

onmessage = event => {
    if (event.data.operation === 'keyframe')
        keyFrameNeeded = true
    else
        handleTransform(event.data.operation, event.data.readable, event.data.writable)
}

// Handler for RTCRtpScriptTransforms
if (self.RTCTransformEvent) {
    self.onrtctransform = event => {
        const transformer = event.transformer
        handleTransform(transformer.options.operation, transformer.readable, transformer.writable)
    }
}
