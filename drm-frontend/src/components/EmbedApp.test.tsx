import { render, screen, cleanup } from '@testing-library/react';
import { EmbedApp } from './EmbedApp';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock Player
vi.mock('./Player', () => ({
  Player: () => <div>Mock Player</div>
}));

describe('EmbedApp', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the Player when endpoint is present', () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?endpoint=http://test.com',
      },
      writable: true
    });
    render(<EmbedApp />);
    expect(screen.getByText('Mock Player')).toBeDefined();
  });

  it('renders error when endpoint is missing', () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '',
      },
      writable: true
    });
    render(<EmbedApp />);
    expect(screen.getByText(/Error: Missing configuration/i)).toBeDefined();
  });
});