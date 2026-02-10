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

describe('useDrm', () => {
  it('should call rtcDrmConfigure when setup is called', () => {
    const { result } = renderHook(() => useDrm());
    const videoElement = document.createElement('video');
    const options = { merchant: 'test', videoElement };
    
    act(() => {
      result.current.setup(options);
    });

    expect(DrmLib.rtcDrmConfigure).toHaveBeenCalled();
  });

  it('should call rtcDrmOnTrack when handleTrack is called', () => {
    const { result } = renderHook(() => useDrm());
    const videoElement = document.createElement('video');
    const options = { merchant: 'test', videoElement };
    
    act(() => {
      result.current.setup(options);
    });

    const event = { track: {} } as any;
    act(() => {
      result.current.handleTrack(event);
    });

    expect(DrmLib.rtcDrmOnTrack).toHaveBeenCalledWith(event);
  });
});