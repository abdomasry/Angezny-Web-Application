'use client'
// Providers (workers) listing page — matches the "Ethereal / Digital Majlis"
// design spec in design/Worker Listing/. Layout is a sticky right-hand sidebar
// with quick filters + sort + category checkboxes, and a 3-column worker grid
// on the left, with a "load more" pagination button at the bottom.
//
// Uses GET /api/workers which already supports:
//   - ?category=id1,id2 (comma-separated for multi-select)
//   - ?minRating=4.5
//   - ?sort=rating|price|mostOrdered|alphabetical
//   - ?page / ?limit

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Star, BadgeCheck, MapPin, ChevronDown, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import HeartButton from '@/components/HeartButton'
import { api } from '@/lib/api'
import type { Category, WorkerProfile, PaginationInfo } from '@/lib/types'
import { useUserLocation } from '@/hooks/useUserLocation'

// Quick filter presets — these map the sidebar tabs onto concrete query params.
// "all"        → no extra filters
// "topRated"   → minRating=4.5 + sort by rating
// "verified"   → verified badge is already implicit (backend only returns
//                verificationStatus:"approved" workers), so this is effectively
//                the same as "all" for now, but we keep the tab for future use
// "nearest"    → activates geo branch on the backend ($geoNear). Requires
//                browser geolocation permission; opens permission prompt on
//                tab click and falls back to a denied-state message if
//                rejected. See useUserLocation for the cache strategy.
type QuickFilter = 'all' | 'topRated' | 'verified' | 'nearest'

// Geo cursor returned by the backend in geo mode. Sent back as query params
// when the user clicks "load more" so pagination is stable under inserts.
interface GeoCursor {
  afterDistance: number
  afterId: string
}

