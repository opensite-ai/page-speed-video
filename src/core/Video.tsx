"use client";

import React, { forwardRef, memo, useRef, useState, useEffect, useMemo } from "react";
import type { VideoProps, PlaybackState } from "../types.js";
import { getHlsMasterPlaylist } from "../transform/getHlsMasterPlaylist.js";
import { useHls } from "../hls/useHls.js";
import { shouldUseMp4Fallback } from "../fallback/shouldUseMp4Fallback.js";
import { getOptimizedPosterUrl } from "../poster/getOptimizedPosterUrl.js";
import { pollForReadiness } from "../processing/pollForReadiness.js";

type NativeVideoProps = Omit<
  React.VideoHTMLAttributes<HTMLVideoElement>,
  "src"
>;

type ForwardedVideoProps = VideoProps & {
  forwardedRef: React.Ref<HTMLVideoElement | null>;
};

let defaultOptixFlowApiKey: string | undefined;

const readGlobalOptixFlowApiKey = (): string | undefined => {
  if (typeof globalThis === "undefined") return undefined;
  const globalAny = globalThis as any;
  return (
    globalAny.PageSpeedVideoDefaults?.optixFlowApiKey ||
    globalAny.OpensiteVideoDefaults?.optixFlowApiKey ||
    globalAny.PAGE_SPEED_VIDEO_DEFAULTS?.optixFlowApiKey
  );
};

const resolveOptixFlowApiKey = (apiKey?: string): string | undefined => {
  return apiKey ?? defaultOptixFlowApiKey ?? readGlobalOptixFlowApiKey();
};

export const setDefaultOptixFlowApiKey = (apiKey?: string | null) => {
  defaultOptixFlowApiKey = apiKey ?? undefined;
};

const ModernVideo: React.FC<ForwardedVideoProps> = ({
  src,
  masterPlaylistUrl: providedMasterPlaylistUrl,
  fallbackSrc,
  optixFlowApiKey,
  transformBaseUrl,
  cdnBaseUrl,
  preferNativeControls = true,
  processingStrategy = "optimistic",
  onPlaybackStateChange,
  debug,
  poster,
  controls,
  forwardedRef,
  ...restProps
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [resolvedMasterPlaylistUrl, setResolvedMasterPlaylistUrl] = useState<string | null>(
    providedMasterPlaylistUrl || null,
  );
  const [transformError, setTransformError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const resolvedApiKey = useMemo(
    () => resolveOptixFlowApiKey(optixFlowApiKey),
    [optixFlowApiKey],
  );

  // Compute optimized poster URL
  const optimizedPoster = useMemo(() => {
    if (!poster || typeof poster !== "string") return poster;
    return getOptimizedPosterUrl({
      url: poster,
      apiKey: resolvedApiKey,
      debug,
    });
  }, [poster, resolvedApiKey, debug]);

  // Fetch master playlist if not provided
  useEffect(() => {
    if (providedMasterPlaylistUrl) {
      setResolvedMasterPlaylistUrl(providedMasterPlaylistUrl);
      setTransformError(null);
      return;
    }

    if (!src) {
      setResolvedMasterPlaylistUrl(null);
      setTransformError(null);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const result = await getHlsMasterPlaylist({
          src,
          transformBaseUrl,
          debug,
        });

        if (!mounted) return;

        if (result.error || !result.masterPlaylistUrl) {
          setTransformError(result.error || "Failed to get master playlist URL");
          setResolvedMasterPlaylistUrl(null);
          return;
        }

        // If poll strategy, wait for playlist to be ready
        if (processingStrategy === "poll") {
          setIsPolling(true);
          const isReady = await pollForReadiness({
            masterPlaylistUrl: result.masterPlaylistUrl,
            debug,
          });

          if (!mounted) return;
          setIsPolling(false);

          if (!isReady) {
            setTransformError("Video processing timed out");
            setResolvedMasterPlaylistUrl(null);
            return;
          }
        }

        setResolvedMasterPlaylistUrl(result.masterPlaylistUrl);
        setTransformError(null);
      } catch (err) {
        if (!mounted) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setTransformError(errorMessage);
        setResolvedMasterPlaylistUrl(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [src, providedMasterPlaylistUrl, transformBaseUrl, processingStrategy, debug]);

  // Attach HLS
  const { state: hlsState, error: hlsError } = useHls({
    masterPlaylistUrl: resolvedMasterPlaylistUrl,
    videoRef,
    onStateChange: onPlaybackStateChange,
    debug,
  });

  // Determine if we should use MP4 fallback
  const useFallback = shouldUseMp4Fallback(hlsState, fallbackSrc);

  // Merge refs
  const mergedRef = React.useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef && typeof forwardedRef === "object") {
        (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      }
    },
    [forwardedRef],
  );

  // Determine video source
  let videoSrc: string | undefined;
  if (useFallback && fallbackSrc) {
    videoSrc = fallbackSrc;
  } else if (!resolvedMasterPlaylistUrl && src && !transformError) {
    // If no HLS and no fallback, use original src as progressive
    videoSrc = src;
  }

  if (debug) {
    console.log("[Video] State:", {
      hlsState,
      useFallback,
      videoSrc,
      resolvedMasterPlaylistUrl,
      transformError,
      hlsError,
      isPolling,
    });
  }

  return (
    <video
      {...restProps}
      ref={mergedRef}
      poster={optimizedPoster}
      controls={controls ?? preferNativeControls}
      src={videoSrc}
    >
      {useFallback && fallbackSrc && (
        <source src={fallbackSrc} type="video/mp4" />
      )}
      {restProps.children}
    </video>
  );
};

const VideoBase = forwardRef<HTMLVideoElement, VideoProps>(
  function Video(props, ref) {
    const hasSrc = (props.src && props.src.trim().length > 0) ||
                   (props.masterPlaylistUrl && props.masterPlaylistUrl.trim().length > 0);

    if (!hasSrc) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("<Video /> requires src or masterPlaylistUrl. No source provided, rendering null.");
      }
      return null;
    }

    return <ModernVideo {...props} forwardedRef={ref} />;
  },
);

export const Video = memo(VideoBase);
Video.displayName = "PageSpeedVideo";
