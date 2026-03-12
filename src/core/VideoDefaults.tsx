"use client";

import React, { useEffect } from "react";
import { setDefaultOptixFlowApiKey } from "./Video.js";

export interface VideoDefaultsProps {
  /** OptixFlow API key for poster optimization */
  optixFlowApiKey?: string;
  children?: React.ReactNode;
}

/**
 * VideoDefaults component allows setting default configuration for all Video components in the tree.
 * Similar to ImgDefaults in @page-speed/img.
 */
export const VideoDefaults: React.FC<VideoDefaultsProps> = ({
  optixFlowApiKey,
  children,
}) => {
  useEffect(() => {
    setDefaultOptixFlowApiKey(optixFlowApiKey);
    return () => {
      setDefaultOptixFlowApiKey(undefined);
    };
  }, [optixFlowApiKey]);

  return <>{children}</>;
};

VideoDefaults.displayName = "VideoDefaults";
