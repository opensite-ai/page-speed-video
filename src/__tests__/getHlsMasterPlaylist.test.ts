import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHlsMasterPlaylist } from '../transform/getHlsMasterPlaylist';

describe('getHlsMasterPlaylist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Provided Master Playlist URL', () => {
    it('should return provided masterPlaylistUrl without API call', async () => {
      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
        masterPlaylistUrl: 'https://cdn.example.com/master.m3u8',
      });

      expect(result.masterPlaylistUrl).toBe('https://cdn.example.com/master.m3u8');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should log when debug is enabled', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
        masterPlaylistUrl: 'https://cdn.example.com/master.m3u8',
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using provided masterPlaylistUrl'),
        'https://cdn.example.com/master.m3u8'
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('Source URL Validation', () => {
    it('should return error when src is empty', async () => {
      const result = await getHlsMasterPlaylist({
        src: '',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Source URL is required');
    });

    it('should return error when src is only whitespace', async () => {
      const result = await getHlsMasterPlaylist({
        src: '   ',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Source URL is required');
    });

    it('should return error when src is not a string', async () => {
      const result = await getHlsMasterPlaylist({
        src: undefined as any,
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Source URL is required');
    });
  });

  describe('Transform API Success', () => {
    it('should fetch master playlist URL from transform API', async () => {
      const mockResponse = {
        master_playlist_url: 'https://cdn.example.com/master.m3u8',
        video_id: 'video-123',
        resolutions: ['720p', '1080p'],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/video/transform')
      );
      expect(result.masterPlaylistUrl).toBe('https://cdn.example.com/master.m3u8');
      expect(result.videoId).toBe('video-123');
      expect(result.resolutions).toEqual(['720p', '1080p']);
      expect(result.error).toBeUndefined();
    });

    it('should use custom transformBaseUrl', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ master_playlist_url: 'https://cdn.example.com/master.m3u8' }),
      });

      await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
        transformBaseUrl: 'https://custom.api.com',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.api.com/api/v1/video/transform')
      );
    });

    it('should URL-encode the src parameter', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ master_playlist_url: 'https://cdn.example.com/master.m3u8' }),
      });

      await getHlsMasterPlaylist({
        src: 'https://example.com/video with spaces.mp4',
      });

      const call = (global.fetch as any).mock.calls[0][0];
      // URL class automatically encodes spaces
      expect(call).toMatch(/video.*spaces\.mp4/);
    });

    it('should log debug information when debug is true', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          master_playlist_url: 'https://cdn.example.com/master.m3u8',
          video_id: 'video-123',
        }),
      });

      await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fetching transform'),
        expect.any(String)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transform success'),
        expect.any(Object)
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Transform API Errors', () => {
    it('should handle HTTP error status', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Transform API returned 404');
      expect(result.error).toContain('Not Found');
    });

    it('should handle error response with error flag', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: true,
          message: 'Video processing failed',
        }),
      });

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toBe('Video processing failed');
    });

    it('should handle error response without message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: true,
        }),
      });

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toBe('Transform API returned error');
    });

    it('should handle missing master_playlist_url in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          video_id: 'video-123',
        }),
      });

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('missing master_playlist_url');
    });

    it('should handle fetch network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Transform API request failed');
      expect(result.error).toContain('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      (global.fetch as any).mockRejectedValueOnce('String error');

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Transform API request failed');
      expect(result.error).toContain('String error');
    });

    it('should handle JSON parse error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await getHlsMasterPlaylist({
        src: 'https://example.com/video.mp4',
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain('Invalid JSON');
    });
  });
});
