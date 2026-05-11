'use client'

import { Search, Star, Briefcase, Tag, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import BecomeProviderBanner from '@/components/BecomeProviderBanner'
import { api } from '@/lib/api'
import type { Category, WorkerProfile } from '@/lib/types'

// Same suggestion shape the Navbar uses. Two kinds: an individual service
// (search by name) or a category (filter by ID).
type SearchSuggestion =
  | { kind: 'service'; _id: string; name: string; categoryName: string | null }
  | { kind: 'category'; _id: string; name: string }

export default function HomePage() {
  const router = useRouter()
  const t = useTranslations()

  // ─── Hero search state ──────────────────────────────────────────
  // Mirrors the navbar autocomplete: debounced fetch, outside-click close,
  // Enter submits, suggestion click navigates + logs.
  const [searchInput, setSearchInput] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // ─── Categories (for the "Discover Services" grid) ──────────────
  const [categories, setCategories] = useState<Category[]>([])

  // ─── Dynamic "Most searched" chips from backend ─────────────────
  const [topSearches, setTopSearches] = useState<string[]>([])

  // ─── Real top workers (sorted by popularity = most reviews) ────
  // Backend fills this via GET /workers?sort=mostOrdered&limit=3
  const [topWorkers, setTopWorkers] = useState<WorkerProfile[]>([])

  // ─── Featured coupon for the promo banner ──────────────────────
  // Null until loaded OR if no admin-flagged coupon exists. When null we
  // hide the banner entirely so the page doesn't show stale copy.
  const [featuredCoupon, setFeaturedCoupon] = useState<any | null>(null)

  // Fetch categories + top searches + top workers in parallel on mount.
  useEffect(() => {
    api.get('/categories')
      .then(data => setCategories(data.categories))
      .catch(err => console.error('Failed to load categories:', err))

    api.get('/search/top?limit=3')
      .then(data => setTopSearches((data.items || []).map((i: any) => i.query)))
      .catch(err => console.error('Failed to load top searches:', err))

    api.get('/workers?sort=mostOrdered&limit=3&page=1')
      .then(data => setTopWorkers(data.workers || []))
      .catch(err => console.error('Failed to load top workers:', err))

    // /coupons/featured returns 204 (empty body) when no coupon is flagged.
    // We catch the JSON parse error quietly in that case.
    api.get('/coupons/featured')
      .then(data => setFeaturedCoupon(data?.coupon || null))
      .catch(() => setFeaturedCoupon(null))
  }, [])

  // ─── Debounced autocomplete fetch ───────────────────────────────
  // 250ms after last keystroke; cancels pending fetch on new keystroke.
  useEffect(() => {
    const q = searchInput.trim()
    if (!q) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(() => {
      api.get(`/search/suggest?q=${encodeURIComponent(q)}`)
        .then((data: { services: any[]; categories: any[] }) => {
          const combined: SearchSuggestion[] = [
            ...data.services.map(s => ({
              kind: 'service' as const,
              _id: s._id,
              name: s.name,
              categoryName: s.categoryName,
            })),
            ...data.categories.map(c => ({
              kind: 'category' as const,
              _id: c._id,
              name: c.name,
            })),
          ]
          setSuggestions(combined)
        })
        .catch(err => console.error('Search suggest failed:', err))
    }, 250)

    return () => clearTimeout(timer)
  }, [searchInput])

  // ─── Close autocomplete on outside click ────────────────────────
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Fire-and-forget search logger. Backend aggregates these into the
  // "most searched" chips. Failures are silently swallowed — analytics
  // shouldn't delay the user's navigation.
  const logSearch = (query: string, kind: 'service' | 'category' | 'text') => {
    api.post('/search/log', { query, kind }).catch(() => { /* ignore */ })
  }

  // Clicking a suggestion navigates + logs.
  const handleSelectSuggestion = (s: SearchSuggestion) => {
    setShowSuggestions(false)
    setSearchInput('')
    logSearch(s.name, s.kind)
    if (s.kind === 'service') {
      router.push(`/services?q=${encodeURIComponent(s.name)}`)
    } else {
      router.push(`/services?category=${s._id}`)
    }
  }

  // Enter / "بحث الآن" submits the raw text as a service-name search.
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = searchInput.trim()
    if (!q) return
    setShowSuggestions(false)
    setSearchInput('')
    logSearch(q, 'text')
    router.push(`/services?q=${encodeURIComponent(q)}`)
  }

  // Clicking a "most searched" chip is equivalent to submitting that text.
  const handleTagClick = (tag: string) => {
    logSearch(tag, 'text')
    router.push(`/services?q=${encodeURIComponent(tag)}`)
  }

  // Starting price helper — same logic as the providers page.
  const getStartingPrice = (worker: WorkerProfile) => {
    if (worker.priceRange?.min) return worker.priceRange.min
    if (worker.services?.length > 0) return worker.services[0].price
    return 0
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-7xl mx-auto">
        {/* ============ Hero Section ============ */}
        <section className="relative rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-primary to-primary-container p-8 md:p-16 text-right mb-16">
          <div className="relative z-10 max-w-2xl">
            <h1 className="text-white text-4xl md:text-6xl font-bold mb-6 leading-tight">
              {t('home.heroHeadingLine1')}
              <br />
              {t('home.heroHeadingLine2')}
            </h1>
            <p className="text-primary-fixed mb-10 text-lg opacity-90">
              {t('home.heroSubheading')}
            </p>

            {/* ─── Autocomplete search ─── */}
            <div ref={searchRef} className="relative mb-8">
              <form
                onSubmit={handleSearchSubmit}
                className="flex flex-col md:flex-row gap-4 bg-white/10 backdrop-blur-md p-2 rounded-3xl border border-white/10"
              >
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder={t('home.heroSearchPlaceholder')}
                    value={searchInput}
                    onChange={(e) => { setSearchInput(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full bg-white rounded-2xl border-none py-4 pr-12 pl-4 text-right focus:ring-0 outline-none"
                  />
                  <Search className="absolute right-4 top-4 w-5 h-5 text-primary pointer-events-none" />
                </div>
                <button
                  type="submit"
                  className="bg-primary-fixed text-on-primary-fixed px-8 py-4 rounded-2xl font-bold hover:bg-white transition-colors"
                >
                  {t('home.heroSearchButton')}
                </button>
              </form>

              {/* Suggestions dropdown — matches the navbar version */}
              {showSuggestions && searchInput.trim() && (
                <div className="absolute top-full right-0 left-0 md:left-auto md:w-[28rem] mt-2 bg-surface-container-lowest rounded-2xl shadow-lg border border-outline-variant/15 z-[100] overflow-hidden">
                  {suggestions.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm text-on-surface-variant">{t('home.heroNoResults')}</p>
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-y-auto py-1">
                      {/* Services group */}
                      {suggestions.some(s => s.kind === 'service') && (
                        <>
                          <p className="px-4 py-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t('home.heroServicesGroup')}</p>
                          {suggestions.filter(s => s.kind === 'service').map(s => (
                            <button
                              key={`svc-${s._id}`}
                              type="button"
                              onClick={() => handleSelectSuggestion(s)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors text-right"
                            >
                              <Briefcase className="w-4 h-4 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-on-surface truncate">{s.name}</p>
                                {s.kind === 'service' && s.categoryName && (
                                  <p className="text-xs text-on-surface-variant truncate">{s.categoryName}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </>
                      )}

                      {/* Categories group */}
                      {suggestions.some(s => s.kind === 'category') && (
                        <>
                          <p className="px-4 py-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wide border-t border-outline-variant/10 mt-1">{t('home.heroCategoriesGroup')}</p>
                          {suggestions.filter(s => s.kind === 'category').map(s => (
                            <button
                              key={`cat-${s._id}`}
                              type="button"
                              onClick={() => handleSelectSuggestion(s)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors text-right"
                            >
                              <Tag className="w-4 h-4 text-primary shrink-0" />
                              <p className="flex-1 text-sm text-on-surface truncate">{s.name}</p>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Most searched chips (dynamic from backend) ─── */}
            {topSearches.length > 0 && (
              <div className="flex flex-row flex-wrap gap-3">
                <span className="text-white/70 text-sm py-1">{t('home.mostSearched')}</span>
                {topSearches.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagClick(tag)}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs px-4 py-1.5 rounded-full border border-white/5 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ============ Become-Provider CTA ============ */}
        {/* Visible only to guests + customers — see component logic. */}
        <section className="mb-12">
          <BecomeProviderBanner />
        </section>

        {/* ============ Service Categories ============ */}
        <section className="mb-20">
          <div className="flex justify-between items-end mb-8 flex-row">
            <div className="text-right">
              <h2 className="text-2xl md:text-3xl font-bold text-on-surface">{t('home.categoriesTitle')}</h2>
              <p className="text-on-surface-variant mt-2">{t('home.categoriesSubtitle')}</p>
            </div>
            <Link href="/services" className="text-primary font-semibold flex items-center gap-1 hover:underline">
              <span>{t('common.viewAll')}</span>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {categories.map((cat) => (
              <Link
                key={cat._id}
                href={`/services?category=${cat._id}`}
                className="bento-item bg-surface-container-low p-6 rounded-[2rem] text-center flex flex-col items-center gap-4 cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden">
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <span className="text-2xl text-primary">📦</span>
                  )}
                </div>
                <span className="font-bold text-on-surface">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ============ Featured Providers (REAL data) ============ */}
        {/* Top 3 workers by popularity (sort=mostOrdered → totalReviews).
            "View all" links to /providers for the full listing page. */}
        <section className="mb-20">
          <div className="flex justify-between items-end mb-8 flex-row">
            <div className="text-right">
              <h2 className="text-2xl md:text-3xl font-bold text-on-surface">{t('home.featuredTitle')}</h2>
              <p className="text-on-surface-variant mt-2">{t('home.featuredSubtitle')}</p>
            </div>
            <Link href="/providers" className="text-primary font-semibold flex items-center gap-1 hover:underline">
              <span>{t('common.viewAll')}</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          {topWorkers.length === 0 ? (
            <div className="text-center py-12 bg-surface-container-low rounded-[2rem]">
              <p className="text-on-surface-variant">{t('home.featuredEmpty')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {topWorkers.map((worker) => {
                const specialty = worker.Category?.name || worker.services?.[0]?.name || t('home.defaultSpecialty')
                const description = worker.services?.[0]?.description || t('home.defaultDescription')
                return (
                  <div
                    key={worker._id}
                    className="bg-surface-container-lowest rounded-[2.5rem] p-6 shadow-lg hover:shadow-xl transition-all border border-outline-variant/10 flex flex-col"
                  >
                    <div className="flex items-start gap-4 flex-row mb-6">
                      {worker.userId?.profileImage ? (
                        <img
                          alt={worker.userId.firstName}
                          src={worker.userId.profileImage}
                          className="w-16 h-16 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-2xl">
                          {worker.userId?.firstName?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className="text-right flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-on-surface truncate">
                          {worker.userId?.firstName} {worker.userId?.lastName}
                        </h3>
                        <p className="text-primary text-sm font-medium truncate">{specialty}</p>
                      </div>
                      <div className="bg-primary/5 px-2 py-1 rounded-lg flex items-center gap-1">
                        <Star className="w-4 h-4 text-primary fill-primary" />
                        <span className="text-xs font-bold text-primary">
                          {worker.ratingAverage?.toFixed(1) || '0.0'}
                        </span>
                      </div>
                    </div>
                    <p className="text-on-surface-variant text-sm mb-6 text-right leading-relaxed line-clamp-3">
                      {description}
                    </p>
                    <div className="flex justify-between items-center flex-row mt-auto">
                      <span className="text-on-surface font-bold">
                        {t('home.startsFrom')} <span className="text-primary text-xl">{getStartingPrice(worker)}</span> {t('common.currency')}
                      </span>
                      <Link
                        href={`/worker/${worker._id}`}
                        className="bg-primary text-white px-6 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
                      >
                        {t('home.bookNow')}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* "View more" button below the top 3 → full /providers listing */}
          <div className="mt-10 text-center">
            <Link
              href="/providers"
              className="inline-flex items-center gap-2 bg-surface-container-low text-primary px-8 py-3 rounded-2xl font-bold hover:bg-surface-variant transition-colors shadow-sm"
            >
              {t('home.viewMoreProviders')}
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ============ Promotional Banner (dynamic — from featured coupon) ============
            Hidden entirely when no admin-flagged coupon is active.
            Admin sets this via /admin → أكواد الخصم → "عرض هذا الكود في قسم العرض". */}
        {featuredCoupon && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-surface-container-low rounded-[3rem] p-8 md:p-0 overflow-hidden">
            <div className="p-8 md:p-16 text-right">
              <span className="bg-primary-fixed text-on-primary-fixed px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6 inline-block">
                {t('home.bannerLabel')}
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-on-surface mb-6 leading-tight whitespace-pre-line">
                {featuredCoupon.bannerTitle || (
                  featuredCoupon.discountType === 'percentage'
                    ? t('home.bannerPercentage', { value: featuredCoupon.discountValue })
                    : t('home.bannerFixed', { value: featuredCoupon.discountValue })
                )}
              </h2>
              {featuredCoupon.bannerSubtitle && (
                <p className="text-on-surface-variant mb-4 text-base">{featuredCoupon.bannerSubtitle}</p>
              )}
              <p className="text-on-surface-variant mb-10 text-lg">
                {t('home.bannerUseCode')} <span className="text-primary font-bold border-2 border-dashed border-primary px-3 py-1 rounded-lg">{featuredCoupon.code}</span>
              </p>
              <Link
                href="/services"
                className="bg-primary text-white px-10 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform inline-block"
              >
                {featuredCoupon.bannerCtaLabel || t('home.bannerDefaultCta')}
              </Link>
            </div>
            <div className="h-[400px] w-full relative">
              {featuredCoupon.bannerImage ? (
                <img
                  alt={featuredCoupon.bannerTitle || featuredCoupon.code}
                  src={featuredCoupon.bannerImage}
                  className="absolute inset-0 w-full h-full object-cover rounded-3xl md:rounded-none"
                />
              ) : (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-primary to-primary-container rounded-3xl md:rounded-none flex items-center justify-center">
                  <span className="text-white text-6xl font-black font-mono">{featuredCoupon.code}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="w-full border-t border-border/15 bg-surface-container-low">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 gap-6 w-full max-w-7xl mx-auto">
          <div className="flex flex-col items-center md:items-end gap-2">
            <span className="text-lg font-bold text-on-surface">Angezny</span>
            <p className="text-sm text-right leading-6 text-on-surface-variant">{t('footer.tagline')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 flex-row">
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">{t('footer.about')}</Link>
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">{t('footer.terms')}</Link>
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">{t('footer.privacy')}</Link>
            <Link href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">{t('footer.contact')}</Link>
          </div>
          <div className="text-sm text-on-surface-variant">{t('footer.copyright')}</div>
        </div>
      </footer>
    </div>
  )
}
