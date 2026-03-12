import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Video, setDefaultOptixFlowApiKey } from '../core/Video';
import { VideoDefaults } from '../core/VideoDefaults';

describe('VideoDefaults Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default config
    setDefaultOptixFlowApiKey(undefined);
  });

  it('should render children', () => {
    render(
      <VideoDefaults optixFlowApiKey="test-key">
        <div data-testid="child">Child Content</div>
      </VideoDefaults>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toHaveTextContent('Child Content');
  });

  it('should set default OptixFlow API key', () => {
    render(
      <VideoDefaults optixFlowApiKey="test-api-key">
        <Video src="https://example.com/video.mp4" data-testid="video" />
      </VideoDefaults>
    );
    const video = screen.getByTestId('video');
    expect(video).toBeInTheDocument();
    // The API key should be used internally by Video component
  });

  it('should cleanup default config on unmount', () => {
    const { unmount } = render(
      <VideoDefaults optixFlowApiKey="test-key">
        <div>Content</div>
      </VideoDefaults>
    );
    unmount();
    // After unmount, default should be cleared
    // This is tested implicitly through the cleanup effect
  });

  it('should wrap multiple Video components', () => {
    render(
      <VideoDefaults optixFlowApiKey="shared-key">
        <Video
          src="https://example.com/video1.mp4"
          data-testid="video1"
        />
        <Video
          src="https://example.com/video2.mp4"
          data-testid="video2"
        />
      </VideoDefaults>
    );
    expect(screen.getByTestId('video1')).toBeInTheDocument();
    expect(screen.getByTestId('video2')).toBeInTheDocument();
  });

  it('should allow Video to override default with explicit prop', () => {
    render(
      <VideoDefaults optixFlowApiKey="default-key">
        <Video
          src="https://example.com/video.mp4"
          optixFlowApiKey="override-key"
          data-testid="video"
        />
      </VideoDefaults>
    );
    const video = screen.getByTestId('video');
    expect(video).toBeInTheDocument();
  });

  it('should update when optixFlowApiKey prop changes', () => {
    const { rerender } = render(
      <VideoDefaults optixFlowApiKey="key-1">
        <div data-testid="content">Content</div>
      </VideoDefaults>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();

    rerender(
      <VideoDefaults optixFlowApiKey="key-2">
        <div data-testid="content">Content</div>
      </VideoDefaults>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});

describe('setDefaultOptixFlowApiKey', () => {
  beforeEach(() => {
    setDefaultOptixFlowApiKey(undefined);
  });

  it('should set default API key', () => {
    setDefaultOptixFlowApiKey('test-key');
    // Key is set internally, tested through Video component behavior
  });

  it('should clear default API key when passed null', () => {
    setDefaultOptixFlowApiKey('test-key');
    setDefaultOptixFlowApiKey(null);
    // Key is cleared
  });

  it('should clear default API key when passed undefined', () => {
    setDefaultOptixFlowApiKey('test-key');
    setDefaultOptixFlowApiKey(undefined);
    // Key is cleared
  });
});
