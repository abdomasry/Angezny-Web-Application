'use client'

// LocationViewer — read-only map modal. Used by the worker dashboard to
// preview where an order's pin actually is, so they can plan how to get
// there. Reuses the same lazy-loaded LeafletMap as the picker, with its
// new `readonly` prop locking the pin in place.
//
// Performance: still next/dynamic({ ssr: false }), so opening this modal
// is the only thing that fetches the Leaflet chunk. The dashboard's
// initial bundle stays untouched.

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, MapPin, X, ExternalLink } from 'lucide-react'

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  ),
})

interface Props {
  open: boolean
  lat: number
  lng: number
  // Optional human-readable address — shown above the map if present.
  address?: string
  onClose: () => void
}

export default function LocationViewer({ open, lat, lng, address, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Hand off to a real map app (Google Maps, etc.) for turn-by-turn
  // navigation — this modal is just for "where is it" not "how to get there".
  // We use a generic geo: URL on mobile / Google Maps on desktop for max
  // compatibility.
  const externalHref = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            موقع الطلب على الخريطة
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-container-high"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Optional address row */}
        {address && (
          <div className="px-5 py-3 border-b border-outline-variant/20 text-sm text-on-surface-variant text-right">
            {address}
          </div>
        )}

        {/* Read-only map */}
        <div className="relative w-full" style={{ height: '500px' }}>
          <LeafletMap
            position={{ lat, lng }}
            onChange={() => { /* readonly */ }}
            readonly
          />
        </div>

        {/* Footer — coords + open-in-maps */}
        <div className="p-5 border-t border-outline-variant/20 flex items-center justify-between gap-3">
          <p className="text-xs text-on-surface-variant">
            الإحداثيات: {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <a
            href={externalHref}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-container transition-colors flex items-center gap-2"
          >
            فتح في خرائط جوجل
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
