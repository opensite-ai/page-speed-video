## Build Guide A — `@page-speed/video` (Step-by-step)

### A0) Repo + package goals

1. Create repo `page-speed-video` (mirroring `page-speed-img` conventions for packaging/exports).[^1]
2. Target outputs:
    - ESM (tree-shakeable)
    - CJS (Node compatibility)
    - UMD (browser script tag)
3. Externalize heavy deps by default:
    - `react`, `react-dom` as peer deps
    - `hls.js` as a dependency *or* optional peer dependency (recommended: dependency but code-split/dynamic import so core path stays small).

### A1) Define the public API

Create `src/types.ts`:

- `VideoProps` should extend `React.VideoHTMLAttributes<HTMLVideoElement>` and add:
    - `optixFlowApiKey?: string` (used to optimize poster, and optionally transform call if needed)
    - `masterPlaylistUrl?: string`
    - `src?: string` (still from native props)
    - `fallbackSrc?: string` (progressive MP4 direct URL, optional)
    - `transformBaseUrl?: string` default `https://octane.buzz` (engine API)
    - `cdnBaseUrl?: string` default `https://octane.cdn.ing` (playlist/segment serving) if you support uuid-v5 derived URLs later
    - `preferNativeControls?: boolean` (default true: do not ship UI by default)
    - `onPlaybackStateChange?: (state) => void` (optional)
    - `debug?: boolean`


### A2) Implement transform-client utility

Create `src/transform/getHlsMasterPlaylist.ts`:

1. If `masterPlaylistUrl` is provided → return it and skip network.[^2]
2. Else require `src` URL.
3. Call `GET /api/v1/video/transform?url=...` on `transformBaseUrl`.[^2]
4. Parse JSON:
    - If `{ error: true }` handle as failure.[^2]
    - Else return `master_playlist_url` (or `master_playlist_url` naming depending on your server; doc uses `master_playlist_url`).[^2]
5. Expose returned `video_id`, `resolutions` for optional telemetry/UI.

### A3) Implement HLS attach logic (hook)

Create `src/hls/useHls.ts` largely following the engine doc’s recommended hook shape:

1. Feature detect:
    - If `Hls.isSupported()` attach via hls.js.[^3][^2]
    - Else if `video.canPlayType("application/vnd.apple.mpegurl")` set `video.src = masterPlaylistUrl`.[^10][^3]
    - Else mark unsupported.
2. Track playback state: `idle | loading | ready | error` similar to engine guide.[^2]
3. Cleanup `hls.destroy()` on unmount.

### A4) Implement progressive MP4 fallback selection

Create `src/fallback/shouldUseMp4Fallback.ts`:

- Use MP4 fallback if:

1) HLS unsupported (neither native nor hls.js), or
2) fatal HLS error occurs (manifest/level load fatal), and `fallbackSrc` exists.

```
In fallback render, still return `<video>` with `<source src={fallbackSrc} type="video/mp4" />`.
```


### A5) Poster optimization (mimic `@page-speed/img` behavior)

Because we don’t have your image transform API doc here, implement an adapter approach:

1. `poster` prop still accepted as native string.
2. If `optixFlowApiKey` provided and `poster` is a URL:
    - Call `@page-speed/img`-style helper if available in your ecosystem; otherwise provide a minimal `getOptimizedPosterUrl({ url, apiKey })` that can be swapped later.
3. Keep it optional and non-blocking: if optimization fails, fall back to original poster URL.

(Models disagree on coupling; safest: keep a tiny helper and allow consumers to pass already-optimized poster URLs.)

### A6) The `<Video />` component (must return `<video>` only)

Create `src/Video.tsx`:

1. `forwardRef<HTMLVideoElement, VideoProps>`.
2. Must `return <video ... />` as the only node.
3. Internals:
    - Compute `resolvedMasterPlaylistUrl`:
        - if `masterPlaylistUrl` provided, use it.
        - else if `src` provided, call transform endpoint in effect and store state.[^2]
    - Use `useHls(resolvedMasterPlaylistUrl)` to attach playback.[^2]
    - If unsupported or fatal → switch to MP4 fallback source if provided.
4. Props passthrough: spread native props onto `<video>` (except ones you intercept like `src`—because for HLS you may not set `src` directly except Safari/native path).
5. `controls`:
    - Default to native controls if `controls` prop true.
    - If you later provide custom controls, that must live outside this component to preserve “no wrapper.”

### A7) Add “processing latency” handling

Implement optional readiness polling:

- Option: `processingStrategy?: "optimistic" | "poll"` default optimistic.
- If `poll`, HEAD/GET the `master_playlist_url` until `200` (as engine suggests) before attaching hls.js/native source.[^2]


### A8) Exports structure

In `src/index.ts` export:

- `Video`
- `useHls`
- `getHlsMasterPlaylist`
- types

Package.json fields (pattern like `page-speed-img`):

- `"main"` CJS
- `"module"` ESM
- `"browser"` UMD (if used)
- `"exports"` map for `import`/`require` + subpath exports.


### A9) Build tooling (tree-shakeable)

- Build with rollup or tsup preserving module structure for ESM (important for tree-shaking).
- Mark `"sideEffects": false`.


### A10) Testing checklist

1. Safari: native HLS via `canPlayType` path.[^3]
2. Chrome/Firefox/Edge: hls.js path.[^11][^3]
3. Unsupported browser simulation: ensure MP4 fallback renders and can seek (requires backend range support).[^4]
4. First-time transform: validate “loading/processing” UX; ensure no crashes when playlist not ready yet.[^2]