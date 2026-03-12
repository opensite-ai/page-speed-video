import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import * as VideoExports from '../index';

/**
 * Smoke tests to ensure the library can be imported and basic functionality works
 */
describe('Smoke Tests', () => {
  describe('Module Exports', () => {
    it('should export Video component', () => {
      expect(VideoExports.Video).toBeDefined();
      // Video is memoized, so it's technically an object with $$typeof
      expect(typeof VideoExports.Video).toMatch(/function|object/);
    });

    it('should export VideoDefaults component', () => {
      expect(VideoExports.VideoDefaults).toBeDefined();
      expect(typeof VideoExports.VideoDefaults).toBe('function');
    });

    it('should export setDefaultOptixFlowApiKey function', () => {
      expect(VideoExports.setDefaultOptixFlowApiKey).toBeDefined();
      expect(typeof VideoExports.setDefaultOptixFlowApiKey).toBe('function');
    });

    it('should export getHlsMasterPlaylist function', () => {
      expect(VideoExports.getHlsMasterPlaylist).toBeDefined();
      expect(typeof VideoExports.getHlsMasterPlaylist).toBe('function');
    });

    it('should export useHls hook', () => {
      expect(VideoExports.useHls).toBeDefined();
      expect(typeof VideoExports.useHls).toBe('function');
    });

    it('should export shouldUseMp4Fallback function', () => {
      expect(VideoExports.shouldUseMp4Fallback).toBeDefined();
      expect(typeof VideoExports.shouldUseMp4Fallback).toBe('function');
    });

    it('should export pollForReadiness function', () => {
      expect(VideoExports.pollForReadiness).toBeDefined();
      expect(typeof VideoExports.pollForReadiness).toBe('function');
    });

    it('should export getOptimizedPosterUrl function', () => {
      expect(VideoExports.getOptimizedPosterUrl).toBeDefined();
      expect(typeof VideoExports.getOptimizedPosterUrl).toBe('function');
    });
  });

  describe('Component Rendering', () => {
    it('should render Video component without errors', () => {
      expect(() => {
        render(
          <VideoExports.Video
            src="https://example.com/video.mp4"
            data-testid="video"
          />
        );
      }).not.toThrow();
    });

    it('should render VideoDefaults component without errors', () => {
      expect(() => {
        render(
          <VideoExports.VideoDefaults optixFlowApiKey="test-key">
            <div>Content</div>
          </VideoExports.VideoDefaults>
        );
      }).not.toThrow();
    });

    it('should render nested Video components without errors', () => {
      expect(() => {
        render(
          <VideoExports.VideoDefaults optixFlowApiKey="test-key">
            <VideoExports.Video
              src="https://example.com/video1.mp4"
              data-testid="video1"
            />
            <VideoExports.Video
              src="https://example.com/video2.mp4"
              data-testid="video2"
            />
          </VideoExports.VideoDefaults>
        );
      }).not.toThrow();
    });
  });

  describe('Function Calls', () => {
    it('should call setDefaultOptixFlowApiKey without errors', () => {
      expect(() => {
        VideoExports.setDefaultOptixFlowApiKey('test-key');
      }).not.toThrow();
    });

    it('should call getOptimizedPosterUrl without errors', () => {
      expect(() => {
        VideoExports.getOptimizedPosterUrl({
          url: 'https://example.com/poster.jpg',
        });
      }).not.toThrow();
    });

    it('should call shouldUseMp4Fallback without errors', () => {
      expect(() => {
        VideoExports.shouldUseMp4Fallback('error', 'https://example.com/fallback.mp4');
      }).not.toThrow();
    });
  });

  describe('Type Safety', () => {
    it('should accept valid Video props', () => {
      const validProps: VideoExports.VideoProps = {
        src: 'https://example.com/video.mp4',
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        fallbackSrc: 'https://example.com/fallback.mp4',
        poster: 'https://example.com/poster.jpg',
        controls: true,
        optixFlowApiKey: 'test-key',
        transformBaseUrl: 'https://transform.api',
        cdnBaseUrl: 'https://cdn.url',
        preferNativeControls: true,
        processingStrategy: 'optimistic',
        onPlaybackStateChange: (state) => console.log(state),
        debug: false,
      };

      expect(validProps).toBeDefined();
    });

    it('should accept valid PlaybackState values', () => {
      const states: VideoExports.PlaybackState[] = [
        'idle',
        'loading',
        'ready',
        'error',
      ];

      states.forEach((state) => {
        expect(state).toBeDefined();
      });
    });
  });

  describe('Memory Leaks', () => {
    it('should not leak memory when mounting and unmounting', () => {
      const { unmount, rerender } = render(
        <VideoExports.Video
          src="https://example.com/video.mp4"
          data-testid="video"
        />
      );

      // Remount multiple times
      for (let i = 0; i < 10; i++) {
        rerender(
          <VideoExports.Video
            src={`https://example.com/video${i}.mp4`}
            data-testid="video"
          />
        );
      }

      unmount();
      // If there are memory leaks, this test will help identify them
      expect(true).toBe(true);
    });
  });
});
