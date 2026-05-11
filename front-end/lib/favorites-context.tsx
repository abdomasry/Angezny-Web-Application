'use client'

// =============================================================================
// FAVORITES CONTEXT
// =============================================================================
// Holds the set of worker user-ids that the current user has favorited.
// Why a context: every <HeartButton> on every worker card and on every worker
// profile needs to know the current state. Threading it through props would be
// painful; refetching on each card mount would hammer the API.
//
// Behavior:
//   - On login (or initial mount with a token), GET /api/favorites once and
//     populate the Set.
//   - toggle(workerId) flips the set optimistically and calls POST/DELETE.
//     On error, the optimistic change is rolled back and the error bubbles.
//   - Logout clears the set.
// =============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from './api'
import { useAuth } from './auth-context'

interface FavoritesContextType {
  ids: Set<string>
  isFavorite: (workerId: string) => boolean
  toggle: (workerId: string) => Promise<boolean> // returns the new state
  refresh: () => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextType | null>(null)

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth()
  const [ids, setIds] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setIds(new Set())
      return
    }
    try {
      const data = await api.getWithAuth('/favorites')
      setIds(new Set((data.ids || []).map((x: string) => String(x))))
    } catch (err) {
      console.error('Failed to load favorites', err)
    }
  }, [isLoggedIn])

  useEffect(() => { refresh() }, [refresh])

  const toggle = useCallback(async (workerId: string) => {
    const wasFav = ids.has(workerId)
    // Optimistic update
    setIds(prev => {
      const next = new Set(prev)
      if (wasFav) next.delete(workerId); else next.add(workerId)
      return next
    })
    try {
      if (wasFav) {
        await api.deleteWithAuth(`/favorites/${workerId}`)
      } else {
        await api.postWithAuth(`/favorites/${workerId}`, {})
      }
      return !wasFav
    } catch (err) {
      // Rollback on failure
      setIds(prev => {
        const next = new Set(prev)
        if (wasFav) next.add(workerId); else next.delete(workerId)
        return next
      })
      throw err
    }
  }, [ids])

  return (
    <FavoritesContext.Provider value={{ ids, isFavorite: (id) => ids.has(id), toggle, refresh }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider')
  return ctx
}
