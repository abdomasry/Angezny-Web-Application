'use client'

// AddressPicker — modal that lets a user pick a point on a map and confirm
// it as an address. Used by the customer profile's address form.
//
// Performance design:
//   • Leaflet itself is imported via next/dynamic({ ssr: false }) so it does
//     NOT ship in the initial bundle. The chunk loads only when the modal
//     opens. Outside of this modal, the rest of the app pays nothing.
//   • Reverse-geocoding (Nominatim) runs ONLY when the user clicks "تأكيد"
//     — not on drag, not on click. This respects Nominatim's 1 req/s
//     rate limit and avoids spam-firing while the user adjusts the pin.
//   • The result is returned via onConfirm(); the parent persists it
//     server-side, so on subsequent renders the address fields come back
//     from our DB, never from Nominatim.
//
// Props:
//   open       — controls visibility
//   initial    — pin to start with (existing edit) OR null (fresh add)
//   onConfirm  — fires with the chosen {lat, lng, address?, city?, area?}
//   onClose    — fires on cancel / backdrop / Escape

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, MapPin, X, Crosshair, Search } from 'lucide-react'
import { useUserLocation } from '@/hooks/useUserLocation'

// Lazy-loaded — Leaflet code lands in the browser only on first open.
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  ),
})

export interface PickedAddress {
  lat: number
  lng: number
  // Optional reverse-geocoded fields. Present only when the lookup
  // succeeded (Nominatim was reachable & returned something useful).
  address?: string
  city?: string
  area?: string
}

interface Props {
  open: boolean
  initial?: { lat: number; lng: number } | null
  onConfirm: (picked: PickedAddress) => void
  onClose: () => void
}

// One result from Nominatim's forward-search endpoint. We only keep the
// fields the dropdown needs — the full response has a lot more.
interface SearchResult {
  display_name: string
  lat: string
  lon: string
  place_id: number
}

