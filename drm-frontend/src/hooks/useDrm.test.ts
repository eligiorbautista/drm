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
    checkEmeAvailability: vi.fn().mockResolvedValue({ available: true }),
  };
});

// Mock detectDrmCapability to return a supported result in test environment.
// In jsdom there is no EME, so without this mock the hook would always
// throw WIDEVINE_L3_UNSUPPORTED.
vi.mock('../lib/drmCapability', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    detectDrmCapability: vi.fn().mockResolvedValue({
      supported: true,
      securityLevel: 'L1',
      selectedDrmType: 'Widevine',
      hwDetails: [
        { system: 'Widevine', hwSecure: true },
        { system: 'PlayReady', hwSecure: false },
        { system: 'FairPlay', hwSecure: false },
      ],
      platform: {
        isAndroid: false,
        isFirefox: false,
        isIOS: false,
        isSafari: false,
        isWindows: false,
        isChrome: true,
        isEdge: false,
        isMobile: false,
        detectedPlatform: 'Chrome',
      },
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