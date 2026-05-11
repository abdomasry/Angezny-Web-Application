// =============================================================================
// Shared TanStack Query keys + fetchers
// =============================================================================
// Why this file exists:
//   - Centralizes query keys so cache invalidation calls (e.g. after a mutation)
//     can target the same key the original useQuery used. Stringly-typed keys
//     scattered across files always drift; a key factory gets caught by TS.
//   - Co-locates the fetch function next to its key, so you never have to
//     wonder "what URL does the workers list use?" when reading a component.
//
// Adding a new query:
//   1. Add a key under `queryKeys` (returns a tuple, never a single string).
//   2. Add a fetcher function below.
//   3. In the component:  useQuery({ queryKey: queryKeys.X(args), queryFn: () => fetchX(args) })
// =============================================================================

import { api } from '@/lib/api'
import type { Category, WorkerProfile, PaginationInfo } from '@/lib/types'

// ─── Query keys ────────────────────────────────────────────────────
// Tuples keep the "hierarchy" Query uses for partial invalidations:
//   queryClient.invalidateQueries({ queryKey: ['workers'] })
// nukes ALL workers queries regardless of their filters; while
//   queryClient.invalidateQueries({ queryKey: queryKeys.workers(filters) })
// nukes only that exact filter combo.
export const queryKeys = {
  categories: (withCounts: boolean) =>
    ['categories', { withCounts }] as const,

  workers: (filters: WorkersFilters) =>
    ['workers', filters] as const,

  worker: (id: string) =>
    ['worker', id] as const,

  workerReviews: (id: string, page: number) =>
    ['worker', id, 'reviews', { page }] as const,

  service: (id: string) =>
    ['service', id] as const,

  notifications: () =>
    ['notifications'] as const,
} as const

// ─── Filter type used by the workers list ─────────────────────────
export interface WorkersFilters {
  categories?: string[] // multi-select category ids
  q?: string            // text search
  minPrice?: string
  maxPrice?: string
  minRating?: string
  sort?: string
  page?: number
  limit?: number
  // Geo mode — both must be set for $geoNear to kick in on the backend.
  // When present, the response uses cursor pagination (afterDistance / afterId)
  // and includes a `workersWithoutLocation` tail on the first page.
  lat?: number
  lng?: number
  afterDistance?: number  // meters — cursor for "load more" in geo mode
  afterId?: string        // tiebreaker id — cursor for "load more" in geo mode
}

// ─── Response shapes ──────────────────────────────────────────────
export interface CategoriesResponse {
  categories: Category[]
}

export interface WorkersResponse {
  workers: WorkerProfile[]
  // Only present in geo mode (page 1) — workers who haven't set coords yet.
  // The UI surfaces them under a "haven't shared location" divider so they
  // stay discoverable.
  workersWithoutLocation?: WorkerProfile[]
  // In non-geo mode this is the standard PaginationInfo. In geo mode the
  // server returns { page, limit, hasMore, nextCursor, mode: "geo" } instead.
  pagination: PaginationInfo & {
    hasMore?: boolean
    nextCursor?: { afterDistance: number; afterId: string } | null
    mode?: 'geo'
  }
}

// ─── Fetchers ─────────────────────────────────────────────────────
// Each function is a thin wrapper over the api client. Public endpoints
// use api.get; auth-required endpoints would use api.getWithAuth.

export async function fetchCategories(withCounts = false): Promise<CategoriesResponse> {
  const qs = withCounts ? '?withCounts=true' : ''
  return api.get(`/categories${qs}`)
}

// Build the workers query string from the filter object. Kept here so the
// query function is pure (the caller doesn't have to URLSearchParams-encode
// before calling).
export async function fetchWorkers(filters: WorkersFilters): Promise<WorkersResponse> {
  const params = new URLSearchParams()
  if (filters.categories && filters.categories.length > 0) {
    params.append('category', filters.categories.join(','))
  }
  if (filters.q) params.append('q', filters.q)
  if (filters.minPrice) params.append('minPrice', filters.minPrice)
  if (filters.maxPrice) params.append('maxPrice', filters.maxPrice)
  if (filters.minRating) params.append('minRating', filters.minRating)
  if (filters.sort) params.append('sort', filters.sort)
  // Geo branch — both coords required. The backend ignores `page`/`sort`
  // when in geo mode and uses afterDistance/afterId cursors instead.
  const geoMode = typeof filters.lat === 'number' && typeof filters.lng === 'number'
  if (geoMode) {
    params.append('lat', String(filters.lat))
    params.append('lng', String(filters.lng))
    if (typeof filters.afterDistance === 'number' && filters.afterId) {
      params.append('afterDistance', String(filters.afterDistance))
      params.append('afterId', filters.afterId)
    }
  } else if (filters.page) {
    params.append('page', String(filters.page))
  }
  params.append('limit', String(filters.limit ?? 10))
  return api.get(`/workers?${params.toString()}`)
}