// Forward-geocode (search by name) through Nominatim. Wired to the search
// box at the top of the picker. Returns up to 5 candidates so the user
// can pick the right one when several places share a name.
//
// Rate-limit etiquette: this fires on submit (Enter / button click) only,
// not on every keystroke — we don't want to hammer the public endpoint.
async function searchPlaces(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5&accept-language=ar&addressdetails=0`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// Reverse-geocode a single point through Nominatim (free, public).
// Called at most once per "تأكيد" click. We respect their ToS by:
//   • passing accept-language so we get Arabic where available
//   • not setting a custom User-Agent — browsers block that header anyway,
//     and Nominatim's public CDN is the right surface for browser callers
//   • giving up silently on any failure: the user can still type fields
async function reverseGeocode(lat: number, lng: number): Promise<{
  address?: string; city?: string; area?: string
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      // Browsers attach their own User-Agent / Referer which Nominatim
      // accepts. No custom headers needed.
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address || {}
    // Nominatim returns many possible keys for "city" — fall back through
    // them in decreasing specificity. Same for the neighborhood/area.
    const city = a.city || a.town || a.village || a.municipality || a.county || ''
    const area = a.suburb || a.neighbourhood || a.quarter || a.district || a.city_district || ''
    return {
      address: data.display_name || '',
      city,
      area,
    }
  } catch {
    return null
  }
}

export default function AddressPicker({ open, initial, onConfirm, onClose }: Props) {
  const { coords: cachedCoords, status: geoStatus, request: requestLocation } = useUserLocation()

  // Current pin. Starts at:
  //   1. the initial prop (when editing an existing address)
  //   2. the cached browser location (returning visitor)
  //   3. null (no pin yet — user must click on the map or hit "use my location")
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    initial ?? (cachedCoords ? { lat: cachedCoords.lat, lng: cachedCoords.lng } : null),
  )
  const [confirming, setConfirming] = useState(false)

  // ─── Search-box state ───────────────────────────────────────────
  // The dropdown is closed until the user submits and we get results.
  // Outside-click closes it without disturbing the pin.
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!resultsOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setResultsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [resultsOpen])

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim() || searching) return
    setSearching(true)
    const results = await searchPlaces(searchQuery)
    setSearchResults(results)
    setResultsOpen(true)
    setSearching(false)
  }

  // Picking a search result moves the pin (and recenters the map via the
  // MapBootstrap effect). Reverse-geocoding still happens on confirm so
  // the address fields auto-fill from the actual chosen point.
  const pickResult = (r: SearchResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setPin({ lat, lng })
    setResultsOpen(false)
    setSearchQuery(r.display_name)
  }

  // When the modal opens, get the user a precise pin to start from. The
  // address picker is the one place where accuracy matters a lot — coarse
  // IP-based fixes can be tens of km off, which produced the "wrong
  // location" we saw in the wild. Always do a fresh high-accuracy request
  // here, even when we have a coarse cached fix from a previous "Nearest"
  // listing call. The user can still drag the pin afterwards.
  useEffect(() => {
    if (!open) return
    if (pin) return
    if (cachedCoords) {
      // Render a placeholder pin immediately so the map has something to
      // center on, but kick off a high-accuracy refresh in the background.
      setPin({ lat: cachedCoords.lat, lng: cachedCoords.lng })
    }
    requestLocation({ highAccuracy: true }).then(c => {
      if (c) setPin({ lat: c.lat, lng: c.lng })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Esc to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleUseMyLocation = async () => {
    // High-accuracy + cache bypass — this is an explicit "where am I right
    // now" tap, so the user expects a fresh GPS-grade fix rather than
    // whatever stale low-accuracy reading might be cached.
    const c = await requestLocation({ highAccuracy: true })
    if (c) setPin({ lat: c.lat, lng: c.lng })
  }

  const handleConfirm = async () => {
    if (!pin) return
    setConfirming(true)
    // Single Nominatim call at confirm time only. If it fails, we still
    // pass the coords through — the user can fill the text fields manually.
    const reverse = await reverseGeocode(pin.lat, pin.lng)
    setConfirming(false)
    onConfirm({
      lat: pin.lat,
      lng: pin.lng,
      ...(reverse || {}),
    })
  }

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
            تحديد الموقع على الخريطة
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

        {/* Search bar — forward-geocode via Nominatim. Submits on Enter or
            on the search button. Results appear as a dropdown; clicking one
            moves the pin to that place. We don't fire on every keystroke
            (Nominatim's public endpoint is rate-limited at ~1 req/s). */}
        <div ref={searchBoxRef} className="relative px-5 py-3 border-b border-outline-variant/20">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setResultsOpen(true)}
              placeholder="ابحث عن عنوان (مثال: المعادي، القاهرة)"
              className="w-full bg-surface-container-low rounded-xl pr-4 pl-12 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none text-right"
            />
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-primary text-on-primary disabled:opacity-40 hover:bg-primary-container transition-colors"
              aria-label="بحث"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </form>

          {/* Results dropdown — absolutely positioned over the map area below
              so it doesn't push the map down. z-401 to sit above Leaflet's
              floating "موقعي الحالي" button (z-400). */}
          {resultsOpen && (
            <div className="absolute z-401 left-5 right-5 top-full mt-1 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/20 max-h-64 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="p-3 text-xs text-on-surface-variant text-center">
                  لا توجد نتائج.
                </p>
              ) : (
                searchResults.map(r => (
                  <button
                    key={r.place_id}
                    type="button"
                    onClick={() => pickResult(r)}
                    className="w-full text-right px-3 py-2.5 text-sm hover:bg-surface-container-low transition-colors flex items-start gap-2 border-b border-outline-variant/10 last:border-0"
                  >
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="flex-1 line-clamp-2">{r.display_name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Status strip — reuses the same trio of states the listing uses */}
        {geoStatus === 'requesting' && !pin && (
          <div className="px-5 py-3 bg-surface-container-low text-sm text-on-surface-variant flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            جاري الحصول على موقعك...
          </div>
        )}
        {geoStatus === 'denied' && !pin && (
          <div className="px-5 py-3 bg-error-container/40 text-sm text-on-error-container">
            تم رفض الوصول إلى الموقع — يمكنك النقر على الخريطة لتحديد العنوان يدوياً.
          </div>
        )}

        {/* Map — explicit pixel height so Leaflet's container measurement
            never lands on 0×0 (which is what produces the famous "blank map"
            inside flex/animated modals). LeafletMap absolutely positions
            itself inside this box. */}
        <div className="relative w-full" style={{ height: '500px' }}>
          <LeafletMap
            position={pin}
            onChange={setPin}
          />
          {/* Floating "use my location" button on top of the map */}
          <button
            type="button"
            onClick={handleUseMyLocation}
            className="absolute top-3 right-3 z-400 bg-surface-container-lowest text-on-surface px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-bold hover:bg-surface-container-high"
            title="موقعي الحالي"
          >
            <Crosshair className="w-4 h-4 text-primary" />
            موقعي الحالي
          </button>
        </div>

        {/* Footer with the chosen coords + action buttons */}
        <div className="p-5 border-t border-outline-variant/20 space-y-3">
          {pin ? (
            <p className="text-xs text-on-surface-variant text-center">
              النقطة المختارة: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              <span className="block mt-1">يمكنك سحب الدبوس أو النقر في أي مكان على الخريطة لتعديله</span>
            </p>
          ) : (
            <p className="text-xs text-on-surface-variant text-center">
              انقر على الخريطة لاختيار موقعك
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!pin || confirming}
              className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري التأكيد...
                </>
              ) : 'تأكيد الموقع'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="flex-1 bg-surface-container-low py-3 rounded-xl font-bold disabled:opacity-40"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
