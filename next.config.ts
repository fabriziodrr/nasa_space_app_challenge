import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // Next 15.5's experimental segment explorer can produce a stale client
  // manifest during development; it is unrelated to the application UI.
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
