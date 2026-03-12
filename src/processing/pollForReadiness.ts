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

export async function pollForReadiness(
  options: PollForReadinessOptions,
): Promise<boolean> {
  const {
    masterPlaylistUrl,
    maxAttempts = 30,
    intervalMs = 2000,
    debug,
  } = options;

  if (debug) {
    console.log("[pollForReadiness] Starting polling for:", masterPlaylistUrl);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(masterPlaylistUrl, { method: "HEAD" });

      if (response.ok) {
        if (debug) {
          console.log(`[pollForReadiness] Ready after ${attempt} attempts`);
        }
        return true;
      }

      if (debug) {
        console.log(`[pollForReadiness] Attempt ${attempt}/${maxAttempts}: ${response.status}`);
      }
    } catch (err) {
      if (debug) {
        console.warn(`[pollForReadiness] Attempt ${attempt}/${maxAttempts} failed:`, err);
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (debug) {
    console.warn("[pollForReadiness] Max attempts reached, playlist not ready");
  }

  return false;
}
