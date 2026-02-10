import { render, screen, cleanup } from '@testing-library/react';
import { Player } from './Player';
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as useWhepModule from '../hooks/useWhep';

// Mock the entire module
vi.mock('../hooks/useWhep');

// Mock useDrm
vi.mock('../hooks/useDrm', () => ({
  useDrm: vi.fn(() => ({
    setup: vi.fn(),
    handleTrack: vi.fn()
  }))
}));

describe('Player UX', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('displays a loading state when connecting', () => {
    // Mock useWhep to return isConnecting: true
    vi.spyOn(useWhepModule, 'useWhep').mockReturnValue({
      isConnected: false,
      // @ts-ignore - isConnecting doesn't exist yet, this should fail compilation or test
      isConnecting: true, 
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      peerConnection: null
    });

    render(<Player endpoint="http://test.com" merchant="test" />);
    
    // We expect to find multiple indications of loading (overlay and button)
    const loadingElements = screen.getAllByText(/connecting/i);
    expect(loadingElements.length).toBeGreaterThan(0);
    
    // Button should be disabled
    const button = screen.getByRole('button', { name: /connecting/i });
    expect(button).toBeDisabled();
  });

  it('displays an error message when connection fails', () => {
    vi.spyOn(useWhepModule, 'useWhep').mockReturnValue({
      isConnected: false,
      // @ts-ignore
      isConnecting: false,
      error: "Failed to reach server",
      connect: vi.fn(),
      disconnect: vi.fn(),
      peerConnection: null
    });

    render(<Player endpoint="http://test.com" merchant="test" />);
    
    expect(screen.getByText(/failed to reach server/i)).toBeInTheDocument();
  });
});
