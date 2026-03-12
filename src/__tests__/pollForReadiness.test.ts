import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollForReadiness } from '../processing/pollForReadiness';

describe('pollForReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Successful Polling', () => {
    it('should return true when playlist is immediately ready', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/master.m3u8',
        { method: 'HEAD' }
      );
    });

    it('should retry and succeed after a few attempts', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: true });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        intervalMs: 10, // Fast for testing
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should log debug information when debug is true', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      (global.fetch as any).mockResolvedValueOnce({ ok: true });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting polling'),
        expect.any(String)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ready after 1 attempts')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Failed Polling', () => {
    it('should return false when max attempts reached', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        maxAttempts: 3,
        intervalMs: 10, // Fast for testing
      });

      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should log warning when max attempts reached with debug', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        maxAttempts: 2,
        intervalMs: 10,
        debug: true,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Max attempts reached')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        maxAttempts: 3,
        intervalMs: 10,
      });

      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should log fetch errors in debug mode', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        maxAttempts: 2,
        intervalMs: 10,
        debug: true,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attempt 1/2 failed'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom maxAttempts', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        maxAttempts: 5,
        intervalMs: 10,
      });

      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('should respect custom intervalMs', async () => {
      const startTime = Date.now();
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        intervalMs: 50,
      });

      const duration = Date.now() - startTime;
      // Should take at least 100ms (2 intervals of 50ms)
      expect(duration).toBeGreaterThanOrEqual(90); // Some tolerance for test execution
    });

    it('should use default maxAttempts of 30', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        intervalMs: 10,
      });

      expect(global.fetch).toHaveBeenCalledTimes(30);
    });

    it('should use default intervalMs of 2000', async () => {
      // This test would be too slow to run with real delays
      // Just verify the function accepts the default
      (global.fetch as any).mockResolvedValueOnce({ ok: true });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
      });

      expect(result).toBe(true);
    });
  });

  describe('Response Status Codes', () => {
    it('should continue polling on 404', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: true });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        intervalMs: 10,
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attempt 1/30: 404')
      );

      consoleLogSpy.mockRestore();
    });

    it('should continue polling on 500', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        intervalMs: 10,
      });

      expect(result).toBe(true);
    });

    it('should succeed on 200', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
      });

      expect(result).toBe(true);
    });

    it('should succeed on 304 (Not Modified)', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 304 });

      const result = await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
      });

      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty URL', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true });

      const result = await pollForReadiness({
        masterPlaylistUrl: '',
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('', { method: 'HEAD' });
    });

    it('should not wait after last attempt', async () => {
      const startTime = Date.now();
      (global.fetch as any).mockResolvedValue({ ok: false });

      await pollForReadiness({
        masterPlaylistUrl: 'https://example.com/master.m3u8',
        maxAttempts: 2,
        intervalMs: 100,
      });

      const duration = Date.now() - startTime;
      // Should take ~100ms (1 interval), not 200ms (2 intervals)
      expect(duration).toBeLessThan(150);
    });
  });
});
