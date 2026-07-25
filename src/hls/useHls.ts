import { useEffect, useState, useCallback } from "react";
import type { UseHlsOptions, UseHlsResult, PlaybackState } from "../types.js";

// Dynamic import type for hls.js
type HlsType = typeof import("hls.js").default;
type HlsInstance = InstanceType<HlsType>;

const TAG = "[useHls]";

type HlsQualityLevel = {
  width?: number;
  height?: number;
  bitrate?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Picks the highest-resolution variant, using bitrate as a tie-breaker.
 * HLS manifests usually list levels from lowest to highest bitrate, but the
 * order is not guaranteed, so compare the level metadata explicitly.
 */
function getHighestQualityLevelIndex(levels: HlsQualityLevel[]): number {
  return levels.reduce((highestIndex, level, index) => {
    if (highestIndex === -1) return index;

    const highest = levels[highestIndex];
    const resolution = (level.width ?? 0) * (level.height ?? 0);
    const highestResolution =
      (highest.width ?? 0) * (highest.height ?? 0);

    if (resolution !== highestResolution) {
      return resolution > highestResolution ? index : highestIndex;
    }

    return (level.bitrate ?? 0) > (highest.bitrate ?? 0)
      ? index
      : highestIndex;
  }, -1);
}

/**
 * Resolves the highest-resolution media playlist from an HLS master playlist.
 * Native HLS players do not expose a quality-selection API, so assigning the
 * selected media playlist directly prevents their ABR ladder from restarting
 * at the lowest rendition on every loop.
 */
function getHighestQualityVariantUrl(
  masterPlaylistUrl: string,
  manifestText: string | null,
): string | null {
  if (!manifestText) return null;

  const lines = manifestText.split(/\r?\n/);
  const variants: Array<HlsQualityLevel & { uri: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    const attributes = line.slice("#EXT-X-STREAM-INF:".length);
    const resolution = attributes.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bandwidth = attributes.match(
      /(?:^|,)BANDWIDTH=(\d+)(?:,|$)/i,
    );
    const uri = lines
      .slice(index + 1)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.length > 0 && !candidate.startsWith("#"));

    if (!uri) continue;

    variants.push({
      uri,
      width: resolution ? Number.parseInt(resolution[1], 10) : undefined,
      height: resolution ? Number.parseInt(resolution[2], 10) : undefined,
      bitrate: bandwidth ? Number.parseInt(bandwidth[1], 10) : undefined,
    });
  }

  const highestQualityLevel = getHighestQualityLevelIndex(variants);
  if (highestQualityLevel < 0) return null;

  try {
    return new URL(
      variants[highestQualityLevel].uri,
      masterPlaylistUrl,
    ).toString();
  } catch {
    return null;
  }
}

/**
 * Probes a URL with a GET request and returns a structured diagnostic object.
 * This runs *before* hls.js touches the URL so we can surface HTTP-level
 * failures (404, 202 still-processing, CORS blocks, network errors, etc.)
 * independently of whatever hls.js decides to do with them.
 */
