"use client";

import React, { forwardRef } from "react";
import { VideoPlayer } from "../core/VideoPlayer.js";
import type { VideoProps } from "../types.js";

/**
 * Helper types for skin integration
 * Import from @page-speed/skins
 */
export interface VideoSkinDefinition {
  id: string;
  name: string;
  version: string;
  targets: string[];
  tokens: Record<string, string>;
  classes: Record<string, string>;
  assets?: Record<string, string>;
  description?: string;
  metadata?: any;
}

export interface VideoWithSkinProps extends VideoProps {
  /** Skin definition from @page-speed/skins */
  skin?: VideoSkinDefinition | null;
  /** Override to use native controls even when skin is provided */
  forceNativeControls?: boolean;
}

/**
 * VideoPlayer with automatic skin application
 *
 * @example
 * ```tsx
 * import { VideoWithSkin } from '@page-speed/video';
 * import { loadSkinFromJsDelivr } from '@page-speed/skins';
 *
 * const skin = await loadSkinFromJsDelivr('0.1.0', 'skins/video/linear-inspired.json');
 *
 * <VideoWithSkin
 *   src="video.mp4"
 *   skin={skin}
 * />
 * ```
 */
export const VideoWithSkin = forwardRef<HTMLVideoElement, VideoWithSkinProps>(
  function VideoWithSkin({ skin, forceNativeControls, className, style, ...videoProps }, ref) {
    // If no skin or forced native controls, render with native controls
    if (!skin || forceNativeControls) {
      return (
        <VideoPlayer
          ref={ref}
          className={className}
          style={style}
          useNativeControls
          {...videoProps}
        />
      );
    }

    // Extract skin classes and tokens
    const skinClasses = {
      container: skin.classes.container,
      video: skin.classes.video,
      controlsBar: skin.classes.controlsBar,
      playButton: skin.classes.playButton,
      timeline: skin.classes.timeline,
      timelineProgress: skin.classes.timelineProgress,
      timelineBuffered: skin.classes.timelineBuffered,
      timeText: skin.classes.timeText,
      volumeControl: skin.classes.volumeControl,
      fullscreenButton: skin.classes.fullscreenButton,
      settingsButton: skin.classes.settingsButton,
      loadingSpinner: skin.classes.loadingSpinner,
      playOverlay: skin.classes.playOverlay,
      playOverlayButton: skin.classes.playOverlayButton,
    };

    // Convert tokens to style object
    const skinStyle: Record<string, string> = {};
    Object.entries(skin.tokens).forEach(([key, value]) => {
      const cssVarName = key.startsWith("--") ? key : `--${key}`;
      skinStyle[cssVarName] = value;
    });

    // Merge user style with skin style
    const mergedStyle = { ...skinStyle, ...style };

    return (
      <VideoPlayer
        ref={ref}
        skinClasses={skinClasses}
        skinStyle={skinStyle}
        className={className}
        style={mergedStyle}
        {...videoProps}
      />
    );
  }
);

VideoWithSkin.displayName = "PageSpeedVideoWithSkin";
