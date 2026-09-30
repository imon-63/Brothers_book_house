import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle (.next/standalone) for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  compress: false, // nginx gzips in front of the app
};

export default nextConfig;
