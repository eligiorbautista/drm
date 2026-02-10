import { describe, it, expect } from 'vitest';
import * as DrmSdk from './drm';

describe('CastLabs SDK Integration', () => {
    it('should export rtcDrmConfigure function', () => {
        expect(typeof DrmSdk.rtcDrmConfigure).toBe('function');
    });

    it('should have environments defined', () => {
        expect(DrmSdk.rtcDrmEnvironments).toBeDefined();
    });
});
