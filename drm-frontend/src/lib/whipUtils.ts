/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) utility functions
 * Adapted from cloudflare-whip implementation
 */

/**
 * Enforce video codec preference in SDP
 * Forces H.264 codec by removing other video codecs from the SDP
 */
export function enforceVideoCodec(sdp: string, codec: string): string {
  const codecs = Array.isArray(codec) ? codec : [codec];
  
  if (!checkCodecsPresent(sdp, codecs)) {
    throw new Error(`Requested video codec(s) is not supported by browser`);
  }

  const allCodecs = ['VP8', 'VP9', 'H264', 'H265', 'AV1'];
  const codecsToRemove = allCodecs.filter(c => !codecs.includes(c));

  return removeCodecsFromSdp(sdp, codecsToRemove);
}

function checkCodecsPresent(sdp: string, codecs: string[]): boolean {
  const sdpLines = sdp.split('\r\n');
  for (const line of sdpLines) {
    if (line.startsWith('a=rtpmap:')) {
      const ptAndCodec = line.substring(9).split(' ');
      const codec = ptAndCodec[1].split('/')[0];
      if (codecs.includes(codec)) {
        return true;
      }
    }
  }
  return false;
}

function removeCodecsFromSdp(sdp: string, codecs: string[]): string {
  let sdpLines = sdp.split('\r\n');

  let ptToRemove: string[] = [];
  // First pass: collect all payload types to remove (direct hits in rtpmap records)
  for (const line of sdpLines) {
    if (line.startsWith('a=rtpmap:')) {
      const ptAndCodec = line.substring(9).split(' ');
      const pt = ptAndCodec[0];
      const codec = ptAndCodec[1].split('/')[0];
      if (codecs.includes(codec)) {
        ptToRemove.push(pt);
      }
    }
  }

  // Second pass: collect all payload types to remove (indirect hits in fmtp/apt records)
  for (const line of sdpLines) {
    if (line.startsWith('a=fmtp:')) {
      const ptAndApt = line.substring(7).split(' ');
      const pt = ptAndApt[0];
      const apt = ptAndApt[1].split('apt=');
      if (apt.length === 2 && apt[0] === '' && ptToRemove.includes(apt[1])) {
        ptToRemove.push(pt);
      }
    }
  }

  // Remove all lines containing the payload types to be removed
  let mungedSdp = '';
  for (const line of sdpLines) {
    let lineToAdd = '';
    if (line.startsWith('a=rtpmap:') || line.startsWith('a=rtcp-fb:') || line.startsWith('a=fmtp:')) {
      const pt = line.split(':')[1].split(' ')[0];
      if (!ptToRemove.includes(pt)) {
        lineToAdd = line;
      }
    } else if (line.startsWith('m=video') || line.startsWith('m=audio')) {
      const pts = line.split(' ');
      lineToAdd = pts[0] + ' ' + pts[1] + ' ' + pts[2];
      for (let i = 3; i < pts.length; ++i) {
        if (!ptToRemove.includes(pts[i])) {
          lineToAdd += ' ' + pts[i];
        }
      }
    } else {
      lineToAdd = line;
    }

    if (lineToAdd !== '') {
      mungedSdp += lineToAdd + '\r\n';
    }
  }

  return mungedSdp;
}

/**
 * Wait for ICE gathering to complete
 * Returns the local description after ICE candidates are gathered
 */
export async function waitToCompleteICEGathering(
  peerConnection: RTCPeerConnection
): Promise<RTCSessionDescription | null> {
  return new Promise((resolve) => {
    // Wait at most 1 second for ICE gathering
    const timeout = setTimeout(() => {
      resolve(peerConnection.localDescription);
    }, 1000);

    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve(peerConnection.localDescription);
      }
    };
  });
}

/**
 * Post SDP offer to WHIP endpoint
 */
export async function postSDPOffer(endpoint: string, sdp: string): Promise<Response> {
  return await fetch(endpoint, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'content-type': 'application/sdp',
    },
    body: sdp,
  });
}

/**
 * Negotiate connection with client offer using WHIP protocol
 * Performs the SDP exchange:
 * 1. Constructs the client's SDP offer
 * 2. Sends the SDP offer to the server
 * 3. Awaits the server's answer
 */
export async function negotiateConnectionWithClientOffer(
  peerConnection: RTCPeerConnection,
  endpoint: string
): Promise<string | null> {
  // Create offer
  const offer = await peerConnection.createOffer();
  
  // Force H264 by removing other video codecs from the SDP
  offer.sdp = enforceVideoCodec(offer.sdp || '', 'H264');

  // Set local description
  await peerConnection.setLocalDescription(offer);

  // Wait for ICE gathering to complete
  const offerWithIce = await waitToCompleteICEGathering(peerConnection);
  if (!offerWithIce || !offerWithIce.sdp) {
    throw new Error('Failed to gather ICE candidates for offer');
  }

  // Post offer to WHIP endpoint
  while (peerConnection.connectionState !== 'closed') {
    const response = await postSDPOffer(endpoint, offerWithIce.sdp);
    
    if (response.status === 201) {
      const answerSDP = await response.text();
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answerSDP })
      );
      return response.headers.get('Location');
    } else if (response.status === 405) {
      throw new Error('Invalid WHIP endpoint URL');
    } else {
      const errorMessage = await response.text();
      throw new Error(`WHIP signaling failed: ${errorMessage}`);
    }
  }

  return null;
}
