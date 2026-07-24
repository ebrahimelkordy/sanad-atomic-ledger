/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@cipher/shared'],
  env: {
    NEXT_PUBLIC_API_BASE_URL: (process as any).env?.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
  },
};

export default nextConfig;

