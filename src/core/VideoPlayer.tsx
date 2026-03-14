"use client";

import React, {
  forwardRef,
  memo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { VideoProps } from "../types.js";
import { Video } from "./Video.js";

interface VideoPlayerProps extends VideoProps {
  /**
   * Skin classes for custom controls
   * Use resolveVideoClasses() from @page-speed/skins
   */
  skinClasses?: {
    container?: string;
    video?: string;
    controlsBar?: string;
    playButton?: string;
    timeline?: string;
    timelineProgress?: string;
    timelineBuffered?: string;
    timeText?: string;
    volumeControl?: string;
    fullscreenButton?: string;
    settingsButton?: string;
    loadingSpinner?: string;
    playOverlay?: string;
    playOverlayButton?: string;
  };

  /**
   * CSS custom properties from skin tokens
   */
  skinStyle?: Record<string, string>;

  /**
   * Hide custom controls and use native controls instead
   */
  useNativeControls?: boolean;
}

const VideoPlayerBase = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer(
    {
      skinClasses = {},
      skinStyle = {},
      useNativeControls = false,
      className,
      style,
      ...videoProps
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [volume, setVolume] = useState(1);
    const hideControlsTimeout = useRef<NodeJS.Timeout>();

    // If native controls requested, just render the Video component
    if (useNativeControls) {
      return (
        <Video
          ref={ref}
          className={className}
          style={style}
          controls
          {...videoProps}
        />
      );
    }

    // Merge refs
    const mergedRef = useCallback(
      (node: HTMLVideoElement | null) => {
        videoRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref && typeof ref === "object") {
          (ref as React.MutableRefObject<HTMLVideoElement | null>).current =
            node;
        }
      },
      [ref]
    );

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

    // Video event listeners
    useEffect(() => {
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
      const handleVolumeChange = () => setVolume(video.volume);

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("volumechange", handleVolumeChange);

      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("volumechange", handleVolumeChange);
      };
    }, []);

    // Fullscreen change listener
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }, []);

    // Auto-hide controls timeout
    useEffect(() => {
      return () => {
        if (hideControlsTimeout.current) {
          clearTimeout(hideControlsTimeout.current);
        }
      };
    }, []);

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
        <Video
          ref={mergedRef}
          className={
            skinClasses.video || className || "w-full h-full object-contain"
          }
          controls={false}
          {...videoProps}
        />

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
  }
);

export const VideoPlayer = memo(VideoPlayerBase);
VideoPlayer.displayName = "PageSpeedVideoPlayer";
