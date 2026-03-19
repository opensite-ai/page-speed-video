import { describe, it, expect, vi, beforeEach } from "vitest";
import { pollForReadiness } from "../processing/pollForReadiness";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock Headers object whose .get() always returns null
 * unless overrides are provided.
 */
function mockHeaders(overrides: Record<string, string> = {}): Headers {
  return {
    get: (name: string) => overrides[name.toLowerCase()] ?? null,
  } as unknown as Headers;
}

/**
 * Creates a minimal mock Response object compatible with the updated
 * pollForReadiness implementation, which now reads .status, .statusText,
 * and .headers from every response.
 */
function mockResponse(
  ok: boolean,
  status: number,
  statusText = "",
  headerOverrides: Record<string, string> = {},
): Response {
  return {
    ok,
    status,
    statusText,
    headers: mockHeaders(headerOverrides),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pollForReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Silence console output during tests by default so the rich new log
    // messages don't pollute test output. Individual tests that want to assert
    // on specific log calls restore spies selectively.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("Successful Polling", () => {
    it("should return true when playlist is immediately ready", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      // The implementation now passes Cache-Control headers — use
      // objectContaining so the assertion stays forward-compatible.
      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/master.m3u8",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("should retry and succeed after a few attempts", async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should always log a start message (regardless of debug flag)", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      // The start log is unconditional in the new implementation.
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Starting readiness polling"),
      );
    });

    it("should log the ready message when playlist becomes available", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("READY after 1 attempt"),
      );
    });

    it("should log debug information when debug is true", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        debug: true,
      });

      // Start message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Starting readiness polling"),
      );
      // Ready message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("READY after 1 attempt"),
      );
    });

    it("should include the URL in start log", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      const startCall = consoleLogSpy.mock.calls.find((args) =>
        String(args[0]).includes("Starting readiness polling"),
      );
      expect(startCall).toBeDefined();
      expect(String(startCall![0])).toContain(
        "https://example.com/master.m3u8",
      );
    });
  });

  describe("Failed Polling", () => {
    it("should return false when max attempts reached", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse(false, 404, "Not Found"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 3,
        intervalMs: 10,
      });

      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should log a timeout error (console.error) when max attempts are exhausted", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse(false, 404, "Not Found"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 2,
        intervalMs: 10,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("TIMED OUT"),
      );
    });

    it("should include last status in timeout error log", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse(false, 202, "Accepted"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 2,
        intervalMs: 10,
      });

      const timeoutCall = consoleErrorSpy.mock.calls.find((args) =>
        String(args[0]).includes("TIMED OUT"),
      );
      expect(timeoutCall).toBeDefined();
      expect(String(timeoutCall![0])).toContain("202");
    });

    it("should handle fetch errors gracefully", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 3,
        intervalMs: 10,
      });

      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should log fetch exceptions (always, not just in debug)", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 2,
        intervalMs: 10,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("fetch threw an exception"),
        expect.any(Error),
      );
    });

    it("should log CORS/network errors at error level", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      const corsError = new TypeError("Failed to fetch");
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(corsError);

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 2,
        intervalMs: 10,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("fetch threw an exception"),
        expect.any(TypeError),
      );
    });

    it("should include the attempt number in fetch error logs", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 2,
        intervalMs: 10,
      });

      const firstWarnCall = consoleWarnSpy.mock.calls.find((args) =>
        String(args[0]).includes("1/2"),
      );
      expect(firstWarnCall).toBeDefined();
    });
  });

  describe("Configuration Options", () => {
    it("should respect custom maxAttempts", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse(false, 404, "Not Found"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 5,
        intervalMs: 10,
      });

      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it("should respect custom intervalMs", async () => {
      const startTime = Date.now();
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 50,
      });

      const duration = Date.now() - startTime;
      // Should take at least 100ms (2 intervals of 50ms each)
      expect(duration).toBeGreaterThanOrEqual(90);
    });

    it("should use default maxAttempts of 30", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse(false, 404, "Not Found"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      expect(global.fetch).toHaveBeenCalledTimes(30);
    });

    it("should use default intervalMs of 2000 (fast path — resolves immediately)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(result).toBe(true);
    });

    it("should include maxAttempts and intervalMs in the start log", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 10,
        intervalMs: 500,
      });

      const startCall = consoleLogSpy.mock.calls.find((args) =>
        String(args[0]).includes("Starting readiness polling"),
      );
      expect(startCall).toBeDefined();
      const msg = String(startCall![0]);
      expect(msg).toContain("10");
      expect(msg).toContain("500ms");
    });
  });

  describe("Response Status Codes", () => {
    it("should log a not-ready message on 404 (always, not just debug)", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      const notReadyCall = consoleLogSpy.mock.calls.find(
        (args) =>
          String(args[0]).includes("not ready yet") &&
          String(args[0]).includes("1/"),
      );
      expect(notReadyCall).toBeDefined();
      expect(String(notReadyCall![0])).toContain("404");
    });

    it("should include a human-readable diagnosis in the not-ready log", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse(false, 202, "Accepted"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      const notReadyCall = consoleLogSpy.mock.calls.find(
        (args) =>
          String(args[0]).includes("not ready yet") &&
          String(args[0]).includes("202"),
      );
      expect(notReadyCall).toBeDefined();
      // The new implementation appends a "Diagnosis" line
      expect(String(notReadyCall![0])).toContain("Diagnosis");
    });

    it("should log 403 at error level and include a helpful message", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse(false, 403, "Forbidden"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      const forbiddenCall = consoleErrorSpy.mock.calls.find((args) =>
        String(args[0]).includes("403"),
      );
      expect(forbiddenCall).toBeDefined();
    });

    it("should log 5xx errors at warn level", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          mockResponse(false, 500, "Internal Server Error"),
        )
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      const serverErrorCall = consoleWarnSpy.mock.calls.find((args) =>
        String(args[0]).includes("500"),
      );
      expect(serverErrorCall).toBeDefined();
    });

    it("should continue polling on 500", async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          mockResponse(false, 500, "Internal Server Error"),
        )
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      expect(result).toBe(true);
    });

    it("should succeed on 200", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(result).toBe(true);
    });

    it("should succeed on 206 (Partial Content)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 206, "Partial Content"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(result).toBe(true);
    });

    it("should succeed on 304 (Not Modified)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 304, "Not Modified"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(result).toBe(true);
    });

    it("should log relevant response headers when present", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          mockResponse(false, 202, "Accepted", {
            "x-processing-status": "transcoding",
            "retry-after": "5",
          }),
        )
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      const headerLog = consoleLogSpy.mock.calls.find(
        (args) =>
          String(args[0]).includes("x-processing-status") ||
          String(args[0]).includes("retry-after"),
      );
      expect(headerLog).toBeDefined();
    });
  });

  describe("Deduplication of Repeated Status Logs", () => {
    it("should log every status change", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 202, "Accepted"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        intervalMs: 10,
      });

      // Both 404 and 202 should be logged since they are different statuses
      const has404 = consoleLogSpy.mock.calls.some((args) =>
        String(args[0]).includes("404"),
      );
      const has202 = consoleLogSpy.mock.calls.some((args) =>
        String(args[0]).includes("202"),
      );
      expect(has404).toBe(true);
      expect(has202).toBe(true);
    });

    it("should suppress intermediate repeated-status logs but still log them periodically", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      // 6 consecutive 404s then success — attempt 5 is a periodic log
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(false, 404, "Not Found"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 30,
        intervalMs: 10,
      });

      // At minimum, attempt 1 (first occurrence) and attempt 5 (periodic)
      // should appear in the logs
      const notReadyCalls = consoleLogSpy.mock.calls.filter((args) =>
        String(args[0]).includes("not ready yet"),
      );
      expect(notReadyCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty URL without throwing", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      const result = await pollForReadiness({
        masterPlaylistUrl: "",
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("should not wait after the last failed attempt", async () => {
      const startTime = Date.now();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse(false, 404, "Not Found"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 2,
        intervalMs: 100,
      });

      const duration = Date.now() - startTime;
      // Should take ~100ms (1 interval between attempt 1 and 2), not 200ms
      expect(duration).toBeLessThan(175);
    });

    it("should include Cache-Control no-cache header in fetch calls", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockResponse(true, 200, "OK"),
      );

      await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Cache-Control": expect.stringContaining("no-cache"),
          }),
        }),
      );
    });

    it("should mix successful and error responses across attempts", async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce(mockResponse(false, 503, "Service Unavailable"))
        .mockResolvedValueOnce(mockResponse(true, 200, "OK"));

      const result = await pollForReadiness({
        masterPlaylistUrl: "https://example.com/master.m3u8",
        maxAttempts: 5,
        intervalMs: 10,
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
