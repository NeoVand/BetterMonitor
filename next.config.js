/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', 
  distDir: 'dist/out', 
  images: {
    unoptimized: true, 
  },
  // Use relative paths for Electron file:// loading
  assetPrefix: './',
  basePath: '',
  transpilePackages: ['lucide-react', 'framer-motion', 'clsx', 'tailwind-merge'],
};

module.exports = nextConfig;
