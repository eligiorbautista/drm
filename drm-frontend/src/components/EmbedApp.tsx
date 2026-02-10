import { useEffect, useState } from 'react';
import { Player } from './Player';
import { useEncryption } from '../App';

export const EmbedApp = () => {
  const [params, setParams] = useState<any>(null);
  const { enabled: encrypted } = useEncryption();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const endpointType = searchParams.get('type') || 'cloudflare'; // e.g. 'whip' or 'cloudflare'

    let endpoint;
    if (endpointType === 'whip') {
      endpoint = import.meta.env.VITE_WHIP_ENDPOINT_DEFAULT;
    } else {
      endpoint = import.meta.env.VITE_WHEP_ENDPOINT_DEFAULT;
    }

    if (endpoint && !endpoint.startsWith('http')) {
      const streamDomain = import.meta.env.VITE_CLOUDFLARE_STREAM_DOMAIN;
      if (streamDomain && endpoint.startsWith('/')) {
        endpoint = streamDomain + endpoint;
      }
    }

    if (!endpoint || endpoint === 'null' || endpoint === 'undefined') {
      setParams({ endpoint: null });
      return;
    }

    const parsedParams = {
      endpoint,
      merchant: import.meta.env.VITE_DRM_MERCHANT,
      encrypted
    };
    console.log('EmbedApp Parsed Params:', parsedParams);
    setParams(parsedParams);
  }, [encrypted]);

  if (!params) return null;

  if (!params.endpoint) {
    return (
      <div className="w-full h-screen bg-[#141414] text-white flex items-center justify-center">
        <div className="p-4 bg-[#1e1e1e]/50 border border-[#404040] rounded">
          <h2 className="font-bold text-white">Error: Missing configuration</h2>
          <p className="text-sm">
            Could not load endpoint from environment. 
            Please check that VITE_WHEP_ENDPOINT_DEFAULT or VITE_WHIP_ENDPOINT_DEFAULT is configured in .env file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-[#141414]">
      <Player
        endpoint={params.endpoint}
        merchant={params.merchant}
        userId="elidev-test"
        encrypted={params.encrypted}
        isEmbedMode={true}
      />
    </div>
  );
};