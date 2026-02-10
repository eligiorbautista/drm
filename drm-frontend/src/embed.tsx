import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { EmbedApp } from './components/EmbedApp';
import { EncryptionProvider } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EncryptionProvider>
      <EmbedApp />
    </EncryptionProvider>
  </StrictMode>,
);
