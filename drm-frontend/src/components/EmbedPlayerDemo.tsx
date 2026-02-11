import { useState, useRef } from 'react';
import { 
  openEmbedPlayer, 
  openEmbedPopup, 
  openEmbedFullscreen, 
  generateEmbedCode,
  createSecureEmbedPlayer,
  checkEmbedSupport 
} from '../lib/embedPlayer';

/**
 * Example component demonstrating the embed player functionality
 * with emphasis on the secure (hidden config) methods
 */
export function EmbedPlayerDemo() {
  const [embedCode, setEmbedCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const secureContainerRef = useRef<HTMLDivElement>(null);
  const [securePlayer, setSecurePlayer] = useState<{ destroy: () => void } | null>(null);
  const support = checkEmbedSupport();

  const handleOpenPlayer = () => {
    // Secure: endpoint and merchant are NOT visible in URL
    openEmbedPlayer({
      width: 1280,
      height: 720,
    });
  };

  const handleOpenFullscreen = () => {
    // Secure: endpoint and merchant are NOT visible in URL
    openEmbedFullscreen();
  };

  const handleOpenPopup = () => {
    // Secure: endpoint and merchant are NOT visible in URL
    openEmbedPopup(800, 600);
  };

  const handleGenerateCode = () => {
    // Warning: endpoint and merchant ARE visible in URL
    const code = generateEmbedCode({
      width: 1280,
      height: 720,
    });
    setEmbedCode(code);
    setShowCode(true);
  };

  const handleCreateSecureIframe = () => {
    // Secure: endpoint and merchant are NOT visible in URL
    if (secureContainerRef.current) {
      // Clean up previous player
      if (securePlayer) {
        securePlayer.destroy();
      }
      
      const player = createSecureEmbedPlayer(secureContainerRef.current, {
        width: 1280,
        height: 720,
      });
      
      setSecurePlayer(player);
    }
  };

  const handleDestroySecureIframe = () => {
    if (securePlayer) {
      securePlayer.destroy();
      setSecurePlayer(null);
    }
  };

  if (!support.supported) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
        <h3 className="text-red-500 font-semibold mb-2">Browser Not Supported</h3>
        <ul className="text-red-400/70 text-sm space-y-1">
          {support.issues.map((issue, i) => (
            <li key={i}>• {issue}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Notice */}
      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <h3 className="text-green-500 font-semibold mb-1">Secure Configuration</h3>
            <p className="text-green-400/80 text-sm">
              The <code className="bg-green-500/20 px-1 rounded">openEmbedPlayer()</code> and{' '}
              <code className="bg-green-500/20 px-1 rounded">createSecureEmbedPlayer()</code> functions hide 
              the endpoint URL and merchant ID from the browser address bar. Users cannot copy/paste 
              the URL to share the stream.
            </p>
          </div>
        </div>
      </div>

      {/* Browser Support Status */}
      <div className="p-4 bg-[#252525] rounded-lg border border-[#404040]">
        <h3 className="text-white font-semibold mb-3">Browser Support</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className={`p-3 rounded-lg border ${support.webrtc ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="text-xs text-[#a0a0a0] mb-1">WebRTC</div>
            <div className={`text-sm font-medium ${support.webrtc ? 'text-green-500' : 'text-red-500'}`}>
              {support.webrtc ? 'Supported' : 'Not Supported'}
            </div>
          </div>
          <div className={`p-3 rounded-lg border ${support.eme ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="text-xs text-[#a0a0a0] mb-1">EME (DRM)</div>
            <div className={`text-sm font-medium ${support.eme ? 'text-green-500' : 'text-red-500'}`}>
              {support.eme ? 'Supported' : 'Not Supported'}
            </div>
          </div>
          <div className={`p-3 rounded-lg border ${support.insertableStreams ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="text-xs text-[#a0a0a0] mb-1">Insertable Streams</div>
            <div className={`text-sm font-medium ${support.insertableStreams ? 'text-green-500' : 'text-red-500'}`}>
              {support.insertableStreams ? 'Supported' : 'Not Supported'}
            </div>
          </div>
        </div>
      </div>

      {/* Secure Methods */}
      <div>
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          Secure Methods (Hidden Config)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleOpenPlayer}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-[#e5e5e5] text-[#141414] rounded-lg font-medium transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Open Player (1280×720)
          </button>

          <button
            onClick={handleOpenFullscreen}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#252525] hover:bg-[#333333] text-white rounded-lg font-medium transition-all border border-[#404040] cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Open Fullscreen
          </button>

          <button
            onClick={handleOpenPopup}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#252525] hover:bg-[#333333] text-white rounded-lg font-medium transition-all border border-[#404040] cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Popup (800×600)
          </button>

          <button
            onClick={handleCreateSecureIframe}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#252525] hover:bg-[#333333] text-white rounded-lg font-medium transition-all border border-[#404040] cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />
            </svg>
            Create Secure Iframe
          </button>
        </div>
        
        {/* Secure Iframe Container */}
        {securePlayer && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#a0a0a0]">Secure Embedded Player</span>
              <button
                onClick={handleDestroySecureIframe}
                className="text-xs px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors cursor-pointer"
              >
                Destroy Player
              </button>
            </div>
            <div 
              ref={secureContainerRef}
              className="bg-black rounded-lg overflow-hidden"
              style={{ minHeight: '400px' }}
            />
          </div>
        )}
        {!securePlayer && (
          <div 
            ref={secureContainerRef}
            className="hidden"
          />
        )}
      </div>

      {/* URL-Exposed Method */}
      <div>
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          URL-Exposed Method (Use with Caution)
        </h3>
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-3">
          <p className="text-amber-400/80 text-xs">
            <strong>Warning:</strong> The embed code below exposes the endpoint and merchant ID 
            in the URL. Only use this if the configuration is not sensitive or for third-party 
            integrations where you cannot use the secure methods.
          </p>
        </div>
        <button
          onClick={handleGenerateCode}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 bg-[#252525] hover:bg-[#333333] text-white rounded-lg font-medium transition-all border border-[#404040] cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          Generate Embed Code
        </button>
      </div>

      {/* Embed Code Display */}
      {showCode && (
        <div className="p-4 bg-[#1e1e1e] rounded-lg border border-[#404040]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-semibold">Embed Code</h3>
              <p className="text-amber-400/70 text-xs mt-1">
                Configuration is visible in the URL
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(embedCode);
              }}
              className="text-xs px-3 py-1 bg-[#333333] hover:bg-[#404040] text-white rounded transition-colors cursor-pointer"
            >
              Copy to Clipboard
            </button>
          </div>
          <pre className="text-[#d0d0d0] text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-[#252525]/50 p-3 rounded">
            {embedCode}
          </pre>
        </div>
      )}

      {/* Configuration Info */}
      <div className="p-4 bg-[#1e1e1e] rounded-lg border border-[#404040]">
        <h3 className="text-white font-semibold mb-3">Current Configuration</h3>
        <p className="text-[#a0a0a0] text-sm mb-3">
          This configuration is used when opening the secure player. 
          It is <strong>embedded in the page content</strong>, not visible in URLs.
        </p>
        <pre className="text-[#d0d0d0] text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-[#252525]/50 p-3 rounded">
          {JSON.stringify({
            endpoint: import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN + import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT,
            merchant: import.meta.env.VITE_DRM_MERCHANT,
            encrypted: true,
          }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
