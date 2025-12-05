import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  serverExternalPackages: ["better-auth"],
  experimental: {
    turbopackFileSystemCacheForBuild: true,
    turbopackFileSystemCacheForDev: true,
    turbopackUseSystemTlsCerts: true,
  },

  rewrites: async () => {
    return [
      {
        source: "/api/:path((?!auth).*)*",
        destination: `${process.env.SERVER_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
