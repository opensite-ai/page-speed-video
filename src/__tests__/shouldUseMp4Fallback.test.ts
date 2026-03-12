import { describe, it, expect } from 'vitest';
import { shouldUseMp4Fallback } from '../fallback/shouldUseMp4Fallback';
import type { PlaybackState } from '../types';

describe('shouldUseMp4Fallback', () => {
  describe('Error State', () => {
    it('should return true when HLS state is error and fallbackSrc exists', () => {
      const result = shouldUseMp4Fallback('error', 'https://example.com/fallback.mp4');
      expect(result).toBe(true);
    });

    it('should return false when HLS state is error but no fallbackSrc', () => {
      const result = shouldUseMp4Fallback('error', undefined);
      expect(result).toBe(false);
    });

    it('should return false when HLS state is error but fallbackSrc is empty string', () => {
      const result = shouldUseMp4Fallback('error', '');
      expect(result).toBe(false);
    });

    it('should return false when HLS state is error but fallbackSrc is whitespace', () => {
      const result = shouldUseMp4Fallback('error', '   ');
      expect(result).toBe(false);
    });
  });

  describe('Non-Error States', () => {
    const fallbackSrc = 'https://example.com/fallback.mp4';

    it('should return false when HLS state is idle', () => {
      const result = shouldUseMp4Fallback('idle', fallbackSrc);
      expect(result).toBe(false);
    });

    it('should return false when HLS state is loading', () => {
      const result = shouldUseMp4Fallback('loading', fallbackSrc);
      expect(result).toBe(false);
    });

    it('should return false when HLS state is ready', () => {
      const result = shouldUseMp4Fallback('ready', fallbackSrc);
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid fallbackSrc types gracefully', () => {
      const result = shouldUseMp4Fallback('error', null as any);
      expect(result).toBe(false);
    });

    it('should handle numeric fallbackSrc', () => {
      const result = shouldUseMp4Fallback('error', 123 as any);
      expect(result).toBe(false);
    });

    it('should handle object fallbackSrc', () => {
      const result = shouldUseMp4Fallback('error', {} as any);
      expect(result).toBe(false);
    });
  });

  describe('All State Combinations', () => {
    const states: PlaybackState[] = ['idle', 'loading', 'ready', 'error'];
    const fallbackSrcs = [
      undefined,
      '',
      '   ',
      'https://example.com/fallback.mp4',
    ];

    states.forEach((state) => {
      fallbackSrcs.forEach((fallbackSrc) => {
        it(`should handle state=${state}, fallbackSrc="${fallbackSrc}"`, () => {
          const result = shouldUseMp4Fallback(state, fallbackSrc);
          const expected =
            state === 'error' &&
            fallbackSrc !== undefined &&
            typeof fallbackSrc === 'string' &&
            fallbackSrc.trim().length > 0;
          expect(result).toBe(expected);
        });
      });
    });
  });
});
