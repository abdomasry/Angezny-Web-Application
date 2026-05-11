'use client'

// LeafletMap — the actual map widget. Imported ONLY via next/dynamic
// (ssr: false) by AddressPicker.tsx so its ~50 KB of JS + CSS lands in the
// browser only when the user opens the picker. This keeps it off every
// other page's bundle.
//
// What this component does:
//   • Renders a Leaflet map centered on the current pin (or a default).
//   • Shows a draggable marker at that pin.
//   • Fires onChange({lng, lat}) when the marker is dragged or the map is
//     clicked. Reverse-geocoding is NOT done here — the parent decides
//     when (and whether) to call Nominatim, since the rate limit means we
//     should call once on confirm, not on every drag.
//
// We import leaflet's CSS at module scope so it's bundled with this chunk.

// NOTE: leaflet's CSS is imported globally in app/globals.css — kept out of
// this lazy chunk to reduce the CSS chunk graph the dev server has to
// maintain (it was contributing to cache deserialization OOMs).
import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'

// Leaflet's default marker icons reference image files via relative paths
// that don't resolve when bundled by Next. Re-point them to the CDN copies
// once at module load — otherwise the marker shows up as a broken image.
const ICON = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface Props {
  // Current pin position (lat/lng order — matches Leaflet's API, NOT GeoJSON).
  // null means "no pin yet" — we render at a default center but no marker.
  position: { lat: number; lng: number } | null
  onChange: (next: { lat: number; lng: number }) => void
  // Read-only mode — used by the worker order card. Disables marker drag
  // and ignores map clicks so the pin can't move. The map still pans/zooms
  // so the worker can explore the area around the pin.
  readonly?: boolean
}

// Default center when the user hasn't picked a pin and we don't have their
// browser location — central Cairo. The picker is a single tap away from
// "use my current location" anyway, so this fallback is rarely seen.
const DEFAULT_CENTER: [number, number] = [30.0444, 31.2357]

// Click-anywhere-to-drop-pin behavior. react-leaflet pattern — a child
// component that subscribes to map events via the useMapEvents hook.
function ClickHandler({ onChange }: { onChange: Props['onChange'] }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Forces Leaflet to re-measure its container after mount. When the map is
// rendered inside a modal that animates in, or inside a flex container
// whose height is computed lazily, Leaflet's initial size measurement
// yields 0×0 and the tile grid never paints (the famous "blank map"). We
// schedule a few invalidateSize calls after first paint to fix that, plus
// react to window resize and to the `position` prop changing (which means
// the user just clicked "موقعي الحالي" — recenter without losing zoom).
function MapBootstrap({ position }: { position: Props['position'] }) {
  const map = useMap()
  useEffect(() => {
    // Multiple ticks because the modal's CSS transition can take 100-300ms
    // depending on the browser; we want at least one fix AFTER the modal
    // is fully visible.
    const timers = [50, 200, 500].map(ms =>
      setTimeout(() => map.invalidateSize(), ms),
    )
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onResize)
    }
  }, [map])

  // When the user clicks "موقعي الحالي" the parent updates `position`
  // — recenter the map there. We don't change zoom so any panning the
  // user did before is preserved.
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng], map.getZoom())
  }, [position, map])

  return null
}

export default function LeafletMap({ position, onChange, readonly = false }: Props) {
  const center: [number, number] = useMemo(
    () => (position ? [position.lat, position.lng] : DEFAULT_CENTER),
    // We only want the initial center — recentering on every drag would
    // fight the user's panning. MapBootstrap handles "موقعي الحالي" jumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <MapContainer
      center={center}
      zoom={position ? 16 : 12}
      // Inline absolute positioning — the parent gives this layer a fixed
      // pixel height, so we anchor to all four edges to fill it. Rounded
      // corners come from the parent (overflow-hidden).
      style={{ position: 'absolute', inset: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        // OpenStreetMap tiles — free, no API key, attribution required.
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <MapBootstrap position={position} />
      {!readonly && <ClickHandler onChange={onChange} />}
      {position && (
        <Marker
          position={[position.lat, position.lng]}
          draggable={!readonly}
          icon={ICON}
          eventHandlers={readonly ? undefined : {
            dragend(e) {
              const m = e.target as L.Marker
              const ll = m.getLatLng()
              onChange({ lat: ll.lat, lng: ll.lng })
            },
          }}
        />
      )}
    </MapContainer>
  )
}
