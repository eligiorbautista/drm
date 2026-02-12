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
    ProdDrm: 1
})

export function loadSettings() {
    let settings = {
        aesMode: document.getElementById('aes-mode').selectedIndex === 0 ? 'CTR' : 'CBC',
        key: [],
        iv: [],
        decryptMode: document.getElementById('decrypt-mode').selectedIndex,

        merchant: '',
        keyId: []
    }

    if (settings.decryptMode === DecryptMode.ProdDrm) {
        settings.merchant = document.getElementById('merchant').value
        settings.keyId = []
    }

    for (let idx = 0; idx < 2; ++idx) {
        settings.key[idx] = hexToUint8Array(document.getElementById(`key${idx + 1}`).value)
        settings.iv[idx] = hexToUint8Array(document.getElementById(`iv${idx + 1}`).value)

        if (settings.decryptMode === DecryptMode.ProdDrm)
            settings.keyId[idx] = hexToUint8Array(document.getElementById(`key-id${idx + 1}`).value)
    }

    return settings
}
