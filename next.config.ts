import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.120.1.231'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
