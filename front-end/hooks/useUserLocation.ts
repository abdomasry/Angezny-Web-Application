'use client'

// useUserLocation — wraps the browser's navigator.geolocation API for the
// "Nearest" filter on /providers and any other geo-aware feature later.
//
// Design choices (performance + UX):
//   - We do NOT auto-prompt on mount. The browser permission dialog is
//     intrusive; we only ask when the user explicitly opts in (clicks
//     "الأقرب إليك" or a "use my location" button).
//   - Successful coords are cached in localStorage with a 24-hour TTL.
//     A returning visitor on the same day does not re-prompt — we read
//     the cache and they're instantly back to seeing nearest results.
//   - We do NOT call any geocoding API here. We only need lng/lat for the
//     `$geoNear` query — the human address is irrelevant on the customer
//     side. Reverse-geocoding (Nominatim) is reserved for the worker
//     address picker, where it runs once on confirm and the result is
//     persisted server-side.
//
// Status machine:
//   "idle"        → never asked yet, no cache hit
//   "cached"      → coords loaded from a previous session (still fresh)
//   "requesting"  → permission prompt + GPS fix in progress (show skeleton)
//   "granted"     → coords just obtained from the browser
//   "denied"      → user clicked "Block" (or browser refused)
//   "unavailable" → no geolocation API at all (very old browser / SSR)

import { useCallback, useEffect, useState } from 'react'

export type GeoStatus =
  | 'idle'
  | 'cached'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'

export interface UserCoords {
  lat: number
  lng: number
  // Epoch ms of when the fix was taken — used to expire the cache.
  takenAt: number
}

const CACHE_KEY = 'mycoursesnow.userLocation.v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Read cache; return null if absent, malformed, or expired.
const readCache = (): UserCoords | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserCoords
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      typeof parsed.takenAt !== 'number'
    ) return null
    if (Date.now() - parsed.takenAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

const writeCache = (coords: UserCoords) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(coords))
  } catch {
    // Quota / private mode — non-fatal, just don't cache.
  }
}

const clearCache = () => {
  try { window.localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

export function useUserLocation() {
  const [coords, setCoords] = useState<UserCoords | null>(null)
  const [status, setStatus] = useState<GeoStatus>('idle')

  // On mount, check the cache so we don't re-prompt on every page load.
  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setCoords(cached)
      setStatus('cached')
    } else if (typeof window !== 'undefined' && !('geolocation' in navigator)) {
      setStatus('unavailable')
    }
  }, [])

  // Triggered by user action — opens the browser permission prompt.
  // `highAccuracy: true` is intended for cases where the user is choosing a
  // physical pin (the address picker on /profile). For coarse use cases
  // like "nearest worker" the default low-accuracy fix is enough and
  // saves battery.
  const request = useCallback((options?: { highAccuracy?: boolean }): Promise<UserCoords | null> => {
    const highAccuracy = options?.highAccuracy === true
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        setStatus('unavailable')
        resolve(null)
        return
      }

      setStatus('requesting')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: UserCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            takenAt: Date.now(),
          }
          // Only persist coarse fixes — a high-accuracy fix is meant for
          // a single address-picking moment and we don't want it to
          // overwrite what a future "nearest worker" lookup will reuse
          // (its data may be stale by tomorrow when the user travels).
          if (!highAccuracy) writeCache(next)
          setCoords(next)
          setStatus('granted')
          resolve(next)
        },
        () => {
          // Permission denied OR position unavailable OR timeout — collapse
          // to a single 'denied' state for the UI. We don't differentiate
          // because the user-facing message is the same: "we need location".
          setStatus('denied')
          resolve(null)
        },
        {
          enableHighAccuracy: highAccuracy,
          // High-accuracy fixes can take up to ~20s on mobile (GPS warm-up).
          timeout: highAccuracy ? 20_000 : 10_000,
          // Bypass any cached fix when we explicitly asked for high accuracy.
          maximumAge: highAccuracy ? 0 : 60_000,
        },
      )
    })
  }, [])

  // Manual reset — used if the user wants to re-share or revoke their
  // current pin (e.g. they moved cities).
  const reset = useCallback(() => {
    clearCache()
    setCoords(null)
    setStatus('idle')
  }, [])

  return { coords, status, request, reset }
}
