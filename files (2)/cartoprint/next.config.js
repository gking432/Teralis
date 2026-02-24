/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow loading map tiles and fonts from external domains
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'tiles.openfreemap.org' },
      { protocol: 'https', hostname: 's3.amazonaws.com' },
    ],
  },
  // Increase serverless function timeout for high-res export
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
