import { ViewerPage } from './ViewerPage';
import { useLocation } from 'react-router-dom';

export function EmbedPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  // Parse encrypted parameter from URL query string
  // Defaults to true if the parameter is not specified (for compatibility)
  const encryptedParam = searchParams.get('encrypted');
  const encrypted = encryptedParam === 'true' || encryptedParam === null;

  console.log('[EmbedPage] encrypted from query param:', encrypted, 'raw param:', encryptedParam);

  return <ViewerPage isEmbedMode={true} encrypted={encrypted} />;
}

export default EmbedPage;
