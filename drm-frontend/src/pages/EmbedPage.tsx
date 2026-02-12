import { useSearchParams } from 'react-router-dom';
import { Player } from '../components/Player';

/**
 * Standalone embed player page with DRM support
 * This page is designed for iframe access with DRM decryption
 * Usage: /embed?endpoint=<whep-endpoint>&encrypted=true
 */
export function EmbedPage() {
  const [searchParams] = useSearchParams();
  
  // Get endpoint from URL query parameter
  // If not provided, use the default from environment variables
  const endpointParam = searchParams.get('endpoint');
  const streamDomain = import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN;
  const defaultWhepPath = import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT;
  const endpoint = endpointParam || (streamDomain + defaultWhepPath);
  
  // Get encryption setting from URL parameter
  // ?encrypted=true enables DRM decryption
  const encryptedParam = searchParams.get('encrypted');
  const encrypted = encryptedParam === 'true';
  
  // Get merchant and userId from URL or use defaults
  const merchantParam = searchParams.get('merchant');
  const userIdParam = searchParams.get('userId');
  
  const merchant = merchantParam || import.meta.env.VITE_DRM_MERCHANT;
  const userId = userIdParam || 'elidev-test';
  
  console.log('[EmbedPage] Config:', {
    endpoint: endpointParam ? '(from URL)' : '(default)',
    encrypted,
    merchant,
    userId
  });
  
  return (
    <div className="min-h-screen bg-black m-0 p-0">
      <Player 
        endpoint={endpoint}
        merchant={merchant}
        userId={userId}
        encrypted={encrypted}
        isEmbedMode={true}
      />
    </div>
  );
}