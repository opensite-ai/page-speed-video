"use client";

import React, { forwardRef, memo, useRef, useState, useEffect, useMemo, useCallback } from "react";
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
  skinClasses,
  skinStyle,
  className,
  style,
  forwardedRef,
  ...restProps
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedMasterPlaylistUrl, setResolvedMasterPlaylistUrl] = useState<string | null>(
    providedMasterPlaylistUrl || null,
  );
  const [transformError, setTransformError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Custom controls state (only used when skinClasses provided)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const hideControlsTimeout = useRef<NodeJS.Timeout>();

  const resolvedApiKey = useMemo(
    () => resolveOptixFlowApiKey(optixFlowApiKey),
    [optixFlowApiKey],
  );

  // Determine if we should use custom controls
  const useCustomControls = !!(skinClasses && Object.keys(skinClasses).length > 0);

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

        // If transform fails or no masterPlaylistUrl, fallback to src
        if (result.error || !result.masterPlaylistUrl) {
          if (debug) {
            console.log("[Video] Transform failed, will use src as progressive:", result.error);
          }
          setTransformError(result.error || "Transform API unavailable");
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
        if (debug) {
          console.log("[Video] Transform error, will use src as progressive:", errorMessage);
        }
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
  const mergedRef = useCallback(
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
  } else if (!resolvedMasterPlaylistUrl && src) {
    // If no HLS (either transform failed or not attempted), use original src as progressive
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
      useCustomControls,
    });
  }

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  // Handle timeline click
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!videoRef.current) return;
      const timeline = e.currentTarget;
      const rect = timeline.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = percent * duration;
    },
    [duration]
  );

  // Handle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Handle volume
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (videoRef.current) {
        videoRef.current.volume = newVolume;
      }
    },
    []
  );

  // Auto-hide controls
  const resetHideControlsTimeout = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Video event listeners for custom controls
  useEffect(() => {
    if (!useCustomControls) return;

    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleVolumeChangeEvent = () => setVolume(video.volume);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("volumechange", handleVolumeChangeEvent);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("volumechange", handleVolumeChangeEvent);
    };
  }, [useCustomControls]);

  // Fullscreen change listener
  useEffect(() => {
    if (!useCustomControls) return;

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [useCustomControls]);

  // Auto-hide controls cleanup
  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

  // Handle click-to-play/pause when controls are enabled
  const handleVideoClick = useCallback(() => {
    if (controls || useCustomControls) {
      togglePlay();
    }
  }, [controls, useCustomControls, togglePlay]);

  // Render native video without custom controls
  if (!useCustomControls) {
    return (
      <video
        {...restProps}
        ref={mergedRef}
        poster={optimizedPoster}
        controls={controls ?? preferNativeControls}
        src={videoSrc}
        className={className}
        style={style}
        onClick={handleVideoClick}
      >
        {useFallback && fallbackSrc && (
          <source src={fallbackSrc} type="video/mp4" />
        )}
        {restProps.children}
      </video>
    );
  }

  // Render with custom controls (when skinClasses provided)
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={skinClasses.container || "relative w-full"}
      style={{ ...skinStyle, ...style }}
      onMouseMove={resetHideControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        {...restProps}
        ref={mergedRef}
        poster={optimizedPoster}
        controls={false}
        src={videoSrc}
        className={skinClasses.video || className || "w-full h-full object-contain"}
        onClick={togglePlay}
      >
        {useFallback && fallbackSrc && (
          <source src={fallbackSrc} type="video/mp4" />
        )}
        {restProps.children}
      </video>

      {/* Play overlay (large centered play button) */}
      {!isPlaying && (
        <div
          className={
            skinClasses.playOverlay ||
            "absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
          }
          onClick={togglePlay}
        >
          <div
            className={
              skinClasses.playOverlayButton ||
              "w-16 h-16 rounded-full bg-white/90 flex items-center justify-center"
            }
          >
            <svg
              className="w-8 h-8 text-black ml-1"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Custom controls bar */}
      {showControls && (
        <div
          className={
            skinClasses.controlsBar ||
            "absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-3 bg-black/80"
          }
        >
          {/* Play/Pause button */}
          <button
            className={
              skinClasses.playButton ||
              "flex items-center justify-center w-8 h-8 text-white hover:text-blue-400"
            }
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Timeline/Progress bar */}
          <div
            className={
              skinClasses.timeline ||
              "flex-1 h-1.5 bg-gray-600 rounded-full cursor-pointer relative"
            }
            onClick={handleTimelineClick}
          >
            {/* Buffered indicator */}
            <div
              className={
                skinClasses.timelineBuffered ||
                "absolute inset-y-0 left-0 bg-gray-500 rounded-full"
              }
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Progress indicator */}
            <div
              className={
                skinClasses.timelineProgress ||
                "absolute inset-y-0 left-0 bg-blue-500 rounded-full"
              }
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Time display */}
          <span
            className={
              skinClasses.timeText ||
              "text-xs text-white font-mono whitespace-nowrap"
            }
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Volume control */}
          <div
            className={
              skinClasses.volumeControl || "flex items-center gap-2"
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 text-white"
            >
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-16"
            />
          </div>

          {/* Fullscreen button */}
          <button
            className={
              skinClasses.fullscreenButton ||
              "flex items-center justify-center w-8 h-8 text-white hover:text-blue-400"
            }
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              {isFullscreen ? (
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              ) : (
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              )}
            </svg>
          </button>
        </div>
      )}
    </div>
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
