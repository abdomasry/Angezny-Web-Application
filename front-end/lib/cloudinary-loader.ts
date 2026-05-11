// =============================================================================
// Cloudinary loader for next/image
// =============================================================================
// Custom loaders let next/image rewrite the src to fetch a transformed
// version of the asset. We slot:
//   f_auto   — let Cloudinary pick webp/avif/jpeg based on the browser
//   q_auto   — pick the lowest quality that still looks good
//   w_<n>    — resize to the device-appropriate width
//   c_limit  — never upscale; stop at the original's width if the request
//              asks for more (avoids a fuzzy 800px hero made from a 400px file)
//
// A 1.4 MB iPhone JPEG dropped through this loader typically becomes a ~50 KB
// AVIF when served — that's the whole point of doing this.
// =============================================================================

import type { ImageLoaderProps } from 'next/image'

export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  // Only intercept Cloudinary hosts. If a worker uploaded an avatar via a
  // social-login flow (Google/Facebook), its src will pass through unchanged.
  // Next will then refuse it unless its hostname is in remotePatterns — which
  // is why we keep a plain <img> fallback in CloudinaryImage for non-CDN srcs.
  if (!src.includes('res.cloudinary.com') || !src.includes('/upload/')) {
    return src
  }

  // Quality: numeric (1–100) or "auto". Cloudinary accepts both.
  const q = typeof quality === 'number' ? `q_${quality}` : 'q_auto'
  const transforms = ['f_auto', q, `w_${width}`, 'c_limit'].join(',')

  // Cloudinary URLs follow the shape:
  //   https://res.cloudinary.com/<cloud>/image/upload/<transforms>/<rest>
  // We splice our transforms in immediately after /upload/. If a URL already
  // has transforms there (rare — uploads from /auto/upload don't), we still
  // prepend ours so the browser-format pick wins.
  return src.replace('/upload/', `/upload/${transforms}/`)
}
