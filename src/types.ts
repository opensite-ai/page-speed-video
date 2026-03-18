import type React from "react";

export type PlaybackState = "idle" | "loading" | "ready" | "error";

export type ProcessingStrategy = "optimistic" | "poll";

export interface VideoProps extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> {
  /** Source video URL (for progressive MP4 or transform) */
  src?: string;
  /** Direct HLS master playlist URL (skips transform call) */
  masterPlaylistUrl?: string;
  /** Fallback progressive MP4 URL if HLS fails */
  fallbackSrc?: string;
  /** OptixFlow API key for poster optimization */
  optixFlowApiKey?: string;
  /** Base URL for transform API (default: https://octane.buzz) */
  transformBaseUrl?: string;
  /** CDN base URL for playlist/segment serving (default: https://octane.cdn.ing) */
  cdnBaseUrl?: string;
  /** Prefer native controls (default: true) */
  preferNativeControls?: boolean;
  /** Processing strategy: optimistic or poll (default: optimistic) */
  processingStrategy?: ProcessingStrategy;
  /** Callback for playback state changes */
  onPlaybackStateChange?: (state: PlaybackState) => void;
  /** Enable debug logging */
  debug?: boolean;
  /**
   * Skin classes for custom controls (from @page-speed/skins)
   * When provided, enables custom controls with skin styling
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
   * When provided with skinClasses, enables custom controls
   */
  skinStyle?: Record<string, string>;
}

export interface TransformResponse {
  error?: boolean;
  message?: string;
  master_playlist_url?: string;
  video_id?: string;
  resolutions?: string[];
}

export interface UseHlsOptions {
  /** HLS master playlist URL */
  masterPlaylistUrl: string | null;
  /** Video element ref */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Callback for state changes */
  onStateChange?: (state: PlaybackState) => void;
  /** Enable debug logging */
  debug?: boolean;
}

export interface UseHlsResult {
  /** Current playback state */
  state: PlaybackState;
  /** Error message if state is "error" */
  error: string | null;
}
