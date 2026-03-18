/**
 * Gets optimized poster URL using OptixFlow CDN API.
 * Generates responsive image URLs with format optimization (AVIF, WebP, JPEG).
 * Uses the same OptixFlow infrastructure as @page-speed/img.
 */

export type PosterImageFormat = "avif" | "webp" | "jpeg" | "png";

export interface GetOptimizedPosterOptions {
  /** Original poster URL */
  url: string;

  /** OptixFlow API key (required for optimization) */
  apiKey?: string;

  /** Target width in pixels (default: 1280) */
  width?: number;

  /** Target height in pixels (default: 720) */
  height?: number;

  /** Compression quality 1-100 (default: 75) */
  quality?: number;

  /** Output format (default: "jpeg") */
  format?: PosterImageFormat;

  /** How the image should fit the target dimensions (default: "cover") */
  objectFit?: "cover" | "contain" | "fill";

  /** Enable debug logging */
  debug?: boolean;
}

const OPTIXFLOW_BASE_URL = "https://octane.cdn.ing/api/v1/images/transform?";

/**
 * Builds an OptixFlow CDN URL for optimized poster images.
 * Returns original URL if no API key is provided.
 */
export function getOptimizedPosterUrl(options: GetOptimizedPosterOptions): string {
  const {
    url,
    apiKey,
    width = 1280,
    height = 720,
    quality = 75,
    format = "jpeg",
    objectFit = "cover",
    debug = false,
  } = options;

  // If no API key, return original URL (no optimization)
  if (!apiKey) {
    if (debug) {
      console.log("[getOptimizedPosterUrl] No API key provided, using original URL");
    }
    return url;
  }

  // If URL is a data URL or blob, return as-is (can't optimize)
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    if (debug) {
      console.log("[getOptimizedPosterUrl] Data/Blob URL detected, using original");
    }
    return url;
  }

  // Build OptixFlow URL with query parameters
  const params = new URLSearchParams();
  params.set("url", url);
  params.set("fit", objectFit);
  params.set("w", String(width));
  params.set("h", String(height));
  params.set("q", String(quality));
  params.set("f", format);
  params.set("apiKey", apiKey);

  const optimizedUrl = `${OPTIXFLOW_BASE_URL}${params.toString()}`;

  if (debug) {
    console.log("[getOptimizedPosterUrl] Generated OptixFlow URL:", {
      original: url,
      optimized: optimizedUrl,
      dimensions: `${width}x${height}`,
      format,
      quality,
      objectFit,
    });
  }

  return optimizedUrl;
}
