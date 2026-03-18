import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOptimizedPosterUrl } from '../poster/getOptimizedPosterUrl';

describe('getOptimizedPosterUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should return the original URL without API key', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({ url });

      expect(result).toBe(url);
    });

    it('should return original URL when API key is undefined', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({
        url,
        apiKey: undefined,
      });

      expect(result).toBe(url);
    });

    it('should generate OptixFlow URL with API key', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({
        url,
        apiKey: 'test-api-key',
      });

      expect(result).toContain('https://octane.cdn.ing/api/v1/images/transform?');
      expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fposter.jpg');
      expect(result).toContain('apiKey=test-api-key');
      expect(result).toContain('w=1280'); // default width
      expect(result).toContain('h=720');  // default height
      expect(result).toContain('q=75');   // default quality
      expect(result).toContain('f=jpeg'); // default format
      expect(result).toContain('fit=cover'); // default fit
    });

    it('should use custom dimensions', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({
        url,
        apiKey: 'test-api-key',
        width: 1920,
        height: 1080,
      });

      expect(result).toContain('w=1920');
      expect(result).toContain('h=1080');
    });

    it('should use custom quality', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({
        url,
        apiKey: 'test-api-key',
        quality: 90,
      });

      expect(result).toContain('q=90');
    });

    it('should use custom format', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({
        url,
        apiKey: 'test-api-key',
        format: 'webp',
      });

      expect(result).toContain('f=webp');
    });

    it('should use custom objectFit', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({
        url,
        apiKey: 'test-api-key',
        objectFit: 'contain',
      });

      expect(result).toContain('fit=contain');
    });
  });

  describe('Debug Logging', () => {
    it('should log when API key is provided with debug enabled', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      getOptimizedPosterUrl({
        url: 'https://example.com/poster.jpg',
        apiKey: 'test-api-key',
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[getOptimizedPosterUrl] Generated OptixFlow URL:',
        expect.objectContaining({
          original: 'https://example.com/poster.jpg',
          optimized: expect.stringContaining('octane.cdn.ing'),
          dimensions: '1280x720',
          format: 'jpeg',
          quality: 75,
          objectFit: 'cover',
        })
      );

      consoleLogSpy.mockRestore();
    });

    it('should log when no API key is provided with debug enabled', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      getOptimizedPosterUrl({
        url: 'https://example.com/poster.jpg',
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[getOptimizedPosterUrl] No API key provided, using original URL'
      );

      consoleLogSpy.mockRestore();
    });

    it('should not log when debug is disabled', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      getOptimizedPosterUrl({
        url: 'https://example.com/poster.jpg',
        apiKey: 'test-api-key',
        debug: false,
      });

      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('URL Formats', () => {
    it('should handle absolute URLs without API key', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({ url });
      expect(result).toBe(url);
    });

    it('should optimize absolute URLs with API key', () => {
      const url = 'https://example.com/poster.jpg';
      const result = getOptimizedPosterUrl({ url, apiKey: 'test-key' });
      expect(result).toContain('octane.cdn.ing');
    });

    it('should encode URLs with query parameters', () => {
      const url = 'https://example.com/poster.jpg?version=1&quality=high';
      const result = getOptimizedPosterUrl({ url, apiKey: 'test-key' });
      expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fposter.jpg%3Fversion%3D1%26quality%3Dhigh');
    });

    it('should handle data URLs without optimization', () => {
      const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = getOptimizedPosterUrl({ url, apiKey: 'test-key' });
      expect(result).toBe(url);
    });

    it('should handle blob URLs without optimization', () => {
      const url = 'blob:https://example.com/12345';
      const result = getOptimizedPosterUrl({ url, apiKey: 'test-key' });
      expect(result).toBe(url);
    });

    it('should optimize relative URLs with API key', () => {
      const url = '/images/poster.jpg';
      const result = getOptimizedPosterUrl({ url, apiKey: 'test-key' });
      expect(result).toContain('octane.cdn.ing');
      expect(result).toContain('url=%2Fimages%2Fposter.jpg');
    });

    it('should handle empty string without API key', () => {
      const url = '';
      const result = getOptimizedPosterUrl({ url });
      expect(result).toBe(url);
    });
  });

  describe('OptixFlow Integration', () => {
    it('should generate complete OptixFlow URL with all parameters', () => {
      const url = 'https://example.com/poster.jpg';
      const apiKey = 'test-api-key';

      const result = getOptimizedPosterUrl({
        url,
        apiKey,
        width: 1920,
        height: 1080,
        quality: 85,
        format: 'webp',
        objectFit: 'contain',
      });

      expect(result).toContain('https://octane.cdn.ing/api/v1/images/transform?');
      expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fposter.jpg');
      expect(result).toContain('w=1920');
      expect(result).toContain('h=1080');
      expect(result).toContain('q=85');
      expect(result).toContain('f=webp');
      expect(result).toContain('fit=contain');
      expect(result).toContain('apiKey=test-api-key');
    });

    it('should support all image formats', () => {
      const formats: Array<'avif' | 'webp' | 'jpeg' | 'png'> = ['avif', 'webp', 'jpeg', 'png'];

      formats.forEach(format => {
        const result = getOptimizedPosterUrl({
          url: 'https://example.com/poster.jpg',
          apiKey: 'test-key',
          format,
        });

        expect(result).toContain(`f=${format}`);
      });
    });

    it('should support all objectFit modes', () => {
      const modes: Array<'cover' | 'contain' | 'fill'> = ['cover', 'contain', 'fill'];

      modes.forEach(objectFit => {
        const result = getOptimizedPosterUrl({
          url: 'https://example.com/poster.jpg',
          apiKey: 'test-key',
          objectFit,
        });

        expect(result).toContain(`fit=${objectFit}`);
      });
    });
  });
});
