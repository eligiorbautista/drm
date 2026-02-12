'use strict'

import { WHIPClient } from './whip-client.js'

// DRM Configuration
const drmConfig = {
    enabled: true, // Set to true to enable DRM encryption,
    merchant: 'f43be426-727f-46ff-ba48-97a208ff40e0', // Merchant ID for DRM
    keyId: '5ed8fa5fa9ae4f45fa981793a01f950c',       // Key ID for DRM
    mode: 'CBC',     // 'CTR' for CENC or 'CBC' for CBCS
    key: '72dff9aaf8323bafb2f617687ef6fd76',         // Hex-encoded encryption key
    iv: 'dc576fccde9d9e3a77cc5f438f50fd0f',          // Hex-encoded IV (required for CBC mode)
    maxFrameSize: 1024 * 1024,  // Maximum frame size in bytes
    video: {
        keyId: null,  // Will be set below
        key: null,    // Will be set below
        iv: null      // Will be set below
    }
}

function hexToUint8Array(hexString) {
    if (!hexString) return null
    if ((hexString.length % 2) !== 0) {
        console.error(`Malformed hex string (${hexString}), odd length`)
        return null
    }
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}

window.onload = async function() {
    const params = new URLSearchParams(window.location.search)
    const account_id = 'customer-zl11k93xxb6833cs', whip_path = '06df7fb0f498eeaf3ae707ecefb5c0f1k67e997e2bae828cc40c2ad41d9da836b'

    if (account_id && whip_path) {
        const url = `https://${account_id}.cloudflarestream.com/${whip_path}/webRTC/publish`
        const videoElement = document.getElementById('input-video')

        let encryptor = null
        if (drmConfig.enabled) {
            // Convert hex strings to Uint8Arrays for video config
            drmConfig.video.keyId = hexToUint8Array(drmConfig.keyId)
            drmConfig.video.key = hexToUint8Array(drmConfig.key)
            drmConfig.video.iv = hexToUint8Array(drmConfig.iv)
            
            console.log('Loading WASM encryptor for DRMtoday-compatible encryption...')
            console.log(`Merchant: ${drmConfig.merchant}, KeyId: ${drmConfig.keyId}, Mode: ${drmConfig.mode}`)
            console.time('WASM loaded in')
            const crypto = await Module()
            console.timeEnd('WASM loaded in')

            const key = drmConfig.video.key
            const iv = drmConfig.video.iv

            if (!key) {
                alert('Invalid encryption key')
                return
            }

            // Create encryptor with selected mode (CBC for CBCS, CTR for CENC)
            const mode = drmConfig.mode === 'CTR' ? crypto.Mode.CTR : crypto.Mode.CBC
            encryptor = new crypto.Encryptor(crypto.Codec.AVC, mode, key, drmConfig.maxFrameSize)

            if (drmConfig.mode === 'CBC') {
                if (!iv) {
                    alert('IV required for CBC mode')
                    return
                }
                encryptor.setCbcIv(iv)
            }

            console.log(`Encryptor ready: ${drmConfig.mode} mode, ${key.length}-byte key`)
            console.log('Note: Ensure this KeyId and key are registered in your DRMtoday dashboard')
        }
        self.client = new WHIPClient(url, videoElement, drmConfig)
    }
    else
        alert('account_id and whip_path URL params have to be set')
}