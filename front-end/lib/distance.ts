// Distance helpers shared between the services list and the public worker
// profile page. The services list usually has a server-computed `distanceKm`
// on each worker (from the $geoNear pipeline) — for everything else we
// compute haversine on the client from two GeoJSON points.

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number) => (deg * Math.PI) / 180

export interface LatLng {
  lat: number
  lng: number
}

// Great-circle distance in kilometers between two lat/lng points.
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// GeoJSON points store coordinates as [lng, lat]. This unwraps them safely;
// returns null for missing/malformed pins so callers can `if (!coords) return`.
export function coordsFromPoint(
  point?: { coordinates?: [number, number] | number[] } | null,
): LatLng | null {
  const c = point?.coordinates
  if (!Array.isArray(c) || c.length < 2) return null
  const [lng, lat] = c
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lat: lat as number, lng: lng as number }
}

// Format a distance in kilometers for display. Under 1 km we show whole
// meters ("400M"); otherwise one decimal kilometer ("3.5KM"). Tiny distances
// (< 10 m) collapse to "0M" — close enough that the exact value isn't useful.
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 1) {
    const meters = Math.round(km * 1000)
    return `${meters}M`
  }
  // One decimal, but strip the ".0" so "3.0KM" reads as "3KM".
  const rounded = Math.round(km * 10) / 10
  const text = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  return `${text}KM`
}
