import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin — points at the request-config file so the server knows
// where to look up the active locale + messages bundle for each request.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder. Without this, Next 16 / Turbopack
  // walks up the tree looking for the closest package.json + package-lock.json
  // pair. Because there's a stray package.json at the project's parent
  // directory, Next was inferring THAT as the workspace root and looking for
  // node_modules (tailwindcss, etc.) one level too high — which broke module
  // resolution and caused the dev server to spin until V8 OOMed during cache
  // deserialization. Pinning here makes Next ignore the parent lockfile.

  // Allow next/image to optimize images served from Cloudinary (where chat
  // attachments, avatars, portfolio shots, and license documents all live).
  // The custom loader in lib/cloudinary-loader.ts adds f_auto/q_auto/width
  // transformations to each request, so the browser gets the smallest
  // suitable format and resolution instead of the full-size original.
  //
  // Non-Cloudinary remote URLs aren't whitelisted here on purpose — components
  // that may render arbitrary external URLs use plain <img> as a graceful
  // fallback.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
