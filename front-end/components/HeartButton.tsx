'use client'

// =============================================================================
// HEART BUTTON
// =============================================================================
// Single source of truth for the favorite-toggle UI. Used on:
//   - Worker public profile hero
//   - Worker cards on /providers and /services
//   - (Future) Anywhere we want to expose favoriting
//
// Behavior:
//   - Logged out  → click redirects to /signin?redirect=<currentPath>
//   - Logged in   → click toggles via FavoritesContext (optimistic)
//   - Click stops propagation so it doesn't trigger a card-wide click handler
// =============================================================================

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth-context'
import { useFavorites } from '@/lib/favorites-context'

interface HeartButtonProps {
  workerId: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'card' | 'hero' // hero is white-on-translucent for the profile hero
}

export default function HeartButton({ workerId, size = 'md', variant = 'card' }: HeartButtonProps) {
  const { isLoggedIn } = useAuth()
  const { isFavorite, toggle } = useFavorites()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('heartButton')
  const [busy, setBusy] = useState(false)

  const fav = isFavorite(workerId)

  const dims = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  const icon = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'

  const baseClass = variant === 'hero'
    ? 'bg-white/15 backdrop-blur hover:bg-white/25 border border-white/30'
    : 'bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/20'

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn) {
      router.push(`/signin?redirect=${encodeURIComponent(pathname || '/')}`)
      return
    }
    if (busy) return
    setBusy(true)
    try {
      await toggle(workerId)
    } catch (err) {
      console.error('Favorite toggle failed:', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={fav ? t('removeAria') : t('addAria')}
      className={`${dims} ${baseClass} rounded-full flex items-center justify-center transition-all disabled:opacity-50`}
    >
      <Heart
        className={`${icon} ${
          fav
            ? 'fill-red-500 text-red-500'
            : variant === 'hero' ? 'text-white' : 'text-on-surface-variant'
        }`}
      />
    </button>
  )
}
