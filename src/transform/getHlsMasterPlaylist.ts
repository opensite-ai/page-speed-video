import type { TransformResponse } from "../types.js";

const DEFAULT_TRANSFORM_BASE_URL = "https://octane.buzz";

export interface GetHlsMasterPlaylistOptions {
  /** Source video URL to transform */
  src: string;
  /** Optional pre-computed master playlist URL (skips network call) */
  masterPlaylistUrl?: string;
  /** Base URL for transform API */
  transformBaseUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface GetHlsMasterPlaylistResult {
  /** Master playlist URL */
  masterPlaylistUrl: string | null;
  /** Video ID from transform service */
  videoId?: string;
  /** Available resolutions */
  resolutions?: string[];
  /** Error message if transform failed */
  error?: string;
}

/**
 * Fetches HLS master playlist URL from transform service.
 * If masterPlaylistUrl is already provided, returns it immediately.
 * Otherwise, calls the transform API endpoint.
 */
export async function getHlsMasterPlaylist(
  options: GetHlsMasterPlaylistOptions,
): Promise<GetHlsMasterPlaylistResult> {
  const { src, masterPlaylistUrl, transformBaseUrl = DEFAULT_TRANSFORM_BASE_URL, debug } = options;

  // If master playlist URL is already provided, skip network call
  if (masterPlaylistUrl) {
    if (debug) {
      console.log("[getHlsMasterPlaylist] Using provided masterPlaylistUrl:", masterPlaylistUrl);
    }
    return { masterPlaylistUrl };
  }

  // Require src URL
  if (!src || typeof src !== "string" || !src.trim()) {
    return {
      masterPlaylistUrl: null,
      error: "Source URL is required when masterPlaylistUrl is not provided",
    };
  }

  try {
    const url = new URL("/api/v1/video/transform", transformBaseUrl);
    url.searchParams.set("url", src);

    if (debug) {
      console.log("[getHlsMasterPlaylist] Fetching transform:", url.toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        masterPlaylistUrl: null,
        error: `Transform API returned ${response.status}: ${errorText}`,
      };
    }

    const data: TransformResponse = await response.json();

    if (data.error) {
      return {
        masterPlaylistUrl: null,
        error: data.message || "Transform API returned error",
      };
    }

    if (!data.master_playlist_url) {
      return {
        masterPlaylistUrl: null,
        error: "Transform API response missing master_playlist_url",
      };
    }

    if (debug) {
      console.log("[getHlsMasterPlaylist] Transform success:", {
        masterPlaylistUrl: data.master_playlist_url,
        videoId: data.video_id,
        resolutions: data.resolutions,
      });
    }

    return {
      masterPlaylistUrl: data.master_playlist_url,
      videoId: data.video_id,
      resolutions: data.resolutions,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      masterPlaylistUrl: null,
      error: `Transform API request failed: ${errorMessage}`,
    };
  }
}
