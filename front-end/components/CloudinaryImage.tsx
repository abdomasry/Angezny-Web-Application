'use client'

// =============================================================================
// CloudinaryImage — drop-in <Image> wrapper that auto-uses our Cloudinary
// loader when the src points at our CDN, and falls back to a plain <img>
// for everything else.
// =============================================================================
// Why this hybrid approach:
//   - Worker / customer profile photos can come from a social-login provider
//     (Google, Facebook) whose hostnames we don't whitelist in next.config.ts.
//     Forcing those through next/image would error at request time.
//   - Cloudinary URLs benefit massively from format negotiation + sizing —
//     a 1.4 MB iPhone JPEG often shrinks to ~50 KB AVIF in transit.
//
// API mirrors next/image's <Image> as closely as possible so existing
// `<img>` call sites can migrate by changing just the tag name (and adding
// width/height OR fill for layout).
// =============================================================================

import Image, { type ImageProps } from 'next/image'
import { cloudinaryLoader } from '@/lib/cloudinary-loader'

interface Props extends Omit<ImageProps, 'loader'> {
  src: string
}

export default function CloudinaryImage({ src, alt, ...rest }: Props) {
  // If the src isn't a Cloudinary URL, render a plain <img> so we don't crash
  // on un-whitelisted hosts. The next/image optimization is only useful when
  // we know the loader can transform the URL — otherwise it's just overhead.
  const isCloudinary = typeof src === 'string' && src.includes('res.cloudinary.com')

  if (!isCloudinary) {
    // Strip out next/image-specific props that <img> doesn't understand.
    // This keeps the JSX call-site interchangeable.
    const { fill, sizes, priority, placeholder, blurDataURL, quality, loader, ...imgProps } =
      rest as Record<string, unknown>
    void fill; void sizes; void priority; void placeholder
    void blurDataURL; void quality; void loader
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ''} {...(imgProps as React.ImgHTMLAttributes<HTMLImageElement>)} />
    )
  }

  return <Image loader={cloudinaryLoader} src={src} alt={alt ?? ''} {...rest} />
}
