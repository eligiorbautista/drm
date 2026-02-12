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
    ClearKey: 0,
    ProdDrm: 1
})

export function loadSettings() {
    let settings = {
        aesMode: document.getElementById('aes-mode').selectedIndex === 0 ? 'CTR' : 'CBC',
        key: hexToUint8Array(document.getElementById('key').value),
        iv: hexToUint8Array(document.getElementById('iv').value),
        decryptMode: document.getElementById('decrypt-mode').selectedIndex,

        merchant: '',
        keyId: null
    }

    if (settings.decryptMode === DecryptMode.ProdDrm) {
        settings.merchant = document.getElementById('merchant').value
        settings.keyId = hexToUint8Array(document.getElementById('key-id').value)
    }

    return settings
}
