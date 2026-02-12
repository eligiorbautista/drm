import { useSearchParams } from 'react-router-dom';
import { EmbedPlayer } from '../components/EmbedPlayer';

/**
 * Standalone embed player page
 * This page is designed for public/iframe access without authentication
 * Usage: /watch?endpoint=<whep-endpoint>
 */
export function EmbedPage() {
  const [searchParams] = useSearchParams();
  
  // Get endpoint from URL query parameter
  // If not provided, use the default from environment variables
  const endpointParam = searchParams.get('endpoint');
  const streamDomain = import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN;
  const defaultWhepPath = import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT;
  const endpoint = endpointParam || (streamDomain + defaultWhepPath);
  
  console.log('[EmbedPage] Endpoint:', endpoint, endpointParam ? '(from URL)' : '(default)');
  
  return (
    <div className="min-h-screen bg-black m-0 p-0">
      <EmbedPlayer endpoint={endpoint} />
    </div>
  );
}