/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deixe NEXT_OUTPUT_MODE=standalone no .env se for rodar via Docker
  // (gera um bundle self-contained em .next/standalone).
  output: process.env.NEXT_OUTPUT_MODE || undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
