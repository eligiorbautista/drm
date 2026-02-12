import { useState } from 'react';
import { Player } from '../components/Player';
import { EmbedPlayerWithDrm } from '../components/EmbedPlayerWithDrm';
import { useEncryption } from '../App';

interface ViewerPageProps {
  isEmbedMode?: boolean;
}

export function ViewerPage({ isEmbedMode = false }: ViewerPageProps) {
  const { enabled: encryptedFromSettings, loading: encryptionLoading, error: encryptionError } = useEncryption();
  
  // Check URL query parameters for encryption override
  // In embed mode, read the URL parameter to control DRM decryption
  // Usage: /embed?encrypted=true for DRM decryption, /embed?encrypted=false for unencrypted
  const queryParams = isEmbedMode ? new URLSearchParams(window.location.search) : null;
  const encryptedParam = queryParams?.get('encrypted');
  
  // Use URL parameter in embed mode, otherwise use database setting
  const shouldUseEncryption = isEmbedMode 
    ? (encryptedParam === 'true') 
    : encryptedFromSettings;

  // State for WHEP endpoint (used in settings panel and embed URL generation)
  const streamDomain = import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN;
  const defaultWhepPath = import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT;
  const [whepEndpoint, setWhepEndpoint] = useState(streamDomain + defaultWhepPath);
  const merchant = import.meta.env.VITE_DRM_MERCHANT;
  const isProduction = import.meta.env.VITE_NODE_ENV === 'production';
  
  // Get current endpoint from state (either initial or user-modified)
  const getEmbedUrl = () => {
    const endpointParam = encodeURIComponent(whepEndpoint);
    const encryptedParam = shouldUseEncryption ? `&encrypted=true` : '';
    return `${window.location.origin}/embed?endpoint=${endpointParam}${encryptedParam}`;
  };

  // Build embed URL - endpoint is loaded from env file, only encryption flag is passed
  const getEmbedUrl = () => {
    const encryptedParam = shouldUseEncryption ? `?encrypted=true` : '';
    return `${window.location.origin}/embed${encryptedParam}`;
  };

  const openEmbedPlayer = () => {
    const embedUrl = getEmbedUrl();
    window.open(embedUrl, '_blank', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  };

  console.log('[ViewerPage] Config:', {
    isEmbedMode,
    encryptedParam,
    baseSetting: encryptedFromSettings,
    encryptionLoading,
    encryptionError,
    shouldUseEncryption,
    embedUrl: getEmbedUrl()
  });

  // Auto-set fullscreen for embed mode
  const showFullscreen = isEmbedMode;

  if (showFullscreen) {
    // In embed mode, use the EmbedPlayerWithDrm for clean iframe embedding with DRM support
    console.log('[ViewerPage] Embed mode - using EmbedPlayerWithDrm');
    return (
      <div className="min-h-screen bg-black m-0 p-0">
        <EmbedPlayerWithDrm
          endpoint={whepEndpoint}
          encrypted={shouldUseEncryption}
          merchant={merchant}
          userId="elidev-test"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <Player
        endpoint={whepEndpoint}
        merchant={merchant}
        userId="elidev-test"
        encrypted={shouldUseEncryption}
        onOpenEmbed={openEmbedPlayer}
      />

      {/* Settings Panel - Hidden in production */}
      {!isProduction && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Controls Panel */}
          <div className="p-4 sm:p-6 bg-[#1e1e1e] rounded-lg border border-[#333333]">
            <h2 className="font-bold mb-3 sm:mb-4 text-base sm:text-lg lg:text-xl text-white border-b border-[#333333] pb-2">
              Viewer Settings
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="endpoint-input" className="block text-xs sm:text-sm font-medium text-[#a0a0a0]">
                  WHEP Endpoint URL
                </label>
                <input
                  id="endpoint-input"
                  type="text"
                  value={whepEndpoint}
                  onChange={(e) => setWhepEndpoint(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-[#252525] border border-[#404040] rounded focus:ring-2 focus:ring-white focus:border-transparent outline-none transition-all text-xs sm:text-sm font-mono"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="drm-toggle"
                  checked={shouldUseEncryption}
                  disabled
                  className="w-5 h-5 text-white rounded focus:ring-white bg-[#252525] border-[#404040] cursor-not-allowed opacity-60"
                />
                <label htmlFor="drm-toggle" className="font-medium text-[#a0a0a0] cursor-not-allowed text-sm">
                  Enable DRM Decryption (Manage in Settings)
                </label>
              </div>

              {shouldUseEncryption && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-[#333333] pt-4">
                  <div className="text-xs sm:text-sm text-[#a0a0a0]">
                    <p className="mb-1 flex items-center gap-1">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Mode: <span className="text-[#d0d0d0] font-mono">AES-CBC (cbcs)</span>
                    </p>
                    <p className="mb-1 flex items-center gap-1">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Keys: <span className="text-[#d0d0d0]">From .env file</span>
                    </p>
                    <p className="flex items-center gap-1">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Token: <span className="text-[#d0d0d0]">Auto-generated</span>
                    </p>
                  </div>
                  <div className="text-xs text-[#a0a0a0] bg-[#252525] p-2 rounded">
                    DRM configuration matches WHEP sender settings
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Config Display */}
          <div className="p-4 sm:p-6 bg-[#1e1e1e] rounded-lg border border-[#333333]">
            <h2 className="font-bold mb-3 sm:mb-4 text-base sm:text-lg lg:text-xl text-white border-b border-[#333333] pb-2">
              Viewer Configuration
            </h2>
            <pre className="text-[#d0d0d0] text-xs sm:text-sm overflow-x-auto whitespace-pre-wrap font-mono bg-[#252525]/50 p-3 sm:p-4 rounded max-h-48 sm:max-h-64">
              {JSON.stringify({
                mode: 'viewer',
                endpoint: whepEndpoint,
                merchant,
                encrypted: shouldUseEncryption,
                encryptionMode: shouldUseEncryption ? 'cbcs' : undefined,
                keys: shouldUseEncryption ? 'From .env' : undefined,
                token: shouldUseEncryption ? 'Auto-generated' : undefined
              }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
