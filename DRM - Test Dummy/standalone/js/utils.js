'use strict'

function hexToUint8Array(hexString) {
    if (!hexString)
        return null
    if ((hexString.length % 2) !== 0) {
        console.error(`Malformed hex string (${hexString}), odd length`)
        return null
    }
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}

export const DecryptMode = Object.freeze({
    InPlace: 0,
    ClearKey: 1,
    ProdDrm: 2
})

export function loadSettings() {
    let settings = {
        videoCodec: document.getElementById('video-codec').value,
        aesMode: document.getElementById('aes-mode').selectedIndex === 0 ? 'CTR' : 'CBC',
        key: hexToUint8Array(document.getElementById('key').value),
        iv: hexToUint8Array(document.getElementById('iv').value),
        decryptMode: document.getElementById('decrypt-mode').selectedIndex,

        merchant: null,
        keyId: null
    }

    if (settings.decryptMode === DecryptMode.ProdDrm) {
        settings.merchant = document.getElementById('merchant').value
        settings.keyId = hexToUint8Array(document.getElementById('key-id').value)
        settings.hardwareSecure = document.getElementById('hardware-secure').checked
        settings.outputProtection = document.getElementById('output-protection').checked
    }

    return settings
}
