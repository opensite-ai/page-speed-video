import type { PlaybackState } from "../types.js";

/**
 * Determines if MP4 fallback should be used based on HLS state and availability.
 * Returns true if:
 * 1. HLS is in error state (fatal error occurred)
 * 2. fallbackSrc is available
 */
export function shouldUseMp4Fallback(
  hlsState: PlaybackState,
  fallbackSrc?: string,
): boolean {
  if (!fallbackSrc || typeof fallbackSrc !== "string" || !fallbackSrc.trim()) {
    return false;
  }

  return hlsState === "error";
}
