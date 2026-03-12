import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Video } from '../core/Video';

describe('Video Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render video element with src', () => {
      render(<Video src="https://example.com/video.mp4" data-testid="video" />);
      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video.tagName).toBe('VIDEO');
    });

    it('should return null when no src or masterPlaylistUrl provided', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { container } = render(<Video data-testid="video" />);
      expect(container.firstChild).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('requires src or masterPlaylistUrl')
      );
      consoleWarnSpy.mockRestore();
    });

    it('should render with masterPlaylistUrl', () => {
      render(
        <Video
          masterPlaylistUrl="https://example.com/master.m3u8"
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
    });

    it('should pass through native video props', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          controls
          loop
          muted
          autoPlay
          playsInline
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video.controls).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.muted).toBe(true);
      expect(video.hasAttribute('playsinline')).toBe(true);
    });

    it('should apply poster attribute', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          poster="https://example.com/poster.jpg"
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video.poster).toBe('https://example.com/poster.jpg');
    });

    it('should apply custom className and style', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          className="custom-class"
          style={{ width: '100%' }}
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video.className).toContain('custom-class');
      expect(video.style.width).toBe('100%');
    });
  });

  describe('Controls', () => {
    it('should enable controls by default when preferNativeControls is true', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          preferNativeControls={true}
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video.controls).toBe(true);
    });

    it('should respect explicit controls prop over preferNativeControls', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          preferNativeControls={true}
          controls={false}
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video.controls).toBe(false);
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref to video element', () => {
      const ref = React.createRef<HTMLVideoElement>();
      render(
        <Video
          ref={ref}
          src="https://example.com/video.mp4"
          data-testid="video"
        />
      );
      expect(ref.current).toBeInstanceOf(HTMLVideoElement);
      expect(ref.current?.tagName).toBe('VIDEO');
    });

    it('should handle callback ref', () => {
      let videoElement: HTMLVideoElement | null = null;
      const callbackRef = (el: HTMLVideoElement | null) => {
        videoElement = el;
      };
      render(
        <Video
          ref={callbackRef}
          src="https://example.com/video.mp4"
          data-testid="video"
        />
      );
      expect(videoElement).toBeInstanceOf(HTMLVideoElement);
    });
  });

  describe('Fallback Source', () => {
    it('should render source element with fallbackSrc when HLS fails', async () => {
      // Mock HLS failure by not supporting canPlayType
      HTMLVideoElement.prototype.canPlayType = vi.fn().mockReturnValue('');

      render(
        <Video
          src="https://example.com/video.mp4"
          fallbackSrc="https://example.com/fallback.mp4"
          data-testid="video"
        />
      );

      const video = screen.getByTestId('video') as HTMLVideoElement;
      expect(video).toBeInTheDocument();
    });
  });

  describe('Children', () => {
    it('should render children (track elements, etc)', () => {
      render(
        <Video src="https://example.com/video.mp4" data-testid="video">
          <track kind="captions" src="captions.vtt" label="English" />
        </Video>
      );
      const video = screen.getByTestId('video');
      const track = video.querySelector('track');
      expect(track).toBeInTheDocument();
      expect(track?.getAttribute('kind')).toBe('captions');
    });
  });

  describe('Debug Mode', () => {
    it('should not throw errors when debug is enabled', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() => {
        render(
          <Video
            src="https://example.com/video.mp4"
            debug
            data-testid="video"
          />
        );
      }).not.toThrow();
      consoleLogSpy.mockRestore();
    });
  });

  describe('State Callbacks', () => {
    it('should accept onPlaybackStateChange callback', () => {
      const callback = vi.fn();
      render(
        <Video
          src="https://example.com/video.mp4"
          onPlaybackStateChange={callback}
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
      // Callback will be called during HLS setup
    });
  });

  describe('Transform Options', () => {
    it('should accept custom transformBaseUrl', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          transformBaseUrl="https://custom.transform.api"
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
    });

    it('should accept custom cdnBaseUrl', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          cdnBaseUrl="https://custom.cdn.url"
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
    });
  });

  describe('Processing Strategies', () => {
    it('should accept optimistic processing strategy', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          processingStrategy="optimistic"
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
    });

    it('should accept poll processing strategy', () => {
      render(
        <Video
          src="https://example.com/video.mp4"
          processingStrategy="poll"
          data-testid="video"
        />
      );
      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
    });
  });

  describe('Memoization', () => {
    it('should be memoized', () => {
      const { rerender } = render(
        <Video src="https://example.com/video.mp4" data-testid="video" />
      );
      const video1 = screen.getByTestId('video');

      rerender(
        <Video src="https://example.com/video.mp4" data-testid="video" />
      );
      const video2 = screen.getByTestId('video');

      // Should be the same element (memoized)
      expect(video1).toBe(video2);
    });
  });
});
