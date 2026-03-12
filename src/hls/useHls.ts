import { useEffect, useState, useCallback } from "react";
import type { UseHlsOptions, UseHlsResult, PlaybackState } from "../types.js";

// Dynamic import type for hls.js
type HlsType = typeof import("hls.js").default;
type HlsInstance = InstanceType<HlsType>;

/**
 * Hook for attaching HLS playback to a video element.
 * Features:
 * - Native HLS for Safari/iOS
 * - hls.js for Chrome/Firefox/Edge
 * - Automatic fallback detection
 * - Cleanup on unmount
 */
export function useHls(options: UseHlsOptions): UseHlsResult {
  const { masterPlaylistUrl, videoRef, onStateChange, debug } = options;
  const [state, setState] = useState<PlaybackState>("idle");
  const [error, setError] = useState<string | null>(null);

  const updateState = useCallback(
    (newState: PlaybackState, errorMsg?: string) => {
      setState(newState);
      if (errorMsg) {
        setError(errorMsg);
      } else {
        setError(null);
      }
      onStateChange?.(newState);
    },
    [onStateChange],
  );

  useEffect(() => {
    if (!masterPlaylistUrl || !videoRef.current) {
      updateState("idle");
      return;
    }

    const video = videoRef.current;
    let hlsInstance: HlsInstance | null = null;
    let mounted = true;

    (async () => {
      try {
        updateState("loading");

        // Check for native HLS support (Safari/iOS)
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          if (debug) {
            console.log("[useHls] Using native HLS support");
          }
          video.src = masterPlaylistUrl;
          if (mounted) {
            updateState("ready");
          }
          return;
        }

        // Dynamic import hls.js
        const HlsModule = await import("hls.js");
        const Hls = HlsModule.default;

        if (!Hls.isSupported()) {
          if (debug) {
            console.warn("[useHls] HLS not supported");
          }
          if (mounted) {
            updateState("error", "HLS not supported in this browser");
          }
          return;
        }

        if (debug) {
          console.log("[useHls] Using hls.js");
        }

        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });

        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (debug) {
            console.log("[useHls] Media attached");
          }
        });

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (debug) {
            console.log("[useHls] Manifest parsed");
          }
          if (mounted) {
            updateState("ready");
          }
        });

        hlsInstance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            if (debug) {
              console.error("[useHls] Fatal error:", data);
            }
            if (mounted) {
              updateState("error", `HLS error: ${data.type}`);
            }
            hlsInstance?.destroy();
            hlsInstance = null;
          } else if (debug) {
            console.warn("[useHls] Non-fatal error:", data);
          }
        });

        hlsInstance.loadSource(masterPlaylistUrl);
        hlsInstance.attachMedia(video);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (debug) {
          console.error("[useHls] Setup error:", errorMessage);
        }
        if (mounted) {
          updateState("error", errorMessage);
        }
      }
    })();

    return () => {
      mounted = false;
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
    };
  }, [masterPlaylistUrl, videoRef, updateState, debug]);

  return { state, error };
}