export default function ProvidersPage() {
  // === Data state ===
  const [workers, setWorkers] = useState<WorkerProfile[]>([])
  // Workers without coords — only populated in geo mode, on page 1. Rendered
  // under a divider so they stay discoverable but don't pollute distance order.
  const [workersWithoutLocation, setWorkersWithoutLocation] = useState<WorkerProfile[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1, limit: 9, total: 0, pages: 0,
  })
  // Geo-mode pagination state. In geo mode we use cursor pagination (more
  // stable when new workers register mid-browse) instead of page numbers.
  const [geoCursor, setGeoCursor] = useState<GeoCursor | null>(null)
  const [geoHasMore, setGeoHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  // === Filter state ===
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [sort, setSort] = useState('rating')
  const [currentPage, setCurrentPage] = useState(1)

  // === Geolocation hook ===
  // status === 'cached' or 'granted' means we have coords; 'requesting' shows
  // the skeleton; 'denied' surfaces a fallback message.
  const { coords, status: geoStatus, request: requestLocation } = useUserLocation()
  const hasCoords = !!coords

  // Are we in geo mode for this fetch? Both: user picked the "Nearest" tab
  // AND we actually have their coords (cache hit or just-granted).
  const geoMode = quickFilter === 'nearest' && hasCoords

  // === Fetch categories once for the checkbox group ===
  useEffect(() => {
    api.get('/categories')
      .then(data => setCategories(data.categories))
      .catch(err => console.error('Failed to load categories:', err))
  }, [])

  // === Fetch workers whenever filters change ===
  // Two pagination modes:
  //   • Non-geo: page-number pagination (existing behavior). page > 1 appends.
  //   • Geo:    cursor pagination via geoCursor. Page 1 = no cursor; later
  //             pages send afterDistance + afterId from the previous response.
  useEffect(() => {
    // In nearest mode, hold off until we actually have coords. The "click the
    // Nearest tab" handler kicks off the permission prompt; this effect only
    // fires the fetch once coords land.
    if (quickFilter === 'nearest' && !hasCoords) {
      return
    }

    const fetchWorkers = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()

        if (selectedCategories.length > 0) {
          params.append('category', selectedCategories.join(','))
        }
        if (quickFilter === 'topRated') {
          params.append('minRating', '4.5')
        }
        params.append('sort', sort)
        params.append('limit', '9')

        if (geoMode && coords) {
          params.append('lat', String(coords.lat))
          params.append('lng', String(coords.lng))
          // Cursor only on page 2+. Page 1 = no cursor → backend returns the
          // tail of no-coords workers as well.
          if (geoCursor) {
            params.append('afterDistance', String(geoCursor.afterDistance))
            params.append('afterId', geoCursor.afterId)
          }
        } else {
          params.append('page', currentPage.toString())
        }

        const data = await api.get(`/workers?${params.toString()}`)

        if (geoMode) {
          // Geo branch: load-more is signaled by geoCursor being set when
          // the user clicked the button. We treat "no cursor" as page 1.
          const isFirstGeoPage = !geoCursor
          setWorkers(prev => isFirstGeoPage ? data.workers : [...prev, ...data.workers])
          setWorkersWithoutLocation(isFirstGeoPage ? (data.workersWithoutLocation || []) : [])
          setGeoHasMore(!!data.pagination?.hasMore)
        } else {
          // Non-geo branch: original page-number pagination.
          setWorkers(prev => currentPage === 1 ? data.workers : [...prev, ...data.workers])
          setWorkersWithoutLocation([])
          setPagination(data.pagination)
        }
      } catch (err) {
        console.error('Failed to load workers:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchWorkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter, selectedCategories, sort, currentPage, hasCoords, geoCursor])

  // === Filter handlers ===
  // Whenever a filter changes, reset both pagination cursors so the list
  // restarts cleanly regardless of which mode (page-number / geo) is active.
  const resetPagination = () => {
    setCurrentPage(1)
    setGeoCursor(null)
  }

  const handleQuickFilter = async (filter: QuickFilter) => {
    // Switching INTO "Nearest" — kick off the permission prompt if we don't
    // have cached coords yet. The prompt is awaited so the skeleton state
    // reflects "requesting" while the user makes their choice.
    if (filter === 'nearest' && !hasCoords) {
      setQuickFilter(filter)      // flip the tab visually right away
      resetPagination()
      const result = await requestLocation()
      if (!result) {
        // Permission denied — keep the tab selected; the UI shows a fallback
        // message instead of a worker list.
      }
      return
    }
    setQuickFilter(filter)
    resetPagination()
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
    resetPagination()
  }

  const handleSortChange = (value: string) => {
    setSort(value)
    resetPagination()
  }

  // === Helper: starting price for the card footer ===
  const getStartingPrice = (worker: WorkerProfile) => {
    if (worker.priceRange?.min) return worker.priceRange.min
    if (worker.services?.length > 0) return worker.services[0].price
    return 0
  }

  // === Helper: specialty shown under the worker name ===
  // Uses the profile-level Category (populated by the backend). If that's
  // missing, fall back to the first service's name.
  const getSpecialty = (worker: WorkerProfile) => {
    return worker.Category?.name || worker.services?.[0]?.name || 'خدمات متنوعة'
  }

  // === Quick-filter tab button config ===
  const quickFilters: { key: QuickFilter; label: string; icon: typeof Users }[] = [
    { key: 'all',      label: 'جميع الحرفيين', icon: Users },
    { key: 'topRated', label: 'الأعلى تقييماً',  icon: Star },
    { key: 'verified', label: 'موثق',           icon: BadgeCheck },
    { key: 'nearest',  label: 'الأقرب إليك',    icon: MapPin },
  ]

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      {/* Wrapper: sidebar on the right (RTL-friendly with flex-row) */}
      <div className="flex flex-col lg:flex-row pt-20">

        {/* ============================================================
            SIDEBAR — sticky to the right edge on lg+
            Quick filter tabs + sort + category checkboxes + apply button
            ============================================================ */}
        <aside className="w-full lg:w-72 lg:fixed lg:right-0 lg:top-20 lg:bottom-0 bg-surface-container-low/50 backdrop-blur-md p-6 lg:overflow-y-auto">

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-lg font-black text-primary mb-1">التصفية</h2>
            <p className="text-sm text-on-surface-variant">خصّص بحثك</p>
          </div>

          {/* Quick filter tabs — one is active (filled), rest are ghost */}
          <div className="flex flex-col gap-1 mb-8">
            {quickFilters.map(({ key, label, icon: Icon }) => {
              const active = quickFilter === key
              return (
                <button
                  key={key}
                  onClick={() => handleQuickFilter(key)}
                  className={`flex flex-row items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    active
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium flex-1 text-right">{label}</span>
                </button>
              )
            })}
          </div>

          {/* Sort dropdown */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-on-surface mb-3">ترتيب حسب</label>
            <div className="relative">
              <select
                value={sort}
                onChange={e => handleSortChange(e.target.value)}
                className="w-full bg-surface-container-lowest border-none rounded-lg py-2.5 px-3 text-sm text-on-surface-variant focus:ring-2 focus:ring-primary/20 appearance-none shadow-sm cursor-pointer pl-10 text-right"
              >
                <option value="rating">التقييم (الأعلى أولاً)</option>
                <option value="price">السعر (الأقل إلى الأعلى)</option>
                <option value="mostOrdered">الأكثر شعبية</option>
                <option value="alphabetical">أبجدي</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            </div>
          </div>

          {/* Category checkbox group */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-on-surface mb-3">الفئة</label>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pl-2">
              {categories.length === 0 ? (
                <p className="text-sm text-on-surface-variant">لا توجد فئات</p>
              ) : (
                categories.map(cat => (
                  <label key={cat._id} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat._id)}
                      onChange={() => toggleCategory(cat._id)}
                      className="w-4 h-4 text-primary rounded focus:ring-primary/20 bg-surface-container-lowest"
                    />
                    <span className="text-sm text-on-surface-variant group-hover:text-primary transition-colors">
                      {cat.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Apply filters button — here as a visual anchor; filters apply on change,
              so this mainly resets to page 1 and scrolls the user back to the top. */}
          <button
            onClick={() => { resetPagination(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="w-full bg-primary-container text-white font-semibold py-3 rounded-xl hover:bg-primary transition-colors shadow-sm"
          >
            تطبيق الفلاتر
          </button>
        </aside>

        {/* ============================================================
            MAIN CONTENT — worker cards grid + load more
            Left-side margin on lg reserves space for the fixed sidebar.
            ============================================================ */}
        <main className="flex-1 lg:mr-72 p-6 lg:p-10">

          {/* Hero header */}
          <div className="mb-10 max-w-7xl mx-auto text-right">
            <h1 className="text-3xl lg:text-4xl font-bold text-on-surface mb-3 tracking-tight">
              الحرفيون المتاحون
            </h1>
            <p className="text-lg text-on-surface-variant">
              اكتشف أفضل المزودين لخدماتك المنزلية، جاهزون للعمل فوراً.
            </p>
          </div>

          {/* Geo-mode permission states — shown above the grid when relevant */}
          {quickFilter === 'nearest' && geoStatus === 'requesting' && (
            <div className="mb-6 max-w-7xl mx-auto bg-surface-container-low rounded-2xl p-4 flex items-center gap-3 text-on-surface-variant">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">جاري الحصول على موقعك...</span>
            </div>
          )}
          {quickFilter === 'nearest' && geoStatus === 'denied' && (
            <div className="mb-6 max-w-7xl mx-auto bg-error-container/40 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-on-error-container">
                <MapPin className="w-5 h-5" />
                <span className="text-sm">نحتاج الوصول لموقعك لعرض الحرفيين الأقرب إليك.</span>
              </div>
              <button
                onClick={() => requestLocation()}
                className="text-sm font-bold text-primary hover:underline shrink-0"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {quickFilter === 'nearest' && geoStatus === 'unavailable' && (
            <div className="mb-6 max-w-7xl mx-auto bg-surface-container-low rounded-2xl p-4 text-on-surface-variant text-sm">
              متصفحك لا يدعم خاصية تحديد الموقع.
            </div>
          )}

          {/* Worker cards grid — 1 col mobile, 2 md, 3 xl.
              Skeleton state covers BOTH initial fetch AND the geo-permission
              wait (geoStatus === 'requesting') so the layout doesn't flash
              empty while the GPS fix lands. */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {((loading && (currentPage === 1 && !geoCursor)) || (quickFilter === 'nearest' && geoStatus === 'requesting')) ? (
              // Initial loading / geolocation requesting: 6 skeleton cards
              [...Array(6)].map((_, i) => (
                <div key={i} className="bg-surface-container-lowest rounded-3xl h-48 animate-pulse shadow-[0_24px_24px_rgba(18,28,42,0.06)]" />
              ))
            ) : workers.length === 0 && workersWithoutLocation.length === 0 ? (
              // Empty state (spans the full grid)
              <div className="col-span-full text-center py-20">
                <p className="text-on-surface-variant text-lg mb-2">لا يوجد حرفيين متاحين</p>
                <p className="text-on-surface-variant text-sm">جرّب تغيير الفلاتر</p>
              </div>
            ) : (
              workers.map((worker, idx) => {
                // Alternating status badge per the design:
                // workers with 100+ reviews get the "verified" teal badge,
                // otherwise they get the neutral "available now" badge.
                const isHighlyRated = (worker.totalReviews || 0) >= 100
                return (
                  <Link
                    key={`${worker._id}-${idx}`}
                    href={`/worker/${worker._id}`}
                    className="bg-surface-container-lowest rounded-3xl p-5 shadow-[0_24px_24px_rgba(18,28,42,0.06)] hover:shadow-[0_32px_40px_rgba(18,28,42,0.08)] transition-all duration-300 flex flex-col group relative overflow-hidden"
                  >
                    {worker.userId?._id && (
                      <div className="absolute top-5 left-5 z-10">
                        <HeartButton workerId={worker.userId._id} size="sm" />
                      </div>
                    )}
                    {/* Status badge — top-right corner */}
                    <div className={`absolute top-5 right-5 z-10 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 backdrop-blur-md ${
                      isHighlyRated
                        ? 'bg-primary-fixed text-on-primary-fixed'
                        : 'bg-secondary-fixed text-on-secondary-fixed'
                    }`}>
                      {isHighlyRated ? (
                        <>
                          <BadgeCheck className="w-3.5 h-3.5" />
                          <span>موثق</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 bg-green-500 rounded-full" />
                          <span>متاح الآن</span>
                        </>
                      )}
                    </div>

                    {/* Top row: portrait + identity block */}
                    <div className="flex items-start gap-5 mb-5">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-sm bg-surface-container-high">
                        {worker.userId?.profileImage ? (
                          <img
                            src={worker.userId.profileImage}
                            alt={worker.userId.firstName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-primary text-white flex items-center justify-center font-bold text-3xl">
                            {worker.userId?.firstName?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <h3 className="text-xl font-bold text-on-surface mb-1 truncate">
                          {worker.userId?.firstName} {worker.userId?.lastName}
                        </h3>
                        <p className="text-primary font-medium text-sm mb-2 truncate">
                          {getSpecialty(worker)}
                        </p>
                        <div className="flex items-center gap-1.5 text-sm justify-end">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span className="font-bold text-on-surface">{worker.ratingAverage?.toFixed(1) || '0.0'}</span>
                          <span className="text-on-surface-variant">({worker.totalReviews || 0} تقييم)</span>
                        </div>
                        {/* Distance line — only present when the listing came
                            from the geo branch ($geoNear sets distanceKm). */}
                        {typeof worker.distanceKm === 'number' && (
                          <div className="flex items-center gap-1.5 text-sm justify-end mt-1.5 text-on-surface-variant">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{worker.distanceKm.toFixed(1)} كم</span>
                            {worker.location?.address && (
                              <span className="truncate">· {worker.location.address}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom row: starting price + action button */}
                    <div className="mt-auto pt-4 border-t border-outline-variant/10 flex items-center justify-between">
                      <div className="text-right">
                        <span className="text-xs text-on-surface-variant block mb-0.5">تبدأ من</span>
                        <span className="text-lg font-bold text-on-surface">{getStartingPrice(worker)} ج.م</span>
                      </div>
                      <span className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                        isHighlyRated
                          ? 'bg-primary hover:bg-primary-container text-white'
                          : 'bg-secondary-container hover:bg-surface-variant text-on-secondary-container'
                      }`}>
                        {isHighlyRated ? 'احجز الآن' : 'عرض التفاصيل'}
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          {/* No-location tail — workers who haven't shared their coords yet.
              Only rendered in geo mode and on page 1 of the geo results. They
              keep visibility while still letting distance-sorted results lead. */}
          {geoMode && workersWithoutLocation.length > 0 && (
            <div className="max-w-7xl mx-auto mt-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-outline-variant/30" />
                <p className="text-sm text-on-surface-variant text-center px-2">
                  حرفيون لم يحددوا موقعهم بعد
                </p>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 opacity-90">
                {workersWithoutLocation.map((worker, idx) => {
                  const isHighlyRated = (worker.totalReviews || 0) >= 100
                  return (
                    <Link
                      key={`tail-${worker._id}-${idx}`}
                      href={`/worker/${worker._id}`}
                      className="bg-surface-container-lowest rounded-3xl p-5 shadow-[0_24px_24px_rgba(18,28,42,0.06)] hover:shadow-[0_32px_40px_rgba(18,28,42,0.08)] transition-all duration-300 flex flex-col group relative overflow-hidden"
                    >
                      {worker.userId?._id && (
                        <div className="absolute top-5 left-5 z-10">
                          <HeartButton workerId={worker.userId._id} size="sm" />
                        </div>
                      )}
                      <div className="flex items-start gap-5 mb-5">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-sm bg-surface-container-high">
                          {worker.userId?.profileImage ? (
                            <img
                              src={worker.userId.profileImage}
                              alt={worker.userId.firstName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full bg-primary text-white flex items-center justify-center font-bold text-3xl">
                              {worker.userId?.firstName?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <h3 className="text-xl font-bold text-on-surface mb-1 truncate">
                            {worker.userId?.firstName} {worker.userId?.lastName}
                          </h3>
                          <p className="text-primary font-medium text-sm mb-2 truncate">
                            {getSpecialty(worker)}
                          </p>
                          <div className="flex items-center gap-1.5 text-sm justify-end">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            <span className="font-bold text-on-surface">{worker.ratingAverage?.toFixed(1) || '0.0'}</span>
                            <span className="text-on-surface-variant">({worker.totalReviews || 0} تقييم)</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto pt-4 border-t border-outline-variant/10 flex items-center justify-between">
                        <div className="text-right">
                          <span className="text-xs text-on-surface-variant block mb-0.5">تبدأ من</span>
                          <span className="text-lg font-bold text-on-surface">{getStartingPrice(worker)} ج.م</span>
                        </div>
                        <span className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                          isHighlyRated
                            ? 'bg-primary hover:bg-primary-container text-white'
                            : 'bg-secondary-container hover:bg-surface-variant text-on-secondary-container'
                        }`}>
                          {isHighlyRated ? 'احجز الآن' : 'عرض التفاصيل'}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Load More — branches by mode.
              • Non-geo: bumps `currentPage` (page-number pagination).
              • Geo:     sets `geoCursor` from the last with-coords item;
                         the effect picks that up and refetches with the
                         afterDistance/afterId cursor. */}
          {(geoMode ? geoHasMore : pagination.page < pagination.pages) && (
            <div className="mt-12 text-center pb-10">
              <button
                onClick={() => {
                  if (geoMode) {
                    const last = workers[workers.length - 1]
                    // Use the raw distanceMeters (not the rounded distanceKm)
                    // so the cursor stays precise across page boundaries.
                    if (!last || typeof last.distanceMeters !== 'number') return
                    setGeoCursor({
                      afterDistance: last.distanceMeters,
                      afterId: last._id,
                    })
                  } else {
                    setCurrentPage(p => p + 1)
                  }
                }}
                disabled={loading}
                className="bg-surface-container-low text-primary hover:bg-surface-variant px-8 py-3 rounded-xl font-bold transition-colors shadow-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? 'جاري التحميل...' : 'عرض المزيد'}
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
