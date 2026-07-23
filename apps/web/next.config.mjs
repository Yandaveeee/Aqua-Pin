import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development artifacts separate from production builds. Running
  // `next build` must never remove manifests used by a live dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(dirname, "..", ".."),
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/.git/**",
          "**/.next*/**",
          "**/node_modules/**",
          "**/android/**",
          "**/ios/**",
          "**/*.xlsx",
        ],
      };
    }

    return config;
  },
};

export default nextConfig;
