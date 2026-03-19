const TAG = "[pollForReadiness]";

/**
 * Polls HLS master playlist URL until it returns 200 OK.
 * Used for "poll" processing strategy to wait for video processing to complete.
 */
export interface PollForReadinessOptions {
  /** Master playlist URL to poll */
  masterPlaylistUrl: string;
  /** Maximum attempts (default: 30) */
  maxAttempts?: number;
  /** Interval between attempts in ms (default: 2000) */
  intervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Interprets a polling response status code into a plain-English description
 * of what the video processing pipeline is likely doing. Always logged
 * regardless of the `debug` flag so that developers can see processing
 * progress in the console without enabling verbose mode.
 */
function interpretStatus(status: number): string {
  if (status === 200 || status === 206) {
    return "Playlist is ready for playback.";
  }
  if (status === 202) {
    return (
      "HTTP 202 Accepted — the video/transform job has been received but the " +
      "playlist has not been written yet. Transcoding is still in progress."
    );
  }
  if (status === 204) {
    return (
      "HTTP 204 No Content — the server acknowledged the request but returned " +
      "no body. The playlist may not have been written yet."
    );
  }
  if (status === 404) {
    return (
      "HTTP 404 Not Found — the playlist file does not exist on the CDN yet. " +
      "This is normal early in the transcoding pipeline; continuing to poll."
    );
  }
  if (status === 403) {
    return (
      "HTTP 403 Forbidden — the CDN is rejecting the request. " +
      "Check that the API key / signed URL is present and valid. " +
      "Polling will continue but this error is unlikely to resolve on its own."
    );
  }
  if (status === 401) {
    return (
      "HTTP 401 Unauthorized — authentication credentials are missing or expired. " +
      "Polling will continue but this error is unlikely to resolve on its own."
    );
  }
  if (status === 429) {
    return (
      "HTTP 429 Too Many Requests — the CDN or origin is rate-limiting polling. " +
      "Consider increasing the intervalMs option to reduce request frequency."
    );
  }
  if (status >= 500) {
    return (
      `HTTP ${status} — server-side error. The CDN or transform service is ` +
      `experiencing issues. Polling will continue in case it recovers.`
    );
  }
  return `HTTP ${status} — unexpected status code. Polling will continue.`;
}

/**
 * Extracts and formats a useful subset of response headers for diagnostic
 * logging. Focuses on headers that reveal processing state, caching,
 * content type, and retry guidance.
 */
function extractDiagnosticHeaders(headers: Headers): Record<string, string> {
  const interesting = [
    // Content / type
    "content-type",
    "content-length",
    "content-range",
    // Processing state hints (common in transcoding pipelines)
    "x-processing-status",
    "x-job-status",
    "x-transcode-status",
    "x-video-status",
    "x-task-status",
    // Retry / rate-limit guidance
    "retry-after",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    // Cache / CDN metadata
    "cache-control",
    "x-cache",
    "x-cache-status",
    "cf-cache-status", // Cloudflare
    "x-amz-cf-pop", // CloudFront
    "x-served-by", // Fastly
    "age",
    "etag",
    "last-modified",
    // CORS (useful for diagnosing access failures)
    "access-control-allow-origin",
    // Request ID for support escalation
    "x-request-id",
    "x-amzn-requestid",
    "cf-ray",
  ];

  const found: Record<string, string> = {};
  for (const name of interesting) {
    const value = headers.get(name);
    if (value !== null) {
      found[name] = value;
    }
  }
  return found;
}

/**
 * Formats a headers map into a compact multi-line string for console output.
 */
function formatHeaders(headers: Record<string, string>): string {
  const entries = Object.entries(headers);
  if (entries.length === 0) return "  (no relevant headers)";
  return entries.map(([k, v]) => `  ${k}: ${v}`).join("\n");
}

export async function pollForReadiness(
  options: PollForReadinessOptions,
): Promise<boolean> {
  const {
    masterPlaylistUrl,
    maxAttempts = 30,
    intervalMs = 2000,
    debug,
  } = options;

  console.log(
    `${TAG} Starting readiness polling.\n` +
      `  URL          : ${masterPlaylistUrl}\n` +
      `  Max attempts : ${maxAttempts}\n` +
      `  Interval     : ${intervalMs}ms\n` +
      `  Timeout      : ~${Math.round((maxAttempts * intervalMs) / 1000)}s`,
  );

  let lastStatus: number | null = null;
  let lastStatusCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(masterPlaylistUrl, {
        method: "HEAD",
        // Prevent stale CDN responses from masking the real processing state.
        headers: { "Cache-Control": "no-cache, no-store" },
      });

      const status = response.status;
      const diagHeaders = extractDiagnosticHeaders(response.headers);

      // Deduplicate consecutive identical status logs to avoid noise while
      // still logging every status change and every 5th repeated status.
      const statusChanged = status !== lastStatus;
      const isPeriodicLog = attempt % 5 === 0;

      if (statusChanged) {
        lastStatus = status;
        lastStatusCount = 1;
      } else {
        lastStatusCount++;
      }

      if (response.ok) {
        // 200 / 206 — playlist is ready.
        console.log(
          `${TAG} Playlist is READY after ${attempt} attempt${attempt === 1 ? "" : "s"}.\n` +
            `  Status       : ${status} ${response.statusText}\n` +
            `  URL          : ${masterPlaylistUrl}\n` +
            `  Headers:\n${formatHeaders(diagHeaders)}`,
        );
        return true;
      }

      // Not ready yet — log with appropriate detail level.
      if (statusChanged || isPeriodicLog || debug) {
        const statusDescription = interpretStatus(status);
        const logFn =
          status === 403 || status === 401
            ? console.error
            : status >= 500
              ? console.warn
              : console.log;

        logFn(
          `${TAG} Attempt ${attempt}/${maxAttempts} — not ready yet.\n` +
            `  Status       : ${status} ${response.statusText}\n` +
            `  Diagnosis    : ${statusDescription}\n` +
            `  URL          : ${masterPlaylistUrl}\n` +
            `  Headers:\n${formatHeaders(diagHeaders)}` +
            (!statusChanged && lastStatusCount > 1
              ? `\n  (same status repeated ${lastStatusCount}x — suppressing intermediate logs)`
              : ""),
        );
      } else if (debug) {
        console.log(
          `${TAG} Attempt ${attempt}/${maxAttempts}: HTTP ${status} (same as previous)`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // TypeError("Failed to fetch") almost always means CORS or the host
      // is completely unreachable — neither will self-resolve, so we escalate
      // these to console.error rather than console.warn.
      const isCorsOrNetworkError =
        err instanceof TypeError &&
        (msg.includes("Failed to fetch") ||
          msg.includes("NetworkError") ||
          msg.includes("CORS"));

      const logFn = isCorsOrNetworkError ? console.error : console.warn;

      logFn(
        `${TAG} Attempt ${attempt}/${maxAttempts} — fetch threw an exception.\n` +
          `  Error        : ${msg}\n` +
          `  URL          : ${masterPlaylistUrl}` +
          (isCorsOrNetworkError
            ? "\n  This looks like a CORS block or network outage. " +
              "Polling will continue but this error is unlikely to resolve on its own."
            : ""),
        err,
      );

      lastStatus = null;
      lastStatusCount = 0;
    }

    if (attempt < maxAttempts) {
      if (debug) {
        console.log(
          `${TAG} Waiting ${intervalMs}ms before attempt ${attempt + 1}/${maxAttempts}…`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.error(
    `${TAG} Readiness polling TIMED OUT after ${maxAttempts} attempts ` +
      `(~${Math.round((maxAttempts * intervalMs) / 1000)}s).\n` +
      `  URL          : ${masterPlaylistUrl}\n` +
      `  Last status  : ${lastStatus ?? "(never received a response)"}\n` +
      `  Possible causes:\n` +
      `    • The video/transform job is taking longer than expected.\n` +
      `    • The transcoding pipeline encountered an error and the job is stuck.\n` +
      `    • The video ID embedded in the URL does not match any active job.\n` +
      `    • The CDN is not propagating the playlist file after it is written.\n` +
      `  Consider increasing maxAttempts or intervalMs if transcoding is known\n` +
      `  to take longer for large or high-resolution source files.`,
  );

  return false;
}
