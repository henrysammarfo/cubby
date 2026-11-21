import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': root,
      buffer: 'buffer',
    };
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve('buffer'),
      fs: false,
      net: false,
      tls: false,
    };
    config.experiments = { ...config.experiments, topLevelAwait: true };
    if (webpack?.ProvidePlugin) {
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
