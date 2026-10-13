import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server (`.next/standalone/server.js`) for the Docker image.
  output: "standalone",
};

export default nextConfig;
