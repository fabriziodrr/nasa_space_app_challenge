import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 15.5's experimental segment explorer can produce a stale client
  // manifest during development; it is unrelated to the application UI.
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
