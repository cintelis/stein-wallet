/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The wallet is fully client-side (keys never leave the browser and there
  // are no server routes), so it ships as static files.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
