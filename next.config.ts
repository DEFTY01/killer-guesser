import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.turso.io",
      },
      {
        protocol: "https",
        hostname: "blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
