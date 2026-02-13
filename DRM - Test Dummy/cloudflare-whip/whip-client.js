import negotiateConnectionWithClientOffer from "./peer-connection.js";

let drmConfig = null;
let encryptionModule = null;

/**
 * Example implementation of a client that uses WHIP to broadcast video over WebRTC
 *
 * https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html
 */
export class WHIPClient {
	constructor(endpoint, videoElement, drmConfigModule) {
		this.endpoint = endpoint;
		this.videoElement = videoElement;
		drmConfig = drmConfigModule;
		
		// Store DRM config for later use in transforms
		if (drmConfig) {
			console.info('[WHIP Client] DRM encryption enabled for sender')
		}

		/**
		 * Create a new WebRTC connection, using public STUN servers with ICE,
		 * allowing the client to disover its own IP address.
		 * https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols#ice
		 */
		this.peerConnection = new RTCPeerConnection({
			iceServers: [
				{
					urls: "stun:stun.cloudflare.com:3478",
				},
			],
			bundlePolicy: "max-bundle",
			encodedInsertableStreams: !!drmConfig
		});
		/**
		 * Listen for negotiationneeded events, and use WHIP as the signaling protocol to establish a connection
		 *
		 * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/negotiationneeded_event
		 * https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.html
		 */
		this.peerConnection.addEventListener("negotiationneeded", async (ev) => {
			console.log("Connection negotiation starting");
			await negotiateConnectionWithClientOffer(
				this.peerConnection,
				this.endpoint
			);
			console.log("Connection negotiation ended");
		});
		/**
		 * While the connection is being initialized,
		 * connect the video stream to the provided <video> element.
		 */
		// For sender-side encryption, load crypto module FIRST before accessing media
		const setupPromise = drmConfig 
			? this.loadEncryptionModule().then(() => {
				console.info('[WHIP Client] Encryption module loaded, now accessing media sources...')
				return this.accessLocalMediaSources()
			})
			: this.accessLocalMediaSources()
		
		setupPromise
			.then((stream) => {
				this.localStream = stream;
				videoElement.srcObject = stream;
			})
			.catch(console.error);
	}
	
