import { render, screen, cleanup } from '@testing-library/react';
import { Player } from './Player';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock hooks
vi.mock('../hooks/useWhep', () => ({
  useWhep: vi.fn(() => ({
    isConnected: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn()
  }))
}));

vi.mock('../hooks/useDrm', () => ({
  useDrm: vi.fn(() => ({
    setup: vi.fn(),
    handleTrack: vi.fn()
  }))
}));

describe('Player', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a video element', () => {
    render(<Player endpoint="http://test.com" merchant="test" />);
    expect(screen.getByRole('button', { name: /connect/i })).toBeDefined();
  });

  it('shows connect button when offline', () => {
    render(<Player endpoint="http://test.com" merchant="test" />);
    expect(screen.getByText(/offline/i)).toBeDefined();
  });
});
