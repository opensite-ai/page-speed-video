import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHls } from '../hls/useHls';
import React from 'react';

// Mock hls.js module
vi.mock('hls.js', () => {
  const mockHls = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
  }));

  mockHls.isSupported = vi.fn().mockReturnValue(true);
  mockHls.Events = {
    MEDIA_ATTACHED: 'hlsMediaAttached',
    MANIFEST_PARSED: 'hlsManifestParsed',
    ERROR: 'hlsError',
  };

  return { default: mockHls };
});

describe('useHls Hook', () => {
  let videoElement: HTMLVideoElement;
  let videoRef: React.RefObject<HTMLVideoElement>;

  beforeEach(() => {
    vi.clearAllMocks();
    videoElement = document.createElement('video');
    videoRef = { current: videoElement };
  });

  describe('Initialization', () => {
    it('should start in idle state', () => {
      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: null,
          videoRef,
        })
      );

      expect(result.current.state).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('should remain idle when no masterPlaylistUrl provided', () => {
      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: null,
          videoRef,
        })
      );

      expect(result.current.state).toBe('idle');
    });

    it('should remain idle when no videoRef.current', () => {
      const emptyRef = { current: null };
      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef: emptyRef,
        })
      );

      expect(result.current.state).toBe('idle');
    });
  });

  describe('Native HLS Support (Safari/iOS)', () => {
    it('should use native HLS when canPlayType supports it', async () => {
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef,
        })
      );

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });

      expect(videoElement.src).toBe('https://example.com/master.m3u8');
    });

    it('should log debug info when using native HLS', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef,
          debug: true,
        })
      );

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Using native HLS support')
        );
      });

      consoleLogSpy.mockRestore();
    });
  });

  describe('State Callbacks', () => {
    it('should call onStateChange when state changes', async () => {
      const onStateChange = vi.fn();
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef,
          onStateChange,
        })
      );

      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith('loading');
      });

      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith('ready');
      });
    });

    it('should not call onStateChange when not provided', async () => {
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      expect(() => {
        renderHook(() =>
          useHls({
            masterPlaylistUrl: 'https://example.com/master.m3u8',
            videoRef,
          })
        );
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported HLS', async () => {
      videoElement.canPlayType = vi.fn().mockReturnValue('');

      // Mock hls.js to return not supported
      const { default: Hls } = await import('hls.js');
      (Hls.isSupported as any).mockReturnValue(false);

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef,
        })
      );

      await waitFor(() => {
        expect(result.current.state).toBe('error');
        expect(result.current.error).toContain('not supported');
      });
    });

    it('should log warning when HLS not supported in debug mode', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      videoElement.canPlayType = vi.fn().mockReturnValue('');

      const { default: Hls } = await import('hls.js');
      (Hls.isSupported as any).mockReturnValue(false);

      renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef,
          debug: true,
        })
      );

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('HLS not supported')
        );
      });

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('should not call destroy on native HLS', async () => {
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      const { unmount } = renderHook(() =>
        useHls({
          masterPlaylistUrl: 'https://example.com/master.m3u8',
          videoRef,
        })
      );

      await waitFor(() => {
        expect(videoElement.src).toBe('https://example.com/master.m3u8');
      });

      unmount();
      // No destroy call expected for native HLS
    });
  });

  describe('URL Changes', () => {
    it('should update when masterPlaylistUrl changes', async () => {
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      const { result, rerender } = renderHook(
        ({ url }) =>
          useHls({
            masterPlaylistUrl: url,
            videoRef,
          }),
        {
          initialProps: { url: 'https://example.com/master1.m3u8' },
        }
      );

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });

      rerender({ url: 'https://example.com/master2.m3u8' });

      await waitFor(() => {
        expect(videoElement.src).toBe('https://example.com/master2.m3u8');
      });
    });

    it('should return to idle when masterPlaylistUrl becomes null', async () => {
      videoElement.canPlayType = vi.fn().mockReturnValue('probably');

      const { result, rerender } = renderHook(
        ({ url }) =>
          useHls({
            masterPlaylistUrl: url,
            videoRef,
          }),
        {
          initialProps: { url: 'https://example.com/master.m3u8' as string | null },
        }
      );

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });

      rerender({ url: null });

      await waitFor(() => {
        expect(result.current.state).toBe('idle');
      });
    });
  });
});
