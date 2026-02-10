import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock WebRTC globals required by CastLabs SDK
if (typeof globalThis.RTCRtpSender === 'undefined') {
    vi.stubGlobal('RTCRtpSender', class {} as any);
}

vi.stubGlobal('RTCSessionDescription', class {
    type: string;
    sdp: string;
    constructor({ type, sdp }: { type: string, sdp: string }) {
        this.type = type;
        this.sdp = sdp;
    }
    toJSON() { return { type: this.type, sdp: this.sdp }; }
} as any);

vi.stubGlobal('RTCPeerConnection', class {
    iceGatheringState = 'complete';
    iceConnectionState = 'new';
    localDescription = { sdp: 'v=0...' };
    remoteDescription = null;
    createOffer = vi.fn().mockResolvedValue({ sdp: 'v=0...' });
    setLocalDescription = vi.fn().mockResolvedValue(undefined);
    setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    addTransceiver = vi.fn().mockReturnValue({ direction: 'recvonly' });
    close = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
} as any);

vi.stubGlobal('TransformStream', class {
    readable = {} as any;
    writable = {} as any;
} as any);

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status: 201,
    text: () => Promise.resolve('v=0...'),
}));

vi.stubGlobal('MediaStream', class {
    addTrack = vi.fn();
    getTracks = vi.fn().mockReturnValue([]);
});
