# @page-speed/video

Performance-optimized React Video component with HLS streaming support. Drop-in video implementation of web.dev best practices with zero configuration.

## Features

- **HLS Streaming**: Automatic adaptive bitrate streaming with hls.js
- **Native HLS**: Safari/iOS use native HLS support (no extra dependencies)
- **Progressive Fallback**: MP4 fallback for unsupported browsers
- **Transform API**: Automatic video transformation to HLS
- **Poster Optimization**: OptixFlow integration for optimized poster images
- **Processing Strategies**: Optimistic or polling for video processing
- **Tree-shakeable**: Import only what you need
- **TypeScript**: Full type safety
- **Zero Config**: Works out of the box with sensible defaults

## Installation

```bash
npm install @page-speed/video
# or
pnpm add @page-speed/video
# or
yarn add @page-speed/video
```

## Usage

### Basic Usage

```tsx
import { Video } from "@page-speed/video";

export default function MyComponent() {
  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      controls
    />
  );
}
```

### With HLS Master Playlist

```tsx
import { Video } from "@page-speed/video";

export default function MyComponent() {
  return (
    <Video
      masterPlaylistUrl="https://cdn.example.com/video/master.m3u8"
      fallbackSrc="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      controls
    />
  );
}
```

### With OptixFlow Poster Optimization

```tsx
import { Video } from "@page-speed/video";

export default function MyComponent() {
  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      optixFlowApiKey="your-api-key"
      controls
    />
  );
}
```

### Global Configuration

```tsx
import { VideoDefaults } from "@page-speed/video";

export default function App({ children }) {
  return (
    <VideoDefaults optixFlowApiKey="your-api-key">
      {children}
    </VideoDefaults>
  );
}
```

### CDN Usage (UMD)

```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@page-speed/video/dist/browser/page-speed-video.umd.js"></script>

<script>
  const { Video } = PageSpeedVideo;

  ReactDOM.render(
    React.createElement(Video, {
      src: 'https://example.com/video.mp4',
      poster: 'https://example.com/poster.jpg',
      controls: true
    }),
    document.getElementById('root')
  );
</script>
```

## API

### Video Props

Extends all native `<video>` element props, plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | - | Source video URL (progressive MP4 or for transform) |
| `masterPlaylistUrl` | `string` | - | Direct HLS master playlist URL (skips transform) |
| `fallbackSrc` | `string` | - | Fallback progressive MP4 URL if HLS fails |
| `optixFlowApiKey` | `string` | - | OptixFlow API key for poster optimization |
| `transformBaseUrl` | `string` | `https://octane.buzz` | Base URL for transform API |
| `cdnBaseUrl` | `string` | `https://octane.cdn.ing` | CDN base URL for playlist/segment serving |
| `preferNativeControls` | `boolean` | `true` | Use native video controls |
| `processingStrategy` | `"optimistic" \| "poll"` | `"optimistic"` | Video processing strategy |
| `onPlaybackStateChange` | `(state: PlaybackState) => void` | - | Callback for playback state changes |
| `debug` | `boolean` | `false` | Enable debug logging |

### Processing Strategies

- **optimistic**: Immediately attempts HLS playback (default, fastest)
- **poll**: Waits for video processing to complete before playback

### Playback States

- `idle`: No video loaded
- `loading`: Loading video/manifest
- `ready`: Ready to play
- `error`: Fatal error occurred

## Browser Support

- **Modern Browsers**: Chrome, Firefox, Edge (via hls.js)
- **Safari/iOS**: Native HLS support
- **Fallback**: Progressive MP4 for unsupported browsers

## License

BSD-3-Clause

## Author

OpenSite AI (https://opensite.ai)
