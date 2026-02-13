import { renderHook, act } from '@testing-library/react';
import { useDrm } from './useDrm';
import { describe, it, expect, vi } from 'vitest';
import * as DrmLib from '../lib/drm';

vi.mock('../lib/drm', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    rtcDrmConfigure: vi.fn(),
    rtcDrmOnTrack: vi.fn(),
  };
});

// Mock detectHardwareSecuritySupport to return supported=true in test environment
// (jsdom has no EME API, so it would otherwise always detect no HW security)
vi.mock('../lib/drmUtils', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    detectHardwareSecuritySupport: vi.fn().mockResolvedValue({
      supported: true,
      details: [
        { system: 'Widevine', hwSecure: true },
        { system: 'PlayReady', hwSecure: false },
        { system: 'FairPlay', hwSecure: false },
      ]
    }),
  };
});

describe('useDrm', () => {
  it('should call rtcDrmConfigure when setup is called', async () => {
    const { result } = renderHook(() => useDrm());
    const videoElement = document.createElement('video');
    const options = { merchant: 'test', videoElement };

    await act(async () => {
      await result.current.setup(options);
    });

    expect(DrmLib.rtcDrmConfigure).toHaveBeenCalled();
  });

  it('should call rtcDrmOnTrack when handleTrack is called', async () => {
    const { result } = renderHook(() => useDrm());
    const videoElement = document.createElement('video');
    const options = { merchant: 'test', videoElement };

    await act(async () => {
      await result.current.setup(options);
    });

    const event = { track: {} } as any;
    act(() => {
      result.current.handleTrack(event);
    });

    expect(DrmLib.rtcDrmOnTrack).toHaveBeenCalledWith(event);
  });
});