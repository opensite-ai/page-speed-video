import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHls } from "../hls/useHls";

// ---------------------------------------------------------------------------
// hls.js mock
// ---------------------------------------------------------------------------

vi.mock("hls.js", () => {
  const mockHls = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
  }));

  mockHls.isSupported = vi.fn().mockReturnValue(true);
  mockHls.version = "1.0.0-test";
  mockHls.Events = {
    MEDIA_ATTACHED: "hlsMediaAttached",
    MANIFEST_PARSED: "hlsManifestParsed",
    LEVEL_LOADED: "hlsLevelLoaded",
    FRAG_LOADED: "hlsFragLoaded",
    LEVEL_SWITCHED: "hlsLevelSwitched",
    ERROR: "hlsError",
  };

  return { default: mockHls };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock Response suitable for the pre-flight probe that
 * useHls performs before initialising hls.js. The probe reads:
 *   - response.ok / response.status / response.statusText
 *   - response.headers.get("content-type")
 *   - response.text()
 */
function mockProbeResponse(
  opts: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    contentType?: string;
    body?: string;
  } = {},
): Response {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    contentType = "application/x-mpegURL",
    body = "#EXTM3U\n#EXT-X-VERSION:3\n",
  } = opts;

  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return contentType;
        return null;
      },
    },
    text: async () => body,
  } as unknown as Response;
}

/** Convenience: a probe response that represents a healthy M3U8 playlist. */
const successfulProbe = () => mockProbeResponse();

/** Convenience: a probe response simulating a 404 (video not ready / missing). */
const notFoundProbe = () =>
  mockProbeResponse({
    ok: false,
    status: 404,
    statusText: "Not Found",
    body: "Not Found",
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useHls Hook", () => {
  let videoElement: HTMLVideoElement;
  let videoRef: React.RefObject<HTMLVideoElement>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up a real-ish video element for each test.
    videoElement = document.createElement("video");
    videoRef = { current: videoElement };

    // Silence the rich new log output so test output stays clean.
    // Individual tests that need to assert on specific messages restore or
    // re-spy selectively.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // Initialisation — no URL or no ref
  // -------------------------------------------------------------------------

  describe("Initialization", () => {
    it("should start in idle state when no masterPlaylistUrl is provided", () => {
      const { result } = renderHook(() =>
        useHls({ masterPlaylistUrl: null, videoRef }),
      );

      expect(result.current.state).toBe("idle");
      expect(result.current.error).toBeNull();
    });

    it("should remain idle when masterPlaylistUrl is null", () => {
      const { result } = renderHook(() =>
        useHls({ masterPlaylistUrl: null, videoRef }),
      );

      expect(result.current.state).toBe("idle");
    });

    it("should remain idle when videoRef.current is null", () => {
      const emptyRef = { current: null };

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef: emptyRef as React.RefObject<HTMLVideoElement>,
        }),
      );

      expect(result.current.state).toBe("idle");
    });

    it("should not call fetch when masterPlaylistUrl is null", () => {
      global.fetch = vi.fn();

      renderHook(() => useHls({ masterPlaylistUrl: null, videoRef }));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should not call fetch when videoRef.current is null", () => {
      global.fetch = vi.fn();
      const emptyRef = { current: null };

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef: emptyRef as React.RefObject<HTMLVideoElement>,
        }),
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Pre-flight probe
  // -------------------------------------------------------------------------

  describe("Pre-flight Manifest Probe", () => {
    it("should perform a GET fetch to the masterPlaylistUrl before HLS init", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://example.com/master.m3u8",
          expect.objectContaining({ method: "GET" }),
        );
      });
    });

    it("should enter error state when the probe returns a non-OK status", async () => {
      global.fetch = vi.fn().mockResolvedValue(notFoundProbe());

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("error");
      });
    });

    it("should surface the HTTP status in the error message when probe fails", async () => {
      global.fetch = vi.fn().mockResolvedValue(notFoundProbe());

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.error).toContain("404");
      });
    });

    it("should log a console.error when the probe fails", async () => {
      global.fetch = vi.fn().mockResolvedValue(notFoundProbe());
      const consoleErrorSpy = vi.spyOn(console, "error");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("pre-flight check FAILED"),
        );
      });
    });

    it("should log a warning when probe succeeds but body is not M3U8", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        mockProbeResponse({
          ok: true,
          status: 200,
          contentType: "text/html",
          body: "<html>Not a playlist</html>",
        }),
      );
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");
      const consoleWarnSpy = vi.spyOn(console, "warn");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining("does not look like valid HLS"),
        );
      });
    });

    it("should log a passing message when probe succeeds with valid M3U8 content", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");
      const consoleLogSpy = vi.spyOn(console, "log");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("pre-flight check passed"),
        );
      });
    });

    it("should enter error state when the probe fetch throws a network error", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch"));

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("error");
      });
    });

    it("should include the URL in the probe start log", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");
      const consoleLogSpy = vi.spyOn(console, "log");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        const probeLog = consoleLogSpy.mock.calls.find((args) =>
          String(args[0]).includes("Probing master playlist URL"),
        );
        expect(probeLog).toBeDefined();
        expect(String(probeLog![0])).toContain(
          "https://example.com/master.m3u8",
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Native HLS support (Safari / iOS)
  // -------------------------------------------------------------------------

  describe("Native HLS Support (Safari/iOS)", () => {
    it("should set video.src directly when canPlayType supports HLS", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("ready");
      });

      expect(videoElement.src).toBe("https://example.com/master.m3u8");
    });

    it("should transition to ready state on the native HLS path", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("ready");
      });
    });

    it("should log the native HLS path message", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");
      const consoleLogSpy = vi.spyOn(console, "log");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
          debug: true,
        }),
      );

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("native HLS support"),
        );
      });
    });

    it("should not import hls.js when native HLS is available", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { default: Hls } = await import("hls.js");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() =>
        expect(videoElement.src).toBe("https://example.com/master.m3u8"),
      );

      // The hls.js constructor should not have been invoked for native path.
      expect(Hls).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // State callbacks
  // -------------------------------------------------------------------------

  describe("State Callbacks", () => {
    it("should call onStateChange with 'loading' then 'ready'", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");
      const onStateChange = vi.fn();

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
          onStateChange,
        }),
      );

      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith("loading");
      });

      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith("ready");
      });
    });

    it("should call onStateChange with 'error' when probe fails", async () => {
      global.fetch = vi.fn().mockResolvedValue(notFoundProbe());
      const onStateChange = vi.fn();

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
          onStateChange,
        }),
      );

      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith("error");
      });
    });

    it("should not throw when onStateChange is not provided", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      expect(() => {
        renderHook(() =>
          useHls({
            masterPlaylistUrl: "https://example.com/master.m3u8",
            videoRef,
          }),
        );
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("Error Handling", () => {
    it("should enter error state when HLS is not supported (no MSE, no native)", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("");

      const { default: Hls } = await import("hls.js");
      (Hls.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("error");
        expect(result.current.error).toContain("not supported");
      });
    });

    it("should log an error when HLS is not supported", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("");

      const { default: Hls } = await import("hls.js");
      (Hls.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const consoleErrorSpy = vi.spyOn(console, "error");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
          debug: true,
        }),
      );

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("HLS is not supported"),
        );
      });
    });

    it("should set a meaningful error message when HLS is not supported", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("");

      const { default: Hls } = await import("hls.js");
      (Hls.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
        expect(typeof result.current.error).toBe("string");
      });
    });

    it("should return error state and non-null error when probe returns 403", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        mockProbeResponse({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          body: "Forbidden",
        }),
      );

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("error");
        expect(result.current.error).not.toBeNull();
      });
    });

    it("should surface 202 (still processing) as an error with explanation", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        mockProbeResponse({
          ok: false,
          status: 202,
          statusText: "Accepted",
          body: "",
        }),
      );

      const { result } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() => {
        expect(result.current.state).toBe("error");
        expect(result.current.error).toContain("202");
      });
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe("Cleanup", () => {
    it("should not crash on unmount when using native HLS path", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { unmount } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      await waitFor(() =>
        expect(videoElement.src).toBe("https://example.com/master.m3u8"),
      );

      expect(() => unmount()).not.toThrow();
    });

    it("should call hls.destroy on unmount when using hls.js path", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      // canPlayType returns '' → falls through to hls.js
      videoElement.canPlayType = vi.fn().mockReturnValue("");

      const { default: Hls } = await import("hls.js");
      (Hls.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const mockDestroy = vi.fn();
      (Hls as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        on: vi.fn(),
        loadSource: vi.fn(),
        attachMedia: vi.fn(),
        destroy: mockDestroy,
      }));

      const { unmount } = renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
        }),
      );

      // Give the async setup time to run
      await waitFor(() => expect(Hls).toHaveBeenCalled());

      unmount();

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // URL changes / re-renders
  // -------------------------------------------------------------------------

  describe("URL Changes", () => {
    it("should update video.src when masterPlaylistUrl changes", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { result, rerender } = renderHook(
        ({ url }: { url: string | null }) =>
          useHls({ masterPlaylistUrl: url, videoRef }),
        {
          initialProps: {
            url: "https://example.com/master1.m3u8" as string | null,
          },
        },
      );

      await waitFor(() => {
        expect(result.current.state).toBe("ready");
      });

      rerender({ url: "https://example.com/master2.m3u8" });

      await waitFor(() => {
        expect(videoElement.src).toBe("https://example.com/master2.m3u8");
      });
    });

    it("should return to idle state when masterPlaylistUrl becomes null", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { result, rerender } = renderHook(
        ({ url }: { url: string | null }) =>
          useHls({ masterPlaylistUrl: url, videoRef }),
        {
          initialProps: {
            url: "https://example.com/master.m3u8" as string | null,
          },
        },
      );

      await waitFor(() => {
        expect(result.current.state).toBe("ready");
      });

      rerender({ url: null });

      await waitFor(() => {
        expect(result.current.state).toBe("idle");
      });
    });

    it("should probe the new URL when masterPlaylistUrl changes", async () => {
      // Each call returns a valid probe response
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("probably");

      const { rerender } = renderHook(
        ({ url }: { url: string | null }) =>
          useHls({ masterPlaylistUrl: url, videoRef }),
        {
          initialProps: {
            url: "https://example.com/v1/master.m3u8" as string | null,
          },
        },
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://example.com/v1/master.m3u8",
          expect.anything(),
        );
      });

      rerender({ url: "https://example.com/v2/master.m3u8" });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://example.com/v2/master.m3u8",
          expect.anything(),
        );
      });
    });

    it("should clear the error when the URL is reset to null after a failed probe", async () => {
      global.fetch = vi.fn().mockResolvedValue(notFoundProbe());

      const { result, rerender } = renderHook(
        ({ url }: { url: string | null }) =>
          useHls({ masterPlaylistUrl: url, videoRef }),
        {
          initialProps: {
            url: "https://example.com/broken.m3u8" as string | null,
          },
        },
      );

      await waitFor(() => {
        expect(result.current.state).toBe("error");
      });

      rerender({ url: null });

      await waitFor(() => {
        expect(result.current.state).toBe("idle");
        expect(result.current.error).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Debug mode
  // -------------------------------------------------------------------------

  describe("Debug Mode", () => {
    it("should log the hls.js version when debug is true (MSE path)", async () => {
      global.fetch = vi.fn().mockResolvedValue(successfulProbe());
      videoElement.canPlayType = vi.fn().mockReturnValue("");

      const { default: Hls } = await import("hls.js");
      (Hls.isSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const consoleLogSpy = vi.spyOn(console, "log");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
          debug: true,
        }),
      );

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("hls.js"),
        );
      });
    });

    it("should not suppress logs when debug is false (errors are always shown)", async () => {
      global.fetch = vi.fn().mockResolvedValue(notFoundProbe());
      const consoleErrorSpy = vi.spyOn(console, "error");

      renderHook(() =>
        useHls({
          masterPlaylistUrl: "https://example.com/master.m3u8",
          videoRef,
          debug: false, // explicitly off
        }),
      );

      await waitFor(() => {
        // Fatal errors must be logged regardless of debug flag
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });
});
