'use client'

// =============================================================================
// PUBLIC WORKER PROFILE PAGE
// =============================================================================
// This page displays a worker's public profile — any visitor can see it.
// URL pattern: /worker/[id]  (e.g., /worker/507f1f77bcf86cd799439011)
//
// [id] is a DYNAMIC ROUTE SEGMENT in Next.js.
// Next.js sees the folder name [id] and automatically extracts whatever value
// is in the URL into params.id. So /worker/abc123 → params.id = "abc123"
//
// Layout (RTL — right-to-left):
//   Because <html dir="rtl"> is set globally, flex-row already flows right→left.
//   So the FIRST element in DOM (sidebar) appears on the RIGHT side,
//   and the SECOND element (main content) appears on the LEFT side.
//   This is the natural Arabic reading direction.
//
// Data flow:
//   1. Read worker ID from URL params
//   2. Fetch worker profile (public — no auth needed)
//   3. Fetch reviews with pagination
//   4. Render sidebar (avatar, stats, services) + main area (portfolio/reviews tabs)
// =============================================================================

import { useState, useEffect } from 'react'
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation'
import { Star, MapPin, Calendar, ChevronLeft, ChevronRight, Briefcase, MessageSquare, MessageCircleQuestion, ShoppingBag, X, BadgeCheck, Clock, User as UserIcon, Building2, Wallet, Check } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import Navbar from '@/components/Navbar'
import RankBadge from '@/components/RankBadge'
import GalleryLightbox from '@/components/GalleryLightbox'
import HeartButton from '@/components/HeartButton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { useCustomerOrigin } from '@/hooks/useCustomerOrigin'
import { coordsFromPoint, formatDistance, haversineKm } from '@/lib/distance'
import type { WorkerProfile, WorkerService, Review, PaginationInfo, PortfolioItem } from '@/lib/types'

const DAY_ORDER = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const

// =============================================================================
// EXTENDED TYPE FOR THIS PAGE
// =============================================================================
// The WorkerProfile type in @/lib/types has userId with only _id, firstName,
// lastName, profileImage. But on the public profile page, the backend also
// populates createdAt (from User model's timestamps). We extend the type here
// instead of polluting the shared type with page-specific fields.
interface WorkerProfileExtended extends Omit<WorkerProfile, 'userId'> {
  userId: WorkerProfile['userId'] & {
    createdAt?: string  // from Mongoose timestamps: true
  }
}

