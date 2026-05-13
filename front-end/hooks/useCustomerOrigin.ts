'use client'

// useCustomerOrigin — returns the lat/lng of the customer's primary saved
// address. Used to render the "X KM" / "X M" distance label next to a
// worker's location across the services list and the public worker profile.
//
// Lookup order:
//   1. The primary address (`isPrimary: true`) on /customer/profile.
//   2. Otherwise the first address with coordinates.
//   3. null  — caller hides the distance label.
//
// We deliberately do NOT prompt for browser GPS here. This hook is about the
// saved profile pin only. Browser GPS lives in useUserLocation and is wired
// to the "Nearest" sort flow on /services for users who haven't pinned an
// address yet — distance display falls back to nothing in that case, which
// is fine.

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { LatLng } from '@/lib/distance'
import { coordsFromPoint } from '@/lib/distance'

interface ProfileAddress {
  isPrimary?: boolean
  point?: { coordinates?: [number, number] | number[] }
}

const pickOrigin = (addresses: ProfileAddress[] | undefined): LatLng | null => {
  if (!addresses || addresses.length === 0) return null
  const primary = addresses.find(a => a.isPrimary)
  const fromPrimary = primary ? coordsFromPoint(primary.point) : null
  if (fromPrimary) return fromPrimary
  for (const addr of addresses) {
    const c = coordsFromPoint(addr.point)
    if (c) return c
  }
  return null
}

export function useCustomerOrigin(): LatLng | null {
  const { isLoggedIn } = useAuth()
  const { data } = useQuery({
    queryKey: ['customer', 'origin'] as const,
    queryFn: async () => {
      const res = await api.getWithAuth('/customer/profile')
      return pickOrigin(res?.profile?.addresses)
    },
    enabled: isLoggedIn,
    staleTime: 5 * 60 * 1000, // 5 min — address pins change rarely
  })
  return data ?? null
}
