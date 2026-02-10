import { renderHook, act } from '@testing-library/react';
import { useWhep } from './useWhep';
import { describe, it, expect, vi } from 'vitest';

describe('useWhep', () => {
  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() => useWhep());
    expect(result.current.isConnected).toBe(false);
  });

  it('should have a connect function', () => {
    const { result } = renderHook(() => useWhep());
    expect(typeof result.current.connect).toBe('function');
  });

  it('should call fetch and set remote description on connect', async () => {
    const { result } = renderHook(() => useWhep());

    await act(async () => {
      await result.current.connect({ endpoint: 'http://test.com' }, null, null);
    });

    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('should set error state when connection fails', async () => {
    // Mock fetch to fail
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useWhep());

    await act(async () => {
      await result.current.connect({ endpoint: 'http://fail.com' }, null, null);
    });

    // This assertion fails if the bug exists (disconnect clears the error)
    expect(result.current.error).toBe('Network error');
    expect(result.current.isConnected).toBe(false);
  });
});