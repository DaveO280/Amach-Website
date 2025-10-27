/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    ADMIN_APP: "true",
  },
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: 'http://localhost:3000/api/:path*', // Proxy to main app API
  //     },
  //   ];
  // },
};

module.exports = nextConfig;
