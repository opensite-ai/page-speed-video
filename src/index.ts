// Ensure process.env exists when the module is loaded directly in the browser UMD build.
type GlobalWithProcess = typeof globalThis & { process?: NodeJS.Process };

const globalObject =
  typeof globalThis !== "undefined"
    ? (globalThis as GlobalWithProcess)
    : undefined;

if (globalObject) {
  if (!globalObject.process) {
    globalObject.process = {
      env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
    } as NodeJS.Process;
  } else {
    const env =
      globalObject.process.env ??
      (globalObject.process.env = {} as NodeJS.ProcessEnv);
    if (typeof env.NODE_ENV === "undefined") {
      env.NODE_ENV = "production";
    }
  }
}

// Core exports
export * from "./core/index.js";

// Types
export type {
  VideoProps,
  PlaybackState,
  ProcessingStrategy,
  TransformResponse,
  UseHlsOptions,
  UseHlsResult,
} from "./types.js";

// Utilities
export { getHlsMasterPlaylist } from "./transform/getHlsMasterPlaylist.js";
export type { GetHlsMasterPlaylistOptions, GetHlsMasterPlaylistResult } from "./transform/getHlsMasterPlaylist.js";

export { useHls } from "./hls/useHls.js";

export { shouldUseMp4Fallback } from "./fallback/shouldUseMp4Fallback.js";

export { pollForReadiness } from "./processing/pollForReadiness.js";
export type { PollForReadinessOptions } from "./processing/pollForReadiness.js";

export { getOptimizedPosterUrl } from "./poster/getOptimizedPosterUrl.js";
export type { GetOptimizedPosterOptions } from "./poster/getOptimizedPosterUrl.js";

// Re-export specific items for clarity and CDN usage
export { Video, VideoPlayer, setDefaultOptixFlowApiKey, VideoDefaults } from "./core/index.js";
export type { VideoDefaultsProps } from "./core/index.js";

// Skin integration helpers
export { VideoWithSkin } from "./skins/withVideoSkin.js";
export type { VideoWithSkinProps, VideoSkinDefinition } from "./skins/withVideoSkin.js";
