import { describe, it, expect, vi, beforeEach } from "vitest";
import { getHlsMasterPlaylist } from "../transform/getHlsMasterPlaylist";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Response for a successful (2xx) reply.
 * The new implementation calls response.text() then JSON.parse(), so the
 * mock must expose text() rather than json().
 */
function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Creates a mock Response for a non-OK HTTP reply.
 */
function mockErrorResponse(
  status: number,
  body: string,
  statusText = "",
): Response {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getHlsMasterPlaylist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Silence the rich new log output during tests so the suite stays readable.
    // Individual tests that need to assert on specific log calls re-spy below.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // Fast path: caller already has the URL
  // -------------------------------------------------------------------------

  describe("Provided Master Playlist URL", () => {
    it("should return provided masterPlaylistUrl without making an API call", async () => {
      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        masterPlaylistUrl: "https://cdn.example.com/master.m3u8",
      });

      expect(result.masterPlaylistUrl).toBe(
        "https://cdn.example.com/master.m3u8",
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should log when debug is enabled", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        masterPlaylistUrl: "https://cdn.example.com/master.m3u8",
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using provided masterPlaylistUrl"),
      );
    });

    it("should include the URL in the debug log", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        masterPlaylistUrl: "https://cdn.example.com/master.m3u8",
        debug: true,
      });

      const logCall = consoleLogSpy.mock.calls.find((args) =>
        String(args[0]).includes("Using provided masterPlaylistUrl"),
      );
      expect(logCall).toBeDefined();
      expect(String(logCall![0])).toContain(
        "https://cdn.example.com/master.m3u8",
      );
    });

    it("should warn when the provided masterPlaylistUrl is not a valid URL", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        masterPlaylistUrl: "not-a-url",
      });

      // Still returns the URL — warns but does not block playback
      expect(result.masterPlaylistUrl).toBe("not-a-url");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("masterPlaylistUrl"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Source URL validation
  // -------------------------------------------------------------------------

  describe("Source URL Validation", () => {
    it("should return error when src is empty", async () => {
      const result = await getHlsMasterPlaylist({ src: "" });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Source URL");
    });

    it("should return error when src is only whitespace", async () => {
      const result = await getHlsMasterPlaylist({ src: "   " });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Source URL");
    });

    it("should return error when src is undefined", async () => {
      const result = await getHlsMasterPlaylist({
        src: undefined as unknown as string,
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Source URL");
    });

    it("should return error when src is not a valid URL", async () => {
      const result = await getHlsMasterPlaylist({ src: "not-a-valid-url" });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toBeDefined();
    });

    it("should log an error when src is invalid", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");

      await getHlsMasterPlaylist({ src: "" });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Successful transform API calls
  // -------------------------------------------------------------------------

  describe("Transform API Success", () => {
    it("should return masterPlaylistUrl from a well-formed API response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
          video_id: "video-123",
          resolutions: ["720p", "1080p"],
        }),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/video/transform"),
      );
      expect(result.masterPlaylistUrl).toBe(
        "https://cdn.example.com/master.m3u8",
      );
      expect(result.videoId).toBe("video-123");
      expect(result.resolutions).toEqual(["720p", "1080p"]);
      expect(result.error).toBeUndefined();
    });

    it("should use the custom transformBaseUrl when provided", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
        }),
      );

      await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        transformBaseUrl: "https://custom.api.com",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://custom.api.com/api/v1/video/transform",
        ),
      );
    });

    it("should URL-encode the src query parameter", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
        }),
      );

      await getHlsMasterPlaylist({
        src: "https://example.com/video with spaces.mp4",
      });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(calledUrl).toMatch(/video.*spaces\.mp4/);
    });

    it("should call response.text() — not response.json() — to read the body", async () => {
      const textSpy = vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({
            master_playlist_url: "https://cdn.example.com/master.m3u8",
          }),
        );
      const jsonSpy = vi.fn();

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: textSpy,
        json: jsonSpy,
      });

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(textSpy).toHaveBeenCalledTimes(1);
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it("should log the transform URL when debug is true", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
          video_id: "video-123",
        }),
      );

      await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Calling transform API"),
      );
    });

    it("should log the success result when debug is true", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
          video_id: "video-123",
        }),
      );

      await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        debug: true,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Transform API call succeeded"),
      );
    });

    it("should log the raw JSON response when debug is true", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
          video_id: "video-123",
        }),
      );

      await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
        debug: true,
      });

      const rawJsonLog = consoleLogSpy.mock.calls.find((args) =>
        String(args[0]).includes("Raw JSON"),
      );
      expect(rawJsonLog).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // HTTP-level errors
  // -------------------------------------------------------------------------

  describe("Transform API HTTP Errors", () => {
    it("should return an error on HTTP 404", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockErrorResponse(404, "Not Found", "Not Found"),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Transform API returned 404");
      expect(result.error).toContain("Not Found");
    });

    it("should return an error on HTTP 500", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockErrorResponse(
          500,
          "Internal Server Error",
          "Internal Server Error",
        ),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Transform API returned 500");
    });

    it("should return an error on HTTP 401", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockErrorResponse(401, "Unauthorized", "Unauthorized"),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("401");
    });

    it("should include the response body in the error message", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockErrorResponse(
          400,
          "Bad Request: missing url parameter",
          "Bad Request",
        ),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.error).toContain("400");
    });

    it("should log a status-specific explanation on HTTP errors", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockErrorResponse(404, "Not Found", "Not Found"),
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("non-OK status"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Network / fetch-level errors
  // -------------------------------------------------------------------------

  describe("Network Errors", () => {
    it("should return an error on fetch network failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Transform API request failed");
      expect(result.error).toContain("Network error");
    });

    it("should return an error when fetch rejects with a non-Error value", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        "String error",
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("Transform API request failed");
      expect(result.error).toContain("String error");
    });

    it("should log CORS-like errors at console.error level", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      const corsError = new TypeError("Failed to fetch");

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        corsError,
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("fetch threw an exception"),
        expect.any(TypeError),
      );
    });

    it("should include the error object as the second argument to console.error on fetch failure", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      const networkError = new Error("Network error");

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        networkError,
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        networkError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // JSON parsing
  // -------------------------------------------------------------------------

  describe("Response Body Parsing", () => {
    it("should return an error when the response body is not valid JSON", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "this is not valid json {{{",
      });

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("not valid JSON");
    });

    it("should return an error when the response body is a JSON string (not object)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => '"just a string"',
      });

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("not a JSON object");
    });

    it("should return an error when the response body is JSON null", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "null",
      });

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Payload audit — errors (return null + message)
  // -------------------------------------------------------------------------

  describe("Payload Audit — Errors", () => {
    it("should return an error when master_playlist_url is absent", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({ video_id: "video-123" }),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toContain("master_playlist_url");
    });

    it("should return an error when the response has error: true with a message", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({ error: true, message: "Video processing failed" }),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toBeDefined();
      // The audit error message surfaces the error: true flag
      expect(result.error).toContain("error: true");
    });

    it("should return an error when the response has error: true without a message", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({ error: true }),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBeNull();
      expect(result.error).toBeDefined();
    });

    it("should log payload errors at console.error level", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({ error: true }),
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("payload errors"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Payload audit — warnings (non-blocking)
  // -------------------------------------------------------------------------

  describe("Payload Audit — Warnings", () => {
    it("should warn when video_id is missing", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
        }),
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("video_id"),
      );
    });

    it("should warn when resolutions array is empty", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
          video_id: "video-123",
          resolutions: [],
        }),
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("resolutions"),
      );
    });

    it("should warn when a resolution entry is missing expected fields", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
          video_id: "video-123",
          // Missing height, width, bitrate, playlist_url
          resolutions: [{ name: "720p" }],
        }),
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("missing expected fields"),
      );
    });

    it("should still return the masterPlaylistUrl even when warnings are present", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        // No video_id triggers a warning but not an error
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
        }),
      );

      const result = await getHlsMasterPlaylist({
        src: "https://example.com/video.mp4",
      });

      expect(result.masterPlaylistUrl).toBe(
        "https://cdn.example.com/master.m3u8",
      );
      expect(result.error).toBeUndefined();
    });

    it("should log a payload warnings message at console.warn level", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn");

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockOkResponse({
          master_playlist_url: "https://cdn.example.com/master.m3u8",
        }),
      );

      await getHlsMasterPlaylist({ src: "https://example.com/video.mp4" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("payload warnings"),
      );
    });
  });
});
