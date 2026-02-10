import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock the Player component since we only care about the props passed to it
vi.mock('./components/Player', () => ({
  Player: ({ encrypted }: { encrypted: boolean }) => (
    <div data-testid="mock-player">
      Player Encrypted: {encrypted ? 'true' : 'false'}
    </div>
  ),
}));

describe('App', () => {
  it('toggles DRM encryption', () => {
    render(<App />);
    
    // Check initial state (Encrypted: false)
    expect(screen.getByTestId('mock-player')).toHaveTextContent('Player Encrypted: false');
    
    // Find the toggle button (we'll look for a checkbox or button)
    const toggle = screen.getByRole('checkbox', { name: /enable drm/i });
    
    // Click it
    fireEvent.click(toggle);
    
    // Check updated state (Encrypted: true)
    expect(screen.getByTestId('mock-player')).toHaveTextContent('Player Encrypted: true');
  });
});
