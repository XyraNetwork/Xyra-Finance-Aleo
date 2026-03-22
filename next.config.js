/** @type {import('next').NextConfig} */

const path = require('path');
const webpack = require('webpack');
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: require('next-pwa/cache'),
});

// Load .env from this project root (where next.config.js lives) so server envs like RECORD_TRANSACTION_SECRET are set even when the app is run from a parent directory (e.g. workspace root).
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

const nextConfig = {
  transpilePackages: ['@provablehq/wasm', '@aleohq/wasm'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  env: {
    URL: process.env.URL,
    RECORD_TRANSACTION_SECRET:process.env.RECORD_TRANSACTION_SECRET,
    TWITTER: process.env.TWITTER,
    DISCORD: process.env.DISCORD,
    RPC_URL: process.env.RPC_URL,
  },
  reactStrictMode: true,
  ...(process.env.NODE_ENV === 'production' && {
    typescript: {
      ignoreBuildErrors: true,
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
  }),
  webpack5: true,
  webpack: (config, options) => {
    // @provablehq/wasm emits top-level-await/async in browser bundles.
    // Use a modern client target so webpack doesn't warn about async/await support.
    if (!options.isServer) {
      config.target = ['web', 'es2020'];
    }

    config.ignoreWarnings = [/Failed to parse source map/];
    const fallback = config.resolve.fallback || {};
    Object.assign(fallback, {
      stream: require.resolve('stream-browserify'),
      fs: require.resolve('browserify-fs'),
    });
    config.resolve.fallback = fallback;
    config.plugins = (config.plugins || []).concat([
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
    ]);
    const experiments = config.experiments || {};
    Object.assign(experiments, {
      asyncWebAssembly: true,
      syncWebAssembly: true,
      topLevelAwait: true,
    });
    config.experiments = experiments;
    const alias = config.resolve.alias || {};
    Object.assign(alias, {
      react$: require.resolve('react'),
    });
    config.resolve.alias = alias;
    
    // Handle nextjs bug with wasm static files
    patchWasmModuleImport(config, options.isServer);

    // Handle WASM files from @provablehq (if needed)
    config.module.rules.push({
      test: /\.wasm$/,
      include: /node_modules[\\/]@provablehq[\\/]/,
      type: 'javascript/auto',
      loader: 'file-loader',
      options: {
        esModule: false,
        name: 'static/wasm/[name].[contenthash].[ext]',
        publicPath: '/_next/',
        outputPath: '',
      },
    });
    
    // Handle WASM files from @aleohq/wasm (if needed in future)
    config.module.rules.push({
      test: /\.wasm$/,
      include: /node_modules[\\/]@aleohq[\\/]wasm/,
      type: 'javascript/auto',
      loader: 'file-loader',
      options: {
        esModule: false,
        name: 'static/wasm/[name].[contenthash].[ext]',
        publicPath: '/_next/',
        outputPath: '',
      },
    });
    
    // Ignore 'wbg' module resolution errors (common with WASM libraries)
    config.resolve.alias = {
      ...config.resolve.alias,
      wbg: false, // Disable wbg module (not needed for our use case)
    };

    return config;
  },
};

function patchWasmModuleImport(config, isServer) {
  config.experiments = Object.assign(config.experiments || {}, {
      asyncWebAssembly: true,
  });

  config.optimization.moduleIds = 'named';

  config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
  });

  // TODO: improve this function -> track https://github.com/vercel/next.js/issues/25852
  if (isServer) {
      config.output.webassemblyModuleFilename = './../static/wasm/[modulehash].wasm';
  } else {
      config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';
  }
}

module.exports = withPWA(nextConfig);