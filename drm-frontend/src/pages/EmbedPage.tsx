import { useSearchParams } from 'react-router-dom';
import { EmbedPlayerWithDrm } from '../components/EmbedPlayerWithDrm';

/**
 * Standalone embed player page with optional DRM support
 * This is a clean video-only player for iframe embedding
 * Endpoint is always loaded from environment variables (VITE_CLOUDFLARE_STREAM_DOMAIN + VITE_WHEP_ENDPOINT_DEFAULT)
 * Usage: /embed?encrypted=true
 */
export function EmbedPage() {
  const [searchParams] = useSearchParams();
  
  // Endpoint from environment variables (no URL override)
  const streamDomain = import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN;
  const defaultWhepPath = import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT;
  const endpoint = streamDomain + defaultWhepPath;
  
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
    endpoint: '(from env)',
    encrypted,
    merchant,
    userId
  });
  
  return (
    <div className="min-h-screen bg-black m-0 p-0">
      <EmbedPlayerWithDrm 
        endpoint={endpoint}
        encrypted={encrypted}
        merchant={merchant}
        userId={userId}
      />
    </div>
  );
}