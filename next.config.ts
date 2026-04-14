import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },

  allowedDevOrigins: [
    "http://192.168.1.24:3000",
    "http://localhost:3000",
  ],
};

export default nextConfig;