import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,
    turbopackFileSystemCacheForDev: true,
    turbopackUseSystemTlsCerts: true,
  },
  cacheComponents: true,
  reactCompiler: true,
};

export default nextConfig;