// =============================================================================
// STAR RATING COMPONENT
// =============================================================================
// Renders 5 stars, filling them based on a numeric rating.
// Math.round(4.3) = 4 → first 4 stars are filled, last 1 is empty.
// This is a simple "round to nearest whole star" approach.
function StarRating({ rating, size = 'w-5 h-5' }: { rating: number; size?: string }) {
  const filled = Math.round(rating) // Round 4.7 → 5, 4.3 → 4
  return (
    <div className="flex gap-0.5">
      {/* Array.from creates [0, 1, 2, 3, 4] — five iterations for five stars */}
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`${size} ${
            // If this star's index is less than the filled count, color it gold
            i < filled
              ? 'fill-yellow-400 text-yellow-400'  // Filled star
              : 'text-outline-variant/40'           // Empty star (faded)
          }`}
        />
      ))}
    </div>
  )
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================
export default function WorkerProfilePage() {
  // ---------------------------------------------------------------------------
  // URL PARAMS
  // ---------------------------------------------------------------------------
  // useParams() reads dynamic route segments.
  // For /worker/[id]/page.tsx, params.id gives us the worker's MongoDB _id.
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('workerProfile')
  const locale = useLocale()
  const { isLoggedIn } = useAuth()
  const { findOrCreateConversation } = useChat()

  // `?category=<id>` from URL — set by the services listing's "view profile"
  // link when a category filter is active. Used to narrow the services list
  // below. Stripped via the filter-chip × button.
  const categoryFilter = searchParams?.get('category') || ''

  // Handler for the generic "Send Message" button — opens or creates a 1:1
  // chat with this worker, then navigates to the conversation page.
  // Unauthenticated users are redirected to sign-in (chat is logged-in-only).
  const handleStartChat = async () => {
    if (!worker?.userId?._id) return
    if (!isLoggedIn) {
      router.push('/signin')
      return
    }
    const conv = await findOrCreateConversation(worker.userId._id)
    if (conv) router.push(`/messages/${conv._id}`)
  }

  // Per-service "ask" — same behavior as on /services, just lives here for
  // the per-row button inside the services list.
  const handleAskService = async (service: WorkerService) => {
    if (!worker?.userId?._id) return
    if (!isLoggedIn) {
      router.push('/signin')
      return
    }
    // Pass serviceId so the backend stamps `serviceContextId` on the
    // conversation — that's what powers the "يسأل عن الخدمة" banner the
    // worker sees in MessageThread.
    const conv = await findOrCreateConversation(worker.userId._id, service._id)
    if (conv) router.push(`/messages/${conv._id}?service=${service._id}`)
  }

  // Per-service "order now" — checkout page handles its own auth gate, but
  // we still pre-redirect logged-out users to avoid a round trip.
  const handleOrderService = (service: WorkerService) => {
    const target = `/checkout?service=${service._id}`
    if (!isLoggedIn) {
      router.push(`/signin?redirect=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  // Clear the category filter — keeps the same URL but drops the query
  // string so all services become visible again.
  const clearCategoryFilter = () => {
    if (pathname) router.replace(pathname)
  }

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  // worker: The full worker profile data (null until loaded)
  const [worker, setWorker] = useState<WorkerProfileExtended | null>(null)

  // Customer's saved profile pin — used to render a "3.5KM" / "400M" label
  // next to the worker's address. Hidden when either side has no coordinates.
  const customerOrigin = useCustomerOrigin()
  const workerCoords = coordsFromPoint(worker?.location?.point)
  const distanceLabel = customerOrigin && workerCoords
    ? formatDistance(haversineKm(customerOrigin, workerCoords))
    : ''

  // reviews: Array of review objects for the Reviews tab
  const [reviews, setReviews] = useState<Review[]>([])

  // reviewsPagination: Tracks current page, total pages, etc. for review pagination
  const [reviewsPagination, setReviewsPagination] = useState<PaginationInfo>({
    page: 1, limit: 6, total: 0, pages: 0,
  })

  // activeTab: Which tab is selected. Default is the gallery tab, which
  // also hosts the message CTA, quick request form, and reviews preview.
  const [activeTab, setActiveTab] = useState<'gallery' | 'reviews' | 'about' | 'location'>('gallery')

  // Lightbox state for the business gallery — null when closed.
  const [openItem, setOpenItem] = useState<PortfolioItem | null>(null)

  // expandedSection: when set to anything other than 'overview', the page
  // swaps from the multi-section overview into a focused view of just that
  // section. Triggered by the "عرض الكل" buttons. Only sections with more
  // content than fits in the preview are expandable (portfolio + reviews).
  type ExpandedSection = 'overview' | 'portfolio' | 'reviews'
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>('overview')

  // loading: True while the initial data is being fetched
  const [loading, setLoading] = useState(true)

  // error: If the worker isn't found or API fails, we show an error message
  const [error, setError] = useState('')

  // Track which service id (if any) is currently "hash-targeted" so the
  // service row can render with a short highlight pulse. Populated after the
  // profile loads, reading window.location.hash (#service-<id>). Supports
  // deep links from the chat auto-send (see MessageThread).
  const [highlightedServiceId, setHighlightedServiceId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!worker) return
    const hash = window.location.hash
    if (!hash.startsWith('#service-')) return
    const targetId = hash.slice('#service-'.length)
    if (!targetId) return
    // Wait a tick for the DOM to render filtered services, then scroll + pulse.
    const t = setTimeout(() => {
      const el = document.getElementById(`service-${targetId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedServiceId(targetId)
        // Fade the highlight after a couple seconds so it doesn't linger.
        setTimeout(() => setHighlightedServiceId(null), 2400)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [worker, categoryFilter])

  // ---------------------------------------------------------------------------
  // DATA FETCHING — Worker Profile
  // ---------------------------------------------------------------------------
  // This effect runs once when the component mounts (or when params.id changes).
  // It fetches the worker profile using a PUBLIC endpoint (no auth token needed).
  useEffect(() => {
    if (!params.id) return // Safety check — shouldn't happen but prevents crashes

    const fetchWorker = async () => {
      try {
        // api.get() is the public GET method — see @/lib/api.ts
        // It calls: GET http://localhost:5000/api/workers/<id>
        const data = await api.get(`/workers/${params.id}`)
        setWorker(data.worker)
      } catch (err: any) {
        console.error('Failed to load worker:', err)
        setError(err.message || t('loadFailed'))
      } finally {
        setLoading(false) // Stop showing skeleton regardless of success/failure
      }
    }

    fetchWorker()
  }, [params.id])

  // ---------------------------------------------------------------------------
  // DATA FETCHING — Reviews (paginated)
  // ---------------------------------------------------------------------------
  // This effect runs when:
  //   1. params.id changes (different worker)
  //   2. reviewsPagination.page changes (user clicks next/prev page)
  //
  // We fetch 6 reviews per page. The API returns { reviews, pagination }.
  useEffect(() => {
    if (!params.id) return

    const fetchReviews = async () => {
      try {
        const data = await api.get(
          `/workers/${params.id}/reviews?page=${reviewsPagination.page}&limit=6`
        )
        setReviews(data.reviews)
        setReviewsPagination(data.pagination)
      } catch (err) {
        console.error('Failed to load reviews:', err)
        // Not setting error here — reviews failing shouldn't break the whole page
      }
    }

    fetchReviews()
  }, [params.id, reviewsPagination.page])

  // ---------------------------------------------------------------------------
  // HELPER: Calculate "member since" year
  // ---------------------------------------------------------------------------
  // Takes the user's createdAt date string and extracts just the year.
  // e.g., "2023-06-15T12:00:00Z" → 2023
  const getMemberSinceYear = () => {
    if (!worker?.userId?.createdAt) return null
    return new Date(worker.userId.createdAt).getFullYear()
  }

  // ---------------------------------------------------------------------------
  // HELPER: Format review date in Arabic
  // ---------------------------------------------------------------------------
  // toLocaleDateString('ar-EG', ...) formats dates in Arabic Egyptian locale.
  // e.g., "2024-03-15" → "١٥ مارس ٢٠٢٤"
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // ---------------------------------------------------------------------------
  // HELPER: Get initials for avatar fallback
  // ---------------------------------------------------------------------------
  // When a user has no profile image, we show their first initial in a colored circle.
  // e.g., "أحمد" → "أ"
  const getInitial = (name?: string) => name?.charAt(0) || '?'

  // ---------------------------------------------------------------------------
  // HELPER: Change review page
  // ---------------------------------------------------------------------------
  // Updates the pagination state, which triggers the useEffect to re-fetch reviews.
  const goToReviewPage = (page: number) => {
    setReviewsPagination(prev => ({ ...prev, page }))
  }

  // ===========================================================================
  // LOADING STATE — Skeleton UI
  // ===========================================================================
  // While data is loading, we show placeholder shapes that "pulse" (animate-pulse).
  // This is better UX than a blank page — users see the layout structure immediately.
  if (loading) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar skeleton */}
            <aside className="w-full lg:w-80 flex flex-col gap-6">
              <div className="bg-surface-container-lowest p-8 rounded-xl animate-pulse">
                <div className="w-32 h-32 rounded-full bg-surface-container-high mx-auto mb-4" />
                <div className="h-6 bg-surface-container-high rounded w-40 mx-auto mb-2" />
                <div className="h-4 bg-surface-container-high rounded w-32 mx-auto mb-4" />
                <div className="flex justify-center gap-1 mb-6">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-5 h-5 bg-surface-container-high rounded" />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="h-16 bg-surface-container-high rounded-xl" />
                  <div className="h-16 bg-surface-container-high rounded-xl" />
                </div>
                <div className="h-14 bg-surface-container-high rounded-xl" />
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-xl animate-pulse">
                <div className="h-5 bg-surface-container-high rounded w-32 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 bg-surface-container-high rounded" />
                  ))}
                </div>
              </div>
            </aside>
            {/* Main content skeleton */}
            <section className="flex-1">
              <div className="flex gap-4 mb-8">
                <div className="h-12 w-36 bg-surface-container-high rounded-xl animate-pulse" />
                <div className="h-12 w-32 bg-surface-container-high rounded-xl animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-4 h-[400px]">
                <div className="col-span-1 row-span-2 bg-surface-container-high rounded-xl animate-pulse" />
                <div className="bg-surface-container-high rounded-xl animate-pulse" />
                <div className="bg-surface-container-high rounded-xl animate-pulse" />
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  // ===========================================================================
  // ERROR / 404 STATE
  // ===========================================================================
  // If the API returned an error (worker not found, invalid ID, server down),
  // we show a friendly message instead of a broken page.
  if (error || !worker) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-7xl mx-auto">
          <div className="text-center py-32">
            <Briefcase className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-on-surface mb-2">
              لم يتم العثور على مزود الخدمة
            </h1>
            <p className="text-on-surface-variant">
              {error || 'الرابط غير صحيح أو تم حذف الحساب'}
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ===========================================================================
  // MAIN RENDER
  // ===========================================================================
  // At this point: loading=false, error='', worker exists.
  // We can safely access worker properties.

  const memberYear = getMemberSinceYear()

  // ---------------------------------------------------------------------------
  // SECTION RENDERERS — each main section is a function so we can render it
  // either in the overview (preview / collapsed) or in the expanded detail view.
  // ---------------------------------------------------------------------------
  const renderAbout = () => (
    <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <UserIcon className="w-6 h-6 text-primary" />
        {t('aboutMe')}
      </h2>
      {worker.userId?.bio ? (
        <p className="text-on-surface-variant leading-relaxed mb-6 text-lg whitespace-pre-line">
          {worker.userId.bio}
        </p>
      ) : (
        <p className="text-on-surface-variant text-sm mb-6">{t('noBio')}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div>
          <h3 className="font-bold mb-3 text-lg">{t('skills')}</h3>
          {worker.skills && worker.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {worker.skills.map((skill, i) => (
                <span
                  key={i}
                  className="bg-primary/10 text-primary border border-primary/20 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">{t('noSkills')}</p>
          )}
        </div>
        <div>
          <h3 className="font-bold mb-3 text-lg">{t('workHours')}</h3>
          {worker.workingHours && worker.workingHours.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {DAY_ORDER.map(day => {
                const entry = worker.workingHours!.find(w => w.day === day)
                const dayLabel = t(`days.${day}` as any)
                if (!entry || !entry.enabled) {
                  return (
                    <li key={day} className="flex justify-between text-on-surface-variant">
                      <span>{dayLabel}</span>
                      <span>{t('closed')}</span>
                    </li>
                  )
                }
                return (
                  <li key={day} className="flex justify-between">
                    <span className="font-medium">{dayLabel}</span>
                    <span className="font-medium text-primary">{entry.from} – {entry.to}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-on-surface-variant text-sm">{t('noHours')}</p>
          )}
        </div>
      </div>
    </div>
  )

  const renderPackages = () => {
    const pkgs = worker.packages || []
    if (pkgs.length === 0) return null
    return (
      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />
          {t('packages')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pkgs.map((pkg, idx) => {
            // Mark the middle (or only) package as "featured" — matches the
            // design where one card stands out as "الأكثر طلباً".
            const isFeatured = pkgs.length >= 2 && idx === Math.floor(pkgs.length / 2)
            return (
              <div
                key={idx}
                className={`rounded-xl p-6 transition-all ${
                  isFeatured
                    ? 'border-2 border-primary shadow-md relative'
                    : 'border border-outline-variant/30 hover:border-primary hover:shadow-md'
                }`}
              >
                {isFeatured && (
                  <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-primary text-white px-3 py-1 rounded-full text-xs font-bold">
                    {t('mostPopular')}
                  </div>
                )}
                <h3 className="text-lg font-bold mb-2">{pkg.title || t('fallbackPackage')}</h3>
                <div className="text-3xl font-bold text-primary mb-4">
                  {pkg.price ? <>{pkg.price}<span className="text-sm text-on-surface-variant font-normal"> {t('currency')}</span></> : t('contactForPrice')}
                </div>
                {pkg.description && (
                  <p className="text-sm text-on-surface-variant mb-4">{pkg.description}</p>
                )}
                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-2 text-sm text-on-surface-variant mb-6">
                    {pkg.features.map((feature, fi) => (
                      <li key={fi} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={handleStartChat}
                  className={`w-full py-2 font-medium rounded-lg transition-colors ${
                    isFeatured
                      ? 'bg-primary text-on-primary hover:bg-primary-container'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {t('choosePackage')}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderServices = () => {
    // worker.services is populated by GET /api/workers/:id with
    // active=true and approvalStatus=approved already filtered server-side.
    const all = (worker.services || []) as WorkerService[]
    const items = categoryFilter
      ? all.filter(s => {
          const cid = typeof s.categoryId === 'string' ? s.categoryId : s.categoryId?._id
          return cid === categoryFilter
        })
      : all

    // Format price label per typeofService.
    const formatPrice = (s: WorkerService) => {
      if (s.typeofService === 'custom') return 'سعر مخصص'
      if (s.typeofService === 'hourly' && typeof s.price === 'number') {
        return <>{s.price}<span className="text-xs text-on-surface-variant"> {t('currencyPerHour')}</span></>
      }
      if (s.typeofService === 'range') {
        if (s.priceRange?.custom) return s.priceRange.custom
        const { min, max } = s.priceRange || {}
        if (typeof min === 'number' && typeof max === 'number') {
          return <>{min} – {max}<span className="text-xs text-on-surface-variant"> {t('currency')}</span></>
        }
      }
      if (typeof s.price === 'number') {
        return <>{s.price}<span className="text-xs text-on-surface-variant"> {t('currency')}</span></>
      }
      return t('contactForPrice')
    }

    return (
      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" />
          {t('services')}
        </h2>
        {items.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
            <p className="text-on-surface-variant">{t('noServices')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((s) => (
              <div
                id={`service-${s._id}`}
                key={s._id}
                className={`flex gap-4 p-4 rounded-xl border transition-all ${
                  highlightedServiceId === s._id
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-outline-variant/20 hover:border-primary/40 hover:shadow-sm'
                }`}
              >
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-surface-container-high shrink-0">
                  {s.images && s.images.length > 0 ? (
                    <img src={s.images[0]} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="w-8 h-8 text-on-surface-variant/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className="font-bold mb-1">{s.name}</h3>
                  {s.description && (
                    <p className="text-sm text-on-surface-variant line-clamp-2 mb-2">{s.description}</p>
                  )}
                  <div className="text-primary font-bold mb-3">{formatPrice(s)}</div>
                  <div className="flex gap-2 mt-auto">
                    {s.typeofService === 'custom' ? (
                      <button
                        type="button"
                        onClick={() => handleAskService(s)}
                        className="flex-1 bg-primary text-on-primary text-sm py-2 rounded-lg font-medium hover:bg-primary-container transition-colors"
                      >
                        {t('ask')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOrderService(s)}
                          className="flex-1 bg-primary text-on-primary text-sm py-2 rounded-lg font-medium hover:bg-primary-container transition-colors"
                        >
                          {t('bookNow')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAskService(s)}
                          className="flex-1 bg-surface-container-low text-primary border border-primary/20 text-sm py-2 rounded-lg font-medium hover:bg-primary/5 transition-colors"
                        >
                          {t('ask')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {categoryFilter && all.length !== items.length && (
          <button
            type="button"
            onClick={clearCategoryFilter}
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <X className="w-4 h-4" />
            {t('showAllServices')}
          </button>
        )}
      </div>
    )
  }

  const renderPortfolio = (preview: boolean) => {
    const items = (worker.portfolio || []).filter(item => (item.images || []).length > 0)
    const visible = preview ? items.slice(0, 2) : items
    return (
      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            {t('portfolio')}
          </h2>
          {preview && items.length > 2 && (
            <button
              type="button"
              onClick={() => setExpandedSection('portfolio')}
              className="text-primary font-medium hover:underline flex items-center gap-1"
            >
              {t('viewAll')}
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        {visible.length > 0 ? (
          <div className={`grid gap-6 ${preview ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {visible.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setOpenItem(item)}
                className="group relative rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow text-right"
              >
                <div className="aspect-video relative overflow-hidden">
                  <img
                    src={item.images![0]}
                    alt={item.title || t('fallbackPortfolioAlt')}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-on-surface/70 via-on-surface/20 to-transparent" />
                </div>
                <div className="absolute bottom-0 w-full p-4 text-white">
                  <h4 className="font-bold text-lg mb-1">{item.title}</h4>
                  {item.description && (
                    <p className="text-sm text-white/80 line-clamp-1">{item.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Briefcase className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
            <p className="text-on-surface-variant">{t('noPortfolio')}</p>
          </div>
        )}
      </div>
    )
  }

  const renderReviews = (preview: boolean) => {
    const visible = preview ? reviews.slice(0, 2) : reviews
    return (
      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            {t('reviews')}
          </h2>
          {preview && reviewsPagination.total > 2 && (
            <span className="text-on-surface-variant text-sm">{t('reviewsCount', { count: reviewsPagination.total })}</span>
          )}
        </div>
        {visible.length > 0 ? (
          <div className="space-y-6">
            {visible.map((review) => (
              <div key={review._id} className="flex gap-4">
                {review.customerId?.profileImage ? (
                  <img
                    src={review.customerId.profileImage}
                    alt={review.customerId.firstName}
                    className="w-12 h-12 rounded-full object-cover shrink-0 border border-outline-variant/20"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-primary shrink-0">
                    {getInitial(review.customerId?.firstName)}
                  </div>
                )}
                <div className="flex-1 bg-surface-container-low p-5 rounded-2xl rounded-tr-none">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold">{review.customerId?.firstName} {review.customerId?.lastName}</h4>
                      <div className="mt-1">
                        <StarRating rating={review.rating} size="w-4 h-4" />
                      </div>
                    </div>
                    <span className="text-on-surface-variant text-xs">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.comment && (
                    <p className="text-on-surface-variant leading-relaxed text-sm">{review.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Star className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
            <p className="text-on-surface-variant">{t('noReviews')}</p>
          </div>
        )}

        {/* In preview mode show "view all" link; in expanded mode show pagination. */}
        {preview && reviewsPagination.total > 2 && (
          <button
            type="button"
            onClick={() => setExpandedSection('reviews')}
            className="w-full mt-6 py-3 text-primary font-bold bg-primary/5 rounded-xl hover:bg-primary/10 transition-colors border border-primary/20"
          >
            {t('moreReviews', { count: reviewsPagination.total })}
          </button>
        )}
        {!preview && reviewsPagination.pages > 1 && (
          <div className="mt-8 flex justify-center items-center gap-2">
            <button
              onClick={() => goToReviewPage(Math.max(1, reviewsPagination.page - 1))}
              disabled={reviewsPagination.page === 1}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            {Array.from({ length: Math.min(reviewsPagination.pages, 5) }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => goToReviewPage(page)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-colors ${
                  reviewsPagination.page === page
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => goToReviewPage(Math.min(reviewsPagination.pages, reviewsPagination.page + 1))}
              disabled={reviewsPagination.page === reviewsPagination.pages}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  // Sidebar — booking card (sticky) + verification badges card
  const renderSidebar = () => {
    const startingPrice = worker.publicStats?.startingPrice ?? worker.priceRange?.min ?? 0
    const completionRate = worker.publicStats?.successRate ?? 0
    const completedOrders = worker.completedOrdersCount ?? worker.publicStats?.completedOrders ?? 0
    const verifiedIdentity = worker.verificationStatus === 'approved'
    const licenseApproved = worker.license?.status === 'approved'
    // Surfaced licenses: only those the worker has both *gotten approved by
    // admin* AND *flipped to active themselves*. A pending or rejected one
    // never shows publicly; an approved-but-deactivated one is the worker's
    // private signal that they're hiding it for the moment.
    const publicLicenses = (worker.licenses || []).filter(
      l => l.status === 'approved' && l.active,
    )
    const showVerificationCard = verifiedIdentity || licenseApproved || publicLicenses.length > 0

    return (
      <>
        {/* Booking card */}
        <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-lg border border-outline-variant/10 sticky top-28">
          <div className="text-center mb-6 border-b border-outline-variant/15 pb-6">
            <span className="text-on-surface-variant block mb-1 text-sm">السعر المبدئي</span>
            <div className="text-3xl font-bold text-primary">
              {startingPrice > 0 ? <>{startingPrice}<span className="text-base text-on-surface-variant font-normal"> ج.م</span></> : 'تواصل'}
            </div>
          </div>
          <div className="space-y-3 mb-6">
            <button
              onClick={handleStartChat}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary-container transition-all"
            >
              <Calendar className="w-5 h-5" />
              {t('bookAppointment')}
            </button>
            <button
              onClick={handleStartChat}
              className="w-full bg-surface-container-low text-primary border border-primary/20 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-all"
            >
              <MessageSquare className="w-5 h-5" />
              {t('sendMessage')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-container-low p-3 rounded-xl text-center">
              <span className="block text-xs text-on-surface-variant mb-1">{t('completionRate')}</span>
              <span className="font-bold text-primary text-lg">{completionRate}%</span>
            </div>
            <div className="bg-surface-container-low p-3 rounded-xl text-center">
              <span className="block text-xs text-on-surface-variant mb-1">{t('completedOrders')}</span>
              <span className="font-bold text-primary text-lg">{completedOrders}</span>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <RankBadge rank={worker.rank} size="md" />
          </div>
        </div>

        {/* Verification card */}
        {showVerificationCard && (
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/10">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-primary" />
              {t('verifications')}
            </h3>
            <ul className="space-y-3">
              {verifiedIdentity && (
                <li className="flex items-start gap-3">
                  <BadgeCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="currentColor" />
                  <div>
                    <p className="font-bold text-sm">{t('identityVerifiedTitle')}</p>
                    <p className="text-xs text-on-surface-variant">{t('identityVerifiedBody')}</p>
                  </div>
                </li>
              )}
              {licenseApproved && (
                <li className="flex items-start gap-3">
                  <BadgeCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="currentColor" />
                  <div>
                    <p className="font-bold text-sm">{t('licenseVerifiedTitle')}</p>
                    <p className="text-xs text-on-surface-variant">{t('licenseVerifiedBody')}</p>
                  </div>
                </li>
              )}
              {/* Multi-license entries the worker has chosen to surface.
                  Each entry shows its name (e.g. "رخصة تدريب اللحام") and the
                  issuing authority when present, with the same green-check
                  styling as the other verifications for visual consistency. */}
              {publicLicenses.map(license => (
                <li key={license._id} className="flex items-start gap-3">
                  <BadgeCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="currentColor" />
                  <div>
                    <p className="font-bold text-sm">{license.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {license.issuedBy
                        ? t('issuedBy', { name: license.issuedBy })
                        : t('platformVerified')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    )
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================
  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      {/* ----- Hero Band ----- */}
      <section className="bg-primary text-white pt-24 pb-32 relative overflow-hidden">
        {worker.userId?._id && (
          <div className="absolute top-6 left-6 z-10">
            <HeartButton workerId={worker.userId._id} size="lg" variant="hero" />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-8">
            <div className="shrink-0">
              {worker.userId?.profileImage ? (
                <img
                  src={worker.userId.profileImage}
                  alt={`${worker.userId.firstName} ${worker.userId.lastName}`}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white/30 shadow-lg"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-white/15 text-white flex items-center justify-center font-bold text-4xl border-4 border-white/30">
                  {getInitial(worker.userId?.firstName)}
                </div>
              )}
            </div>
            <div className="text-center md:text-right flex-1">
              <h1 className="text-4xl font-bold mb-2 flex items-center md:justify-start justify-center gap-2 flex-wrap">
                {worker.userId?.firstName} {worker.userId?.lastName}
                {worker.verificationStatus === 'approved' && (
                  <BadgeCheck className="w-7 h-7 text-white" fill="currentColor" />
                )}
              </h1>
              {worker.title && (
                <p className="text-white/80 text-xl mb-4 font-light">"{worker.title}"</p>
              )}
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-6 text-sm text-white/90">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-white text-lg">{worker.ratingAverage?.toFixed(1) || '0.0'}</span>
                  <span>{t('reviewsTotal', { count: worker.totalReviews })}</span>
                </div>
                {(worker.location?.address || distanceLabel) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    {worker.location?.address && <span>{worker.location.address}</span>}
                    {distanceLabel && (
                      <span className="font-bold text-yellow-300">
                        {worker.location?.address ? '· ' : ''}{distanceLabel}
                      </span>
                    )}
                  </div>
                )}
                {memberYear && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    <span>{t('yearsExperience', { count: Math.max(1, new Date().getFullYear() - memberYear) })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="-mt-20 pb-24 px-6 max-w-7xl mx-auto relative z-10">
        {expandedSection !== 'overview' && (
          <button
            type="button"
            onClick={() => setExpandedSection('overview')}
            className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/20 rounded-xl font-bold text-primary hover:bg-surface-container-low transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
            {t('backToProfile')}
          </button>
        )}

        {expandedSection === 'overview' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <section className="lg:col-span-8 space-y-8 order-2 lg:order-1">
              {renderAbout()}
              {renderPackages()}
              {renderServices()}
              {renderPortfolio(true)}
              {renderReviews(true)}
            </section>
            <aside className="lg:col-span-4 space-y-6 order-1 lg:order-2">
              {renderSidebar()}
            </aside>
          </div>
        ) : expandedSection === 'portfolio' ? (
          <div className="space-y-8">{renderPortfolio(false)}</div>
        ) : expandedSection === 'reviews' ? (
          <div className="space-y-8">{renderReviews(false)}</div>
        ) : null}

      </main>

      {/* Lightbox — rendered at the page level so it overlays everything */}
      <GalleryLightbox item={openItem} onClose={() => setOpenItem(null)} />
    </div>
  )
}
