'use client'

// =============================================================================
// FAVORITES PAGE — /favorites
// =============================================================================
// Shows the workers the current user has favorited. Logged-out users get
// redirected to /signin. The list is fetched fresh on mount (rather than
// reading from the FavoritesContext set) so we have card data, not just IDs.
// =============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Heart, MapPin, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import HeartButton from '@/components/HeartButton'
import RankBadge from '@/components/RankBadge'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useFavorites } from '@/lib/favorites-context'
import type { FavoriteWorkerCard, FavoritesListResponse } from '@/lib/types'

export default function FavoritesPage() {
  const router = useRouter()
  const t = useTranslations('favoritesPage')
  const { isLoggedIn, isLoading } = useAuth()
  const { ids } = useFavorites() // re-render when toggled so the card disappears
  const [cards, setCards] = useState<FavoriteWorkerCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.push('/signin?redirect=/favorites')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const data: FavoritesListResponse = await api.getWithAuth('/favorites')
        if (!cancelled) setCards(data.favorites || [])
      } catch (err) {
        console.error('Failed to load favorites', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isLoggedIn, isLoading, router])

  // Filter out cards whose id is no longer in the favorites set (so removing
  // a heart on this page makes the card vanish without a re-fetch).
  const visible = cards.filter(c => ids.has(String(c.userId._id)))

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Heart className="w-8 h-8 text-red-500 fill-red-500" />
            {t('title')}
          </h1>
          <p className="text-on-surface-variant mt-2">{t('subtitle')}</p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 bg-surface-container-high rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-24 bg-surface-container-lowest rounded-2xl border border-outline-variant/10">
            <Heart className="w-16 h-16 text-on-surface-variant/20 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t('emptyTitle')}</h2>
            <p className="text-on-surface-variant mb-6">{t('emptyBody')}</p>
            <Link
              href="/providers"
              className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-container transition-colors"
            >
              {t('browseCta')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(card => (
              <div
                key={card.userId._id}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-5 relative hover:shadow-md transition-shadow"
              >
                <div className="absolute top-3 left-3 z-10">
                  <HeartButton workerId={card.userId._id} size="sm" />
                </div>
                <Link
                  href={card.profileId ? `/worker/${card.profileId}` : '#'}
                  className="flex flex-col items-center text-center"
                >
                  {card.userId.profileImage ? (
                    <img
                      src={card.userId.profileImage}
                      alt={card.userId.firstName}
                      className="w-20 h-20 rounded-full object-cover mb-3"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-2xl text-primary mb-3">
                      {card.userId.firstName?.charAt(0) || '?'}
                    </div>
                  )}
                  <h3 className="font-bold mb-1">{card.userId.firstName} {card.userId.lastName}</h3>
                  {card.title && (
                    <p className="text-sm text-on-surface-variant mb-2 line-clamp-1">{card.title}</p>
                  )}
                  <div className="flex items-center gap-1 mb-2">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-bold text-sm">{card.ratingAverage.toFixed(1)}</span>
                    <span className="text-xs text-on-surface-variant">({card.totalReviews})</span>
                  </div>
                  {card.location?.address && (
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant mb-2">
                      <MapPin className="w-3 h-3" />
                      <span className="line-clamp-1">{card.location.address}</span>
                    </div>
                  )}
                  <RankBadge rank={card.rank} size="sm" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
