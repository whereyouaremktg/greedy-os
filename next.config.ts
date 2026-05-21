import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack to this project — silences the "multiple lockfiles detected"
  // warning when there's an unrelated lockfile higher up the filesystem.
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
