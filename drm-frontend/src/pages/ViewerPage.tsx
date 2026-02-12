import { useState } from 'react';
import { Player } from '../components/Player';
import { useEncryption } from '../App';

export function ViewerPage({ isEmbedMode }: { isEmbedMode?: boolean } = {}) {
  const { enabled: encryptedFromSettings, loading: encryptionLoading, error: encryptionError } = useEncryption();

  // State for WHEP endpoint
  const streamDomain = import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN;
  const defaultWhepPath = import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT;
  const [whepEndpoint, setWhepEndpoint] = useState(streamDomain + defaultWhepPath);
  const merchant = import.meta.env.VITE_DRM_MERCHANT;
  const isProduction = import.meta.env.VITE_NODE_ENV === 'production';

  console.log('[ViewerPage] Config:', {
    baseSetting: encryptedFromSettings,
    encryptionLoading,
    encryptionError
  });

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <Player
        endpoint={whepEndpoint}
        merchant={merchant}
        userId="elidev-test"
        encrypted={encryptedFromSettings}
        isEmbedMode={isEmbedMode}
      />

      {/* Settings Panel - Hidden in production */}
      {!isProduction && !isEmbedMode && (
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
                  checked={encryptedFromSettings}
                  disabled
                  className="w-5 h-5 text-white rounded focus:ring-white bg-[#252525] border-[#404040] cursor-not-allowed opacity-60"
                />
                <label htmlFor="drm-toggle" className="font-medium text-[#a0a0a0] cursor-not-allowed text-sm">
                  Enable DRM Decryption (Manage in Settings)
                </label>
              </div>

              {encryptedFromSettings && (
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
                encrypted: encryptedFromSettings,
                encryptionMode: encryptedFromSettings ? 'cbcs' : undefined,
                keys: encryptedFromSettings ? 'From .env' : undefined,
                token: encryptedFromSettings ? 'Auto-generated' : undefined
              }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