async function probeUrl(url: string): Promise<{
  ok: boolean;
  status: number | null;
  statusText: string | null;
  contentType: string | null;
  bodyText: string | null;
  bodyPreview: string | null;
  corsBlocked: boolean;
  networkError: boolean;
  errorMessage: string | null;
}> {
  try {
    const response = await fetch(url, {
      method: "GET",
      // Master playlists are small text files. Cap the probe at 64 KiB so it
      // contains every advertised quality variant without allowing an
      // unexpected response to become an unbounded download.
      headers: { Range: "bytes=0-65535" },
      // Don't follow redirects silently — we want to see the raw status.
      redirect: "follow",
    });

    let bodyText: string | null = null;
    let bodyPreview: string | null = null;
    try {
      const raw = await response.text();
      bodyText = raw;
      bodyPreview = raw.slice(0, 512).trim();
    } catch {
      // ignore body read errors
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      bodyText,
      bodyPreview,
      corsBlocked: false,
      networkError: false,
      errorMessage: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // TypeError with "Failed to fetch" / "NetworkError" typically means CORS
    // or a genuine offline scenario.
    const isCors =
      err instanceof TypeError &&
      (msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("CORS"));

    return {
      ok: false,
      status: null,
      statusText: null,
      contentType: null,
      bodyText: null,
      bodyPreview: null,
      corsBlocked: isCors,
      networkError: !isCors,
      errorMessage: msg,
    };
  }
}

/**
 * Interprets a probe result and returns a human-readable diagnosis string
 * so that developers don't have to decode HTTP status codes manually.
 */
function interpretProbe(
  url: string,
  probe: Awaited<ReturnType<typeof probeUrl>>,
): string {
  if (probe.corsBlocked) {
    return (
      `CORS block detected fetching master playlist.\n` +
      `  URL              : ${url}\n` +
      `  The server at that origin must include the appropriate\n` +
      `  Access-Control-Allow-Origin response header.\n` +
      `  If this is a CDN URL, ensure CORS is enabled on the bucket/distribution.`
    );
  }

  if (probe.networkError) {
    return (
      `Network error fetching master playlist — the host may be unreachable.\n` +
      `  URL              : ${url}\n` +
      `  Error            : ${probe.errorMessage}`
    );
  }

  if (probe.status === null) {
    return `Could not reach master playlist URL: ${url}`;
  }

  // Status-specific guidance
  if (probe.status === 200 || probe.status === 206) {
    const isM3u8 =
      probe.bodyPreview?.startsWith("#EXTM3U") ||
      probe.contentType?.includes("mpegurl") ||
      probe.contentType?.includes("x-mpegURL");

    if (!isM3u8) {
      return (
        `Master playlist URL returned HTTP ${probe.status} but the response does NOT look like HLS.\n` +
        `  URL              : ${url}\n` +
        `  Content-Type     : ${probe.contentType ?? "(none)"}\n` +
        `  Body preview     : ${probe.bodyPreview?.slice(0, 120) ?? "(empty)"}\n` +
        `  Expected the body to start with "#EXTM3U".\n` +
        `  The video/transform job may still be running, or the URL may point to\n` +
        `  the wrong resource.`
      );
    }

    return (
      `Master playlist URL is reachable and appears to be valid HLS.\n` +
      `  URL              : ${url}\n` +
      `  Status           : ${probe.status}\n` +
      `  Content-Type     : ${probe.contentType ?? "(none)"}\n` +
      `  Body preview     : ${probe.bodyPreview?.slice(0, 120) ?? "(empty)"}`
    );
  }

  if (probe.status === 202) {
    return (
      `Master playlist URL returned HTTP 202 Accepted — the video is still being processed.\n` +
      `  URL              : ${url}\n` +
      `  The transcoding job has not finished yet. Consider using processingStrategy="poll"\n` +
      `  or waiting before attempting playback.`
    );
  }

  if (probe.status === 404) {
    return (
      `Master playlist URL returned HTTP 404 Not Found.\n` +
      `  URL              : ${url}\n` +
      `  Possible causes:\n` +
      `    • The video ID embedded in the URL does not exist on the CDN.\n` +
      `    • The video/transform job failed silently and no segments were written.\n` +
      `    • The URL was copied incorrectly (check for typos in the video ID).\n` +
      `  Body preview     : ${probe.bodyPreview?.slice(0, 120) ?? "(empty)"}`
    );
  }

  if (probe.status === 403) {
    return (
      `Master playlist URL returned HTTP 403 Forbidden.\n` +
      `  URL              : ${url}\n` +
      `  The CDN or origin is rejecting unauthenticated access.\n` +
      `  Check that the API key / signed URL is present and valid.`
    );
  }

  if (probe.status === 401) {
    return (
      `Master playlist URL returned HTTP 401 Unauthorized.\n` +
      `  URL              : ${url}\n` +
      `  Authentication credentials are missing or expired.`
    );
  }

  if (probe.status >= 500) {
    return (
      `Master playlist URL returned HTTP ${probe.status} ${probe.statusText ?? ""} — server error.\n` +
      `  URL              : ${url}\n` +
      `  Body preview     : ${probe.bodyPreview?.slice(0, 120) ?? "(empty)"}`
    );
  }

  return (
    `Unexpected HTTP ${probe.status} ${probe.statusText ?? ""} from master playlist URL.\n` +
    `  URL              : ${url}\n` +
    `  Content-Type     : ${probe.contentType ?? "(none)"}\n` +
    `  Body preview     : ${probe.bodyPreview?.slice(0, 120) ?? "(empty)"}`
  );
}

// ---------------------------------------------------------------------------
// hls.js error detail prettifiers
// ---------------------------------------------------------------------------

/**
 * Formats the rich ErrorData object that hls.js passes to Hls.Events.ERROR
 * into a readable multi-line string. We deliberately surface every field that
 * is useful for diagnosing playlist / segment / network failures so that
 * developers don't have to read the hls.js source to understand what went wrong.
 */
function formatHlsError(data: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push(`  type             : ${data.type ?? "(unknown)"}`);
  lines.push(`  details          : ${data.details ?? "(unknown)"}`);
  lines.push(`  fatal            : ${String(data.fatal)}`);

  // Network / loader response
  const response = data.response as Record<string, unknown> | undefined;
  if (response) {
    lines.push(`  response.url     : ${response.url ?? "(none)"}`);
    lines.push(
      `  response.code    : ${response.code ?? response.status ?? "(none)"}`,
    );
    lines.push(`  response.text    : ${response.text ?? "(none)"}`);
  }

  // Fragment context
  const frag = data.frag as Record<string, unknown> | undefined;
  if (frag) {
    lines.push(`  frag.url         : ${frag.url ?? "(none)"}`);
    lines.push(`  frag.sn          : ${frag.sn ?? "(none)"}`);
    lines.push(`  frag.level       : ${frag.level ?? "(none)"}`);
    lines.push(`  frag.type        : ${frag.type ?? "(none)"}`);
    lines.push(`  frag.start       : ${frag.start ?? "(none)"}`);
    lines.push(`  frag.duration    : ${frag.duration ?? "(none)"}`);
  }

  // Level / playlist context
  const level = data.level as number | undefined;
  if (level !== undefined) {
    lines.push(`  level            : ${level}`);
  }

  const levelDetails = data.levelDetails as Record<string, unknown> | undefined;
  if (levelDetails) {
    lines.push(`  levelDetails.url : ${levelDetails.url ?? "(none)"}`);
    lines.push(
      `  levelDetails.totalduration : ${levelDetails.totalduration ?? "(none)"}`,
    );
  }

  // Loader stats (timing)
  const networkDetails = data.networkDetails as
    | Record<string, unknown>
    | undefined;
  if (networkDetails) {
    const timing = networkDetails.timing as Record<string, unknown> | undefined;
    if (timing) {
      lines.push(
        `  timing (ms)      : connect=${timing.connect ?? "?"} ttfb=${timing.ttfb ?? "?"} load=${timing.load ?? "?"}`,
      );
    }
  }

  // Raw error object if present
  if (data.error instanceof Error) {
    lines.push(`  error.message    : ${data.error.message}`);
    if (data.error.stack) {
      lines.push(
        `  error.stack      : ${data.error.stack.split("\n")[1]?.trim() ?? ""}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Returns a plain-language explanation for the most common hls.js error
 * `details` codes so that the error is actionable without having to look them
 * up in the hls.js docs.
 */
function explainHlsErrorDetails(details: string | undefined): string | null {
  if (!details) return null;

  const explanations: Record<string, string> = {
    // Manifest errors
    manifestLoadError:
      "hls.js could not load the master playlist. " +
      "Check the URL, CORS headers, and that the CDN has finished writing the playlist file.",
    manifestLoadTimeOut:
      "hls.js timed out loading the master playlist. " +
      "The CDN may be slow or the video may still be processing.",
    manifestParsingError:
      "hls.js loaded the master playlist but could not parse it. " +
      "The file may be truncated, malformed, or not a valid M3U8.",
    manifestIncompatibleCodecsError:
      "The video uses codecs that are not supported by this browser.",

    // Level (variant playlist) errors
    levelLoadError:
      "hls.js could not load a variant (resolution) playlist. " +
      "The segment index file for this quality level may be missing or inaccessible.",
    levelLoadTimeOut: "hls.js timed out loading a variant playlist.",
    levelParsingError:
      "hls.js loaded a variant playlist but could not parse it.",
    levelSwitchError: "hls.js encountered an error switching quality levels.",

    // Fragment / segment errors
    fragLoadError:
      "hls.js could not load a video segment (.ts / .mp4 fragment). " +
      "The segment file may be missing on the CDN, or the CDN may still be transcoding.",
    fragLoadTimeOut:
      "hls.js timed out loading a video segment. " +
      "The CDN may be under load or the segment may not have been written yet.",
    fragDecryptDataDecryptError:
      "hls.js failed to decrypt a video segment. Check AES encryption keys.",
    fragParsingError:
      "hls.js loaded a segment but could not parse/demux it. " +
      "The segment may be corrupt or in an unsupported container format.",

    // Key errors
    keyLoadError:
      "hls.js could not load the AES encryption key. " +
      "Check key URL accessibility and CORS headers.",
    keyLoadTimeOut: "hls.js timed out loading the AES encryption key.",

    // Buffer/media errors
    bufferAddCodecsError:
      "The browser rejected the codec configuration. " +
      "The video may use an unsupported codec (e.g. HEVC on Chrome).",
    bufferAppendError:
      "hls.js failed to append a decoded segment to the Media Source buffer. " +
      "This can happen if the browser's MSE buffer is full or the data is malformed.",
    bufferStalledError: "Playback stalled — no new segments could be buffered.",
    bufferFullError: "The Media Source buffer is full.",
    bufferSeekOverHole:
      "There is a gap in the buffered media timeline — hls.js is attempting to skip over it.",

    // Internal errors
    internalException:
      "hls.js threw an internal exception. See error.message above for details.",
    remuxAllocError: "hls.js ran out of memory while remuxing a segment.",
  };

  return explanations[details] ?? null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for attaching HLS playback to a video element.
 * Features:
 * - Native HLS for Safari/iOS
 * - hls.js for Chrome/Firefox/Edge
 * - Automatic fallback detection
 * - Cleanup on unmount
 * - Rich diagnostic logging to aid debugging of CDN/transcoding issues
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

        // ------------------------------------------------------------------
        // Step 1: Pre-flight probe — fetch the manifest URL ourselves before
        // handing it to hls.js so we can give precise, actionable diagnostics
        // for the most common failure modes (404, 202, CORS, non-M3U8 body).
        // This runs regardless of the `debug` flag because it gates whether
        // we should even bother initialising hls.js.
        // ------------------------------------------------------------------
        console.log(
          `${TAG} Probing master playlist URL before HLS initialisation…\n  URL: ${masterPlaylistUrl}`,
        );

        const probe = await probeUrl(masterPlaylistUrl);
        const diagnosis = interpretProbe(masterPlaylistUrl, probe);

        if (!mounted) return;

        if (!probe.ok) {
          // Always log failures at the error level — these are the most common
          // reason videos are broken and they are completely silent otherwise.
          console.error(
            `${TAG} Master playlist pre-flight check FAILED:\n${diagnosis}`,
          );
          updateState(
            "error",
            `Master playlist unreachable (HTTP ${probe.status ?? "network error"}): ${masterPlaylistUrl}`,
          );
          return;
        }

        // Warn (not error) if the body doesn't look like M3U8 — hls.js will
        // fail shortly after but at least the developer sees *why*.
        const isM3u8Body = probe.bodyPreview?.trimStart().startsWith("#EXTM3U");
        const isM3u8ContentType =
          probe.contentType?.includes("mpegurl") ||
          probe.contentType?.includes("x-mpegURL");

        if (!isM3u8Body && !isM3u8ContentType) {
          console.warn(
            `${TAG} Master playlist pre-flight check PASSED (HTTP ${probe.status}) ` +
              `but the response does not look like valid HLS:\n${diagnosis}`,
          );
        } else {
          console.log(
            `${TAG} Master playlist pre-flight check passed (HTTP ${probe.status}).\n${diagnosis}`,
          );
        }

        // ------------------------------------------------------------------
        // Step 2: Attach HLS
        // ------------------------------------------------------------------

        // Native HLS does not expose a quality-selection API. Give it the
        // highest advertised media playlist directly so it cannot restart its
        // adaptive ladder at the lowest rendition on every loop.
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          const highestQualityVariantUrl = getHighestQualityVariantUrl(
            masterPlaylistUrl,
            probe.bodyText,
          );
          const nativeSourceUrl =
            highestQualityVariantUrl ?? masterPlaylistUrl;

          console.log(
            `${TAG} Using native HLS support.\n` +
              `  Source URL      : ${nativeSourceUrl}\n` +
              `  Quality pinned  : ${highestQualityVariantUrl ? "highest advertised rendition" : "no variant metadata available"}`,
          );
          video.src = nativeSourceUrl;

          // Listen for native media errors so they're surfaced even on Safari.
          const handleNativeError = () => {
            const me = video.error;
            if (me) {
              const nativeErrorCodes: Record<number, string> = {
                1: "MEDIA_ERR_ABORTED — fetch was aborted by the user",
                2: "MEDIA_ERR_NETWORK — network error during playback",
                3: "MEDIA_ERR_DECODE — decoding error (corrupt data or unsupported codec)",
                4: "MEDIA_ERR_SRC_NOT_SUPPORTED — the URL or format is not supported",
              };
              const readable = nativeErrorCodes[me.code] ?? `code ${me.code}`;
              console.error(
                `${TAG} Native HLS media error:\n` +
                  `  code    : ${readable}\n` +
                  `  message : ${me.message || "(none)"}\n` +
                  `  url     : ${nativeSourceUrl}`,
              );
            }
          };
          video.addEventListener("error", handleNativeError, { once: true });

          if (mounted) {
            updateState("ready");
          }
          return;
        }

        // Dynamic import hls.js
        const HlsModule = await import("hls.js");
        const Hls = HlsModule.default;

        if (!Hls.isSupported()) {
          console.error(
            `${TAG} HLS is not supported in this browser.\n` +
              `  Neither native HLS (Safari) nor Media Source Extensions (MSE) are available.\n` +
              `  Consider providing a fallbackSrc (progressive MP4) for these users.`,
          );
          if (mounted) {
            updateState("error", "HLS not supported in this browser");
          }
          return;
        }

        console.log(
          `${TAG} Using hls.js (MSE path).\n` +
            `  hls.js version : ${(Hls as unknown as { version?: string }).version ?? "unknown"}\n` +
            `  userAgent      : ${navigator.userAgent}`,
        );

        hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Load the manifest first so the opening fragment can be selected
          // from the highest-resolution variant before playback begins.
          autoStartLoad: false,
          // hls.js otherwise downloads the lowest-level fragment as a bandwidth
          // test. That pixelated fragment is retained and replayed on every loop.
          testBandwidth: false,
          // Surface more detail in debug mode
          debug: !!debug,
        });

        // ---- Event: media attached ----
        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log(`${TAG} hls.js media attached to video element.`);
        });

        // ---- Event: manifest parsed ----
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          const d = data as unknown as {
            levels?: HlsQualityLevel[];
            firstLevel?: number;
            audioTracks?: unknown[];
            subtitleTracks?: unknown[];
          };
          const levels = d.levels ?? [];
          const highestQualityLevel = getHighestQualityLevelIndex(levels);

          console.log(
            `${TAG} Manifest parsed successfully.\n` +
              `  URL            : ${masterPlaylistUrl}\n` +
              `  Levels (quality variants) : ${levels.length}\n` +
              `  First level    : ${d.firstLevel ?? "(unknown)"}\n` +
              `  Startup level  : ${highestQualityLevel >= 0 ? highestQualityLevel : "(automatic)"}\n` +
              `  Audio tracks   : ${d.audioTracks?.length ?? 0}\n` +
              `  Subtitle tracks: ${d.subtitleTracks?.length ?? 0}`,
          );

          if (!mounted || !hlsInstance) {
            return;
          }

          if (highestQualityLevel >= 0) {
            hlsInstance.startLevel = highestQualityLevel;
          }

          // startLevel only affects the opening fragment. Subsequent fragments
          // continue to use hls.js adaptive bitrate selection.
          hlsInstance.startLoad();
        });

        // ---- Event: level loaded (variant playlist) ----
        hlsInstance.on(Hls.Events.LEVEL_LOADED, (_evt, data) => {
          if (!debug) return;
          const d = data as unknown as {
            level?: number;
            details?: {
              url?: string;
              totalduration?: number;
              fragments?: unknown[];
            };
          };
          console.log(
            `${TAG} Variant playlist loaded.\n` +
              `  Level          : ${d.level ?? "(unknown)"}\n` +
              `  Playlist URL   : ${d.details?.url ?? "(unknown)"}\n` +
              `  Duration       : ${d.details?.totalduration ?? "(unknown)"}s\n` +
              `  Fragments      : ${d.details?.fragments?.length ?? "(unknown)"}`,
          );
        });

        // ---- Event: fragment loaded ----
        hlsInstance.on(Hls.Events.FRAG_LOADED, (_evt, data) => {
          if (!debug) return;
          const d = data as unknown as {
            frag?: {
              url?: string;
              sn?: unknown;
              level?: unknown;
              duration?: number;
            };
            networkDetails?: unknown;
          };
          console.log(
            `${TAG} Fragment loaded.\n` +
              `  URL            : ${d.frag?.url ?? "(unknown)"}\n` +
              `  SN             : ${d.frag?.sn ?? "?"} | level: ${d.frag?.level ?? "?"}\n` +
              `  Duration       : ${d.frag?.duration ?? "?"}s`,
          );
        });

        // A high-quality opening fragment is now appended and available for
        // playback. Until this point an autoplaying video keeps its poster (when
        // supplied) or remains on its unloaded frame instead of showing the
        // lowest-quality bandwidth-test fragment.
        let hasBufferedOpeningFragment = false;
        hlsInstance.on(Hls.Events.FRAG_BUFFERED, (_evt, data) => {
          if (hasBufferedOpeningFragment) return;

          const d = data as unknown as {
            frag?: {
              type?: string;
            };
          };

          if (d.frag?.type && d.frag.type !== "main") {
            return;
          }

          hasBufferedOpeningFragment = true;
          if (mounted) {
            updateState("ready");
          }
        });

        // ---- Event: level switched ----
        hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
          if (!debug) return;
          console.log(
            `${TAG} Quality level switched to: ${(data as unknown as { level?: number }).level ?? "?"}`,
          );
        });

        // ---- Event: error ----
        hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
          const d = data as unknown as Record<string, unknown>;
          const details = d.details as string | undefined;
          const explanation = explainHlsErrorDetails(details);
          const formatted = formatHlsError(d);

          if (d.fatal) {
            // Fatal errors are always logged — they directly cause playback failure.
            console.error(
              `${TAG} Fatal HLS error — playback cannot continue.\n` +
                formatted +
                (explanation ? `\n  diagnosis        : ${explanation}` : ""),
            );

            // Extra hint: if this is a manifest or network error, re-probe the
            // URL so the developer gets a fresh, post-error status code check.
            if (
              details === "manifestLoadError" ||
              details === "manifestLoadTimeOut" ||
              details === "levelLoadError"
            ) {
              const targetUrl =
                ((d.response as Record<string, unknown> | undefined)
                  ?.url as string) || masterPlaylistUrl;

              probeUrl(targetUrl)
                .then((reProbe) => {
                  const reDiagnosis = interpretProbe(targetUrl, reProbe);
                  console.error(
                    `${TAG} Re-probe of failed URL (post-error):\n${reDiagnosis}`,
                  );
                })
                .catch(() => {
                  // suppress — best-effort
                });
            }

            if (mounted) {
              updateState(
                "error",
                `HLS error: ${details ?? d.type ?? "unknown"}`,
              );
            }
            hlsInstance?.destroy();
            hlsInstance = null;
          } else {
            // Non-fatal: always warn (not just in debug mode) so developers
            // can see recovery-level issues in normal console output.
            console.warn(
              `${TAG} Non-fatal HLS error (hls.js will attempt recovery).\n` +
                formatted +
                (explanation ? `\n  diagnosis        : ${explanation}` : ""),
            );
          }
        });

        hlsInstance.loadSource(masterPlaylistUrl);
        hlsInstance.attachMedia(video);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          `${TAG} Unexpected error during HLS setup:\n` +
            `  message : ${errorMessage}\n` +
            `  url     : ${masterPlaylistUrl}`,
          err,
        );
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