	async loadEncryptionModule() {
		try {
			console.time('WASM crypto loaded in')
			const crypto = await Module()
			console.timeEnd('WASM crypto loaded in')
			
			// Create encryptor with DRM keys (use key, not keyId for encryption)
			const key = drmConfig.video.key
			const iv = drmConfig.video.iv
			
			if (!key || !iv) {
				throw new Error('Encryption key or IV missing from drmConfig')
			}
			
			const mode = drmConfig.mode === 'CTR' ? crypto.Mode.CTR : crypto.Mode.CBC
			encryptionModule = new crypto.Encryptor(crypto.Codec.AVC, mode, key, drmConfig.maxFrameSize || 2 * 1024 * 1024)
			
			if (drmConfig.mode === 'CBC') {
				encryptionModule.setCbcIv(iv)
			}
			
			console.info('[WHIP Client] Encryption module loaded successfully')
		} catch (err) {
			console.error('[WHIP Client] Failed to load encryption module:', err)
		}
	}
	/**
	 * Ask for camera and microphone permissions and
	 * add video and audio tracks to the peerConnection.
	 * Improved to handle virtual cameras like OBS.
	 *
	 * https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
	 */
	async accessLocalMediaSources() {
		try {
			// First, try to enumerate devices to see what's available
			const devices = await navigator.mediaDevices.enumerateDevices();
			const videoDevices = devices.filter(device => device.kind === 'videoinput');
			const audioDevices = devices.filter(device => device.kind === 'audioinput');
			
			console.log('Available video devices:', videoDevices.map(d => d.label || d.deviceId));
			console.log('Available audio devices:', audioDevices.map(d => d.label || d.deviceId));
			
			// Check if any devices are available
			if (videoDevices.length === 0) {
				throw new Error('No video input devices found. If using OBS Virtual Camera, make sure it is started.');
			}
			
			// Try different video constraint strategies
			let stream = null;
			const videoConstraints = [
				// Try with the most permissive constraints first for virtual cameras
				{ video: true, audio: true },
				// Try with flexible resolution constraints
				{ video: { width: { min: 640, ideal: 1280, max: 1920 }, height: { min: 480, ideal: 720, max: 1080 } }, audio: true },
				// Try specific device if OBS Virtual Camera is detected
				...(videoDevices.some(d => d.label.toLowerCase().includes('obs')) ? 
					[{ video: { deviceId: videoDevices.find(d => d.label.toLowerCase().includes('obs')).deviceId }, audio: true }] : []),
				// Try with specific resolution (original approach)
				{ video: { width: 1280, height: 720 }, audio: true },
				// Try video only without audio
				{ video: true, audio: false },
				// Last resort: try any video device specifically
				...(videoDevices.map(device => ({ video: { deviceId: device.deviceId }, audio: false })))
			];
			
			for (let i = 0; i < videoConstraints.length; i++) {
				const constraints = videoConstraints[i];
				try {
					console.log(`Attempt ${i + 1}/${videoConstraints.length}: Trying getUserMedia with constraints:`, constraints);
					stream = await navigator.mediaDevices.getUserMedia(constraints);
					console.log('Successfully got media stream with tracks:', stream.getTracks().map(t => ({ kind: t.kind, label: t.label })));
					break;
				} catch (err) {
					console.warn(`Attempt ${i + 1} failed with constraints`, constraints, '- Error:', err.name, err.message);
					if (err.name === 'NotFoundError' || err.name === 'DeviceNotFoundError') {
						// Continue to next constraint
						continue;
					} else if (err.name === 'NotAllowedError') {
						throw new Error('Camera/microphone permission denied. Please allow access and refresh the page.');
					} else if (err.name === 'NotReadableError') {
						console.warn('Device might be in use, trying next constraint...');
						continue;
					} else {
						// For other errors, still try remaining constraints
						continue;
					}
				}
			}
			
			if (!stream) {
				throw new Error('No camera or microphone found. Make sure OBS Virtual Camera is started and accessible.');
			}
			
			stream.getTracks().forEach((track) => {
				console.log(`Adding ${track.kind} track:`, track.label);
				const transceiver = this.peerConnection.addTransceiver(track, {
					/** WHIP is only for sending streaming media */
					direction: "sendonly",
				});
				if (track.kind === "video" && transceiver.sender.track) {
					// Apply video constraints after track is added
					try {
						transceiver.sender.track.applyConstraints({
							width: { ideal: 1280, max: 1920 },
							height: { ideal: 720, max: 1080 },
							frameRate: { ideal: 30 }
						});
					} catch (constraintErr) {
						console.warn('Could not apply video constraints:', constraintErr.message);
					}
				}
				// Use sender transforms for encryption
				if (drmConfig) {
					console.info(`[WHIP Client] Setting up sender transform for ${track.kind} track`)
					this.setupSenderTransform(transceiver, track.kind)
				}
			});
			return stream;
		} catch (error) {
			console.error('Error accessing media devices:', error);
			// Show user-friendly error message
			const errorMsg = this.getErrorMessage(error);
			alert(errorMsg);
			throw error;
		}
	}
	/**
	 * Get user-friendly error message based on error type
	 */
	getErrorMessage(error) {
		switch (error.name) {
			case 'NotFoundError':
			case 'DeviceNotFoundError':
				return 'No camera or microphone found.\n\nIf using OBS Virtual Camera:\n1. Make sure OBS is running\n2. Start Virtual Camera in OBS (Tools > Virtual Camera)\n3. Refresh this page';
			case 'NotAllowedError':
				return 'Camera/microphone access denied.\n\nPlease:\n1. Click the camera icon in your browser\'s address bar\n2. Allow camera and microphone access\n3. Refresh this page';
			case 'NotReadableError':
				return 'Camera is being used by another application.\n\nPlease close other apps using the camera and refresh.';
			case 'OverconstrainedError':
				return 'Camera doesn\'t support the requested settings.\n\nThis may happen with some virtual cameras.';
			default:
				return `Camera error: ${error.message}\n\nTry refreshing the page or check your camera settings.`;
		}
	}
	
	/**
	 * Terminate the streaming session
	 * 1. Notify the WHIP server by sending a DELETE request
	 * 2. Close the WebRTC connection
	 * 3. Stop using the local camera and microphone
	 *
	 * Note that once you call this method, this instance of this WHIPClient cannot be reused.
	 */
	async disconnectStream() {
		var _a;
		const response = await fetch(this.endpoint, {
			method: "DELETE",
			mode: "cors",
		});
		this.peerConnection.close();
		(_a = this.localStream) === null || _a === void 0
			? void 0
			: _a.getTracks().forEach((track) => track.stop());
	}

	setupSenderTransform(transceiver, trackType) {
		const senderStreams = transceiver.sender.createEncodedStreams();
		const {readable, writable} = senderStreams;
		const transformStream = new TransformStream({
			transform: trackType === 'video' ? videoTransformFunction : audioTransformFunction,
		});
		readable.pipeThrough(transformStream).pipeTo(writable);
		console.info(`[WHIP Client] Sender transform set up for ${trackType}`)
	}
}

async function videoTransformFunction(encodedFrame, controller) {
	// Wait for encryption module to be loaded
	if (!encryptionModule) {
		// Pass through unencrypted if module not ready yet
		controller.enqueue(encodedFrame);
		return;
	}

	try {
		const srcBuf = encryptionModule.getSrcBuffer();
		srcBuf.set(new Uint8Array(encodedFrame.data));
		const encryptedSize = encryptionModule.encrypt(encodedFrame.data.byteLength);

		if (encryptedSize > 0) {
			// Retrieve the encrypted data from the encryptor
			const dstBuf = encryptionModule.getDstBuffer();
			const newData = new ArrayBuffer(encryptedSize);
			(new Uint8Array(newData)).set(dstBuf);

			encodedFrame.data = newData;
		}
	} catch (err) {
		console.error('[WHIP] Video encryption error:', err);
	}

	controller.enqueue(encodedFrame);
}

async function audioTransformFunction(encodedFrame, controller) {
	// Audio is not encrypted - just pass through
	controller.enqueue(encodedFrame);
}
