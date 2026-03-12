import React from 'react';
import { Video, VideoDefaults } from '@page-speed/video';

// Basic usage
export function BasicExample() {
  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      controls
    />
  );
}

// With HLS master playlist
export function HlsExample() {
  return (
    <Video
      masterPlaylistUrl="https://cdn.example.com/video/master.m3u8"
      fallbackSrc="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      controls
    />
  );
}

// With OptixFlow poster optimization
export function OptimizedPosterExample() {
  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      optixFlowApiKey="your-api-key"
      controls
    />
  );
}

// With processing strategy
export function PollingExample() {
  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      processingStrategy="poll"
      controls
    />
  );
}

// With global defaults
export function GlobalDefaultsExample() {
  return (
    <VideoDefaults optixFlowApiKey="your-api-key">
      <div>
        <Video
          src="https://example.com/video1.mp4"
          poster="https://example.com/poster1.jpg"
          controls
        />

        <Video
          src="https://example.com/video2.mp4"
          poster="https://example.com/poster2.jpg"
          controls
        />
      </div>
    </VideoDefaults>
  );
}

// With playback state callback
export function StateCallbackExample() {
  const handleStateChange = (state: 'idle' | 'loading' | 'ready' | 'error') => {
    console.log('Playback state:', state);
  };

  return (
    <Video
      src="https://example.com/video.mp4"
      poster="https://example.com/poster.jpg"
      onPlaybackStateChange={handleStateChange}
      debug
      controls
    />
  );
}

// Complete example with all options
export function CompleteExample() {
  return (
    <Video
      src="https://example.com/video.mp4"
      masterPlaylistUrl="https://cdn.example.com/video/master.m3u8"
      fallbackSrc="https://example.com/fallback.mp4"
      poster="https://example.com/poster.jpg"
      optixFlowApiKey="your-api-key"
      transformBaseUrl="https://octane.buzz"
      cdnBaseUrl="https://octane.cdn.ing"
      preferNativeControls={true}
      processingStrategy="optimistic"
      onPlaybackStateChange={(state) => console.log(state)}
      debug={false}
      controls
      autoPlay={false}
      loop={false}
      muted={false}
      playsInline
      style={{ width: '100%' }}
    />
  );
}
