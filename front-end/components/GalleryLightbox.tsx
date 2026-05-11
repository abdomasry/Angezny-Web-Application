// GalleryLightbox — modal that shows a portfolio item full-screen with
// title, description, and a swipeable image carousel. Closes on backdrop
// click, ESC, or the X button. If the item has only one image, the
// carousel arrows are hidden.

'use client'

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PortfolioItem } from '@/lib/types'

interface Props {
  item: PortfolioItem | null
  onClose: () => void
}

export default function GalleryLightbox({ item, onClose }: Props) {
  const [index, setIndex] = useState(0)

  // Reset to the first image whenever a new item opens.
  useEffect(() => {
    setIndex(0)
  }, [item])

  // ESC closes; arrow keys move within the carousel.
  useEffect(() => {
    if (!item) return
    const images = item.images || []
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex(i => (i + 1) % images.length)
      if (e.key === 'ArrowLeft') setIndex(i => (i - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [item, onClose])

  if (!item) return null
  const images = item.images || []
  if (images.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-on-surface/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <h3 className="text-xl font-bold text-on-surface">{item.title || 'عمل'}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container-high flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image carousel */}
        <div className="relative flex-1 bg-surface-container-low flex items-center justify-center min-h-[300px]">
          <img
            src={images[index]}
            alt={`${item.title || 'صورة'} ${index + 1}`}
            className="max-w-full max-h-[60vh] object-contain"
          />
          {images.length > 1 && (
            <>
              {/* In RTL layouts, ChevronRight visually points "back" and
                  ChevronLeft visually points "forward". */}
              <button
                onClick={() => setIndex((index - 1 + images.length) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white shadow flex items-center justify-center"
                aria-label="السابق"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIndex((index + 1) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white shadow flex items-center justify-center"
                aria-label="التالي"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs bg-on-surface/60 text-white rounded-full px-3 py-1">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <div className="p-6 max-h-[20vh] overflow-y-auto">
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">
              {item.description}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
