import type { TransformResponse } from "../types.js";

const TAG = "[getHlsMasterPlaylist]";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a string looks like a reachable HTTPS URL.
 * Returns a human-readable reason string if invalid, or null if valid.
 */
function validateUrl(url: string, label: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return (
        `${label} has an unexpected protocol: "${parsed.protocol}". ` +
        `Expected "https:" or "http:".`
      );
    }
    if (!parsed.hostname) {
      return `${label} is missing a hostname.`;
    }
    return null;
  } catch {
    return `${label} is not a valid URL: "${url}"`;
  }
}

/**
 * Returns a plain-English explanation for common HTTP status codes returned
 * by the video/transform endpoint, so developers understand immediately why
 * the call failed without having to read server logs.
 */
function explainTransformStatus(status: number, url: string): string {
  if (status === 400) {
    return (
      `HTTP 400 Bad Request from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The "url" query parameter may be malformed, missing, or point to a\n` +
      `  resource that the transform service cannot reach or decode.\n` +
      `  Verify that the source asset URL is publicly accessible and that\n` +
      `  any required query parameters (e.g. apiKey) are present.`
    );
  }
  if (status === 401) {
    return (
      `HTTP 401 Unauthorized from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The apiKey query parameter is missing, expired, or invalid.`
    );
  }
  if (status === 403) {
    return (
      `HTTP 403 Forbidden from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The provided apiKey does not have permission to use this endpoint,\n` +
      `  or the source URL points to a resource that is not accessible from\n` +
      `  the transform service's network.`
    );
  }
  if (status === 404) {
    return (
      `HTTP 404 Not Found from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The /api/v1/video/transform endpoint does not exist at this base URL.\n` +
      `  Check the transformBaseUrl prop (default: https://octane.buzz).`
    );
  }
  if (status === 409) {
    return (
      `HTTP 409 Conflict from transform API.\n` +
      `  URL             : ${url}\n` +
      `  A transform job for this source URL may already be in progress.`
    );
  }
  if (status === 422) {
    return (
      `HTTP 422 Unprocessable Entity from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The request was well-formed but the server could not process the\n` +
      `  source asset. The file may be corrupt, in an unsupported format,\n` +
      `  or the source URL may require authentication that the transform\n` +
      `  service does not have.`
    );
  }
  if (status === 429) {
    return (
      `HTTP 429 Too Many Requests from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The API key has exceeded its rate limit. Wait before retrying.`
    );
  }
  if (status === 500) {
    return (
      `HTTP 500 Internal Server Error from transform API.\n` +
      `  URL             : ${url}\n` +
      `  The transform service encountered an unexpected error processing\n` +
      `  this request. This may be transient — retry after a short delay.`
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return (
      `HTTP ${status} from transform API — service unavailable or gateway error.\n` +
      `  URL             : ${url}\n` +
      `  The transform service may be temporarily down or overloaded.\n` +
      `  Retry after a short delay.`
    );
  }
  return (
    `HTTP ${status} from transform API.\n` +
    `  URL             : ${url}\n` +
    `  This is an unexpected status code for this endpoint.`
  );
}

/**
 * Validates the shape of the JSON payload returned by the transform API and
 * returns a list of warnings for any unexpected or missing fields. This helps
 * surface cases where the server returned a valid 200 but the payload is
 * missing fields we depend on (e.g. a schema change on the server side).
 */
function auditTransformPayload(
  data: unknown,
  responseUrl: string,
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push(
      `Response body is not a JSON object (got ${data === null ? "null" : typeof data}).`,
    );
    return { warnings, errors };
  }

  const d = data as Record<string, unknown>;

  // Required fields
  if (!d.master_playlist_url) {
    errors.push(
      `"master_playlist_url" is absent or falsy in the response. ` +
        `This is the primary field the player depends on.`,
    );
  } else if (typeof d.master_playlist_url !== "string") {
    errors.push(
      `"master_playlist_url" is present but is not a string ` +
        `(got ${typeof d.master_playlist_url}).`,
    );
  } else {
    const urlError = validateUrl(
      d.master_playlist_url,
      '"master_playlist_url"',
    );
    if (urlError) {
      errors.push(urlError);
    }
  }

  if (!d.video_id) {
    warnings.push(
      `"video_id" is absent or falsy. It is not strictly required for playback ` +
        `but is expected from the transform service.`,
    );
  }

  // Resolutions
  if (!d.resolutions) {
    warnings.push(`"resolutions" array is absent from the response.`);
  } else if (!Array.isArray(d.resolutions)) {
    warnings.push(
      `"resolutions" is present but is not an array (got ${typeof d.resolutions}).`,
    );
  } else if (d.resolutions.length === 0) {
    warnings.push(
      `"resolutions" array is empty. No quality variants were returned. ` +
        `The transcoding job may not have produced any output yet.`,
    );
  } else {
    // Spot-check the first resolution entry
    const firstRes = d.resolutions[0] as Record<string, unknown> | undefined;
    if (firstRes && typeof firstRes === "object") {
      const expectedResFields = [
        "name",
        "height",
        "width",
        "bitrate",
        "playlist_url",
      ];
      const missingResFields = expectedResFields.filter(
        (f) => !(f in firstRes),
      );
      if (missingResFields.length > 0) {
        warnings.push(
          `First resolution entry is missing expected fields: ${missingResFields.join(", ")}.`,
        );
      }
      if (firstRes.playlist_url && typeof firstRes.playlist_url === "string") {
        const resUrlError = validateUrl(
          firstRes.playlist_url,
          `resolutions[0].playlist_url`,
        );
        if (resUrlError) {
          warnings.push(resUrlError);
        }
      }
    }
  }

  // Error flag on a 200 response
  if (d.error === true) {
    errors.push(
      `The response body has "error: true" despite a 200 HTTP status. ` +
        `The transform service signalled a logical failure inside a 200 response. ` +
        `message: "${d.message ?? "(none)"}"`,
    );
  }

  // Check for URL host mismatch between the transform API and the returned
  // playlist URL — this can happen when the CDN base URL is misconfigured.
  if (typeof d.master_playlist_url === "string") {
    try {
      const transformHost = new URL(responseUrl).hostname;
      const playlistHost = new URL(d.master_playlist_url).hostname;
      if (transformHost !== playlistHost) {
        warnings.push(
          `The master_playlist_url hostname ("${playlistHost}") differs from the ` +
            `transform API hostname ("${transformHost}"). This is expected if the ` +
            `transform API and CDN are on separate domains, but verify that ` +
            `"${playlistHost}" is the intended CDN origin.`,
        );
      }
    } catch {
      // URL parse failed — already caught above
    }
  }

  return { warnings, errors };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetches HLS master playlist URL from transform service.
 * If masterPlaylistUrl is already provided, returns it immediately.
 * Otherwise, calls the transform API endpoint.
 */
export async function getHlsMasterPlaylist(
  options: GetHlsMasterPlaylistOptions,
): Promise<GetHlsMasterPlaylistResult> {
  const {
    src,
    masterPlaylistUrl,
    transformBaseUrl = DEFAULT_TRANSFORM_BASE_URL,
    debug,
  } = options;

  // ---------------------------------------------------------------------------
  // Fast path: caller already has the master playlist URL
  // ---------------------------------------------------------------------------
  if (masterPlaylistUrl) {
    const urlError = validateUrl(
      masterPlaylistUrl,
      "Provided masterPlaylistUrl",
    );
    if (urlError) {
      console.warn(
        `${TAG} masterPlaylistUrl was provided but failed URL validation.\n` +
          `  ${urlError}\n` +
          `  Returning it anyway — hls.js will surface the error during playback.`,
      );
    } else if (debug) {
      console.log(
        `${TAG} Using provided masterPlaylistUrl (skipping transform API call).\n` +
          `  URL : ${masterPlaylistUrl}`,
      );
    }
    return { masterPlaylistUrl };
  }

  // ---------------------------------------------------------------------------
  // Validate src
  // ---------------------------------------------------------------------------
  if (!src || typeof src !== "string" || !src.trim()) {
    const msg =
      "Source URL (src) is required when masterPlaylistUrl is not provided. " +
      "Pass either a valid src URL or a pre-computed masterPlaylistUrl.";
    console.error(`${TAG} ${msg}`);
    return { masterPlaylistUrl: null, error: msg };
  }

  const srcUrlError = validateUrl(src, "src");
  if (srcUrlError) {
    console.error(`${TAG} src URL validation failed: ${srcUrlError}`);
    return { masterPlaylistUrl: null, error: srcUrlError };
  }

  // ---------------------------------------------------------------------------
  // Build the transform API request URL
  // ---------------------------------------------------------------------------
  let transformUrl: string;
  try {
    const url = new URL("/api/v1/video/transform", transformBaseUrl);
    url.searchParams.set("url", src);
    transformUrl = url.toString();
  } catch (err) {
    const msg =
      `Could not construct the transform API URL. ` +
      `transformBaseUrl "${transformBaseUrl}" may not be a valid origin. ` +
      `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`${TAG} ${msg}`);
    return { masterPlaylistUrl: null, error: msg };
  }

  if (debug) {
    console.log(
      `${TAG} Calling transform API.\n` +
        `  Transform URL : ${transformUrl}\n` +
        `  Source asset  : ${src}\n` +
        `  Base URL      : ${transformBaseUrl}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------
  let response: Response;
  try {
    response = await fetch(transformUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isCors =
      err instanceof TypeError &&
      (msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("CORS"));

    console.error(
      `${TAG} Transform API request failed — fetch threw an exception.\n` +
        `  URL           : ${transformUrl}\n` +
        `  Error         : ${msg}` +
        (isCors
          ? "\n  This looks like a CORS block. The transform API origin must " +
            "include Access-Control-Allow-Origin headers for your application's origin."
          : ""),
      err,
    );
    return {
      masterPlaylistUrl: null,
      error: `Transform API request failed: ${msg}`,
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP-level error handling
  // ---------------------------------------------------------------------------
  if (!response.ok) {
    let rawBody = "(could not read body)";
    try {
      rawBody = (await response.text()).slice(0, 512).trim();
    } catch {
      // ignore
    }

    const statusExplanation = explainTransformStatus(
      response.status,
      transformUrl,
    );

    console.error(
      `${TAG} Transform API returned a non-OK status.\n` +
        statusExplanation +
        `\n  Response body (first 512 chars):\n  ${rawBody}`,
    );

    return {
      masterPlaylistUrl: null,
      error: `Transform API returned ${response.status}: ${rawBody || response.statusText}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Parse JSON
  // ---------------------------------------------------------------------------
  let data: unknown;
  let rawJson = "(unavailable)";
  try {
    rawJson = await response.text();
    data = JSON.parse(rawJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${TAG} Transform API returned HTTP 200 but the response body is not valid JSON.\n` +
        `  URL           : ${transformUrl}\n` +
        `  Parse error   : ${msg}\n` +
        `  Raw body (first 512 chars):\n  ${rawJson.slice(0, 512)}`,
    );
    return {
      masterPlaylistUrl: null,
      error: `Transform API response is not valid JSON: ${msg}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Audit the payload shape
  // ---------------------------------------------------------------------------
  const { warnings, errors: payloadErrors } = auditTransformPayload(
    data,
    transformUrl,
  );

  if (debug) {
    console.log(
      `${TAG} Transform API response (HTTP ${response.status}):\n` +
        `  Raw JSON : ${rawJson.slice(0, 1024)}`,
    );
  }

  if (warnings.length > 0) {
    console.warn(
      `${TAG} Transform API response payload warnings (HTTP ${response.status}):\n` +
        warnings.map((w) => `  ⚠ ${w}`).join("\n"),
    );
  }

  if (payloadErrors.length > 0) {
    const combined = payloadErrors.join("; ");
    console.error(
      `${TAG} Transform API response payload errors (HTTP ${response.status}):\n` +
        payloadErrors.map((e) => `  ✖ ${e}`).join("\n") +
        `\n  Full response (first 1024 chars):\n  ${rawJson.slice(0, 1024)}`,
    );
    return {
      masterPlaylistUrl: null,
      error: `Transform API response invalid: ${combined}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Extract and return
  // ---------------------------------------------------------------------------
  const typedData = data as TransformResponse;

  // Defensive guard — auditTransformPayload would have already caught this,
  // but TypeScript needs the narrowing.
  if (!typedData.master_playlist_url) {
    const msg = "Transform API response missing master_playlist_url";
    console.error(`${TAG} ${msg}`);
    return { masterPlaylistUrl: null, error: msg };
  }

  if (debug) {
    console.log(
      `${TAG} Transform API call succeeded.\n` +
        `  master_playlist_url : ${typedData.master_playlist_url}\n` +
        `  video_id            : ${typedData.video_id ?? "(none)"}\n` +
        `  resolutions         : ${
          Array.isArray(typedData.resolutions)
            ? typedData.resolutions
                .map((r) =>
                  typeof r === "object" && r !== null
                    ? `${(r as Record<string, unknown>).name ?? "?"}` +
                      ` (${(r as Record<string, unknown>).width ?? "?"}x` +
                      `${(r as Record<string, unknown>).height ?? "?"}` +
                      ` @ ${(r as Record<string, unknown>).bitrate ?? "?"}bps)`
                    : String(r),
                )
                .join(", ")
            : "(none)"
        }`,
    );
  }

  return {
    masterPlaylistUrl: typedData.master_playlist_url,
    videoId: typedData.video_id,
    resolutions: typedData.resolutions,
  };
}
