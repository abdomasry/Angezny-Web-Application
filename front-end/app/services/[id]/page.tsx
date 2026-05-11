'use client'

// =============================================================================
// PUBLIC SERVICE DETAIL PAGE — /services/[id]
// =============================================================================
// One service from one worker. The "product page" of the marketplace.
//
// Why this exists:
//   The listing on /services already has a fast-path "اطلب الآن" button that
//   jumps straight to /checkout. That's great for shoppers who already know
//   what they want — but most customers want to read a description, see
//   pictures, and check who they're hiring before committing. Without this
//   page they hit checkout cold; conversion suffers and trust is low.
//
// Data:
//   GET /api/workers/service/:id  →  { service }
//   The endpoint hides services that aren't `active` AND `approved`, so a 404
//   from the API is also a "show 404" cue here.
//
// Route param access:
//   In Next 16, route params are a Promise on the server. In Client
//   Components we use the useParams() hook which still resolves to a plain
//   object — same pattern the rest of the codebase uses (see /worker/[id]).
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Star, ShoppingBag, MessageCircleQuestion, BadgeCheck, Tag, ChevronLeft,
  Clock, ImageIcon, AlertCircle,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import GalleryLightbox from '@/components/GalleryLightbox'
import CloudinaryImage from '@/components/CloudinaryImage'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import type { WorkerService, PortfolioItem } from '@/lib/types'

// Shape the /api/workers/service/:id endpoint actually returns. The base
// WorkerService type doesn't include the populated worker chain, so we extend
// it locally instead of polluting the shared type.
interface ServiceDetail extends WorkerService {
  workerID?: {
    _id: string
    verificationStatus?: string
    // Trust signals — populated by the backend so the worker card on this page
    // can show stars + count without a second API call.
    ratingAverage?: number
    totalReviews?: number
    rank?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
    userId?: {
      _id: string
      firstName?: string
      lastName?: string
      profileImage?: string
    }
  }
  categoryId?: string | { _id: string; name: string }
}

// Format a service's price line. Mirrors the formatter in /services so the
// number a user sees on the listing matches what they see on the detail page.
function formatPrice(service: ServiceDetail | null) {
  if (!service) return ''
  if (service.typeofService === 'range' && service.priceRange) {
    return `${service.priceRange.min ?? 0} – ${service.priceRange.max ?? 0} ج.م`
  }
  const unit = service.typeofService === 'hourly' ? ' / الساعة' : ''
  return `${service.price ?? 0} ج.م${unit}`
}

export default function ServiceDetailPage() {
  // useParams() works in client components and gives the dynamic [id] segment.
  // It returns string | string[] | undefined, so we narrow it here.
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const router = useRouter()
  const { isLoggedIn, user } = useAuth()
  const { findOrCreateConversation } = useChat()

  const [service, setService] = useState<ServiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Lightbox state — null when closed. The component takes a PortfolioItem,
  // so we shape the service's images into one on the fly when the user opens
  // the gallery.
  const [openItem, setOpenItem] = useState<PortfolioItem | null>(null)

  // Surfaced error from the "ask" CTA so failures aren't silent.
  // Cleared the next time the user clicks the button.
  const [askError, setAskError] = useState('')
  const [asking, setAsking] = useState(false)

  // ─── Fetch service ────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    let cancelled = false
    const run = async () => {
      try {
        const data = await api.get(`/workers/service/${id}`)
        if (!cancelled) setService(data.service)
      } catch (err: unknown) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'لم يتم العثور على الخدمة'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [id])

  // ─── Derived data ─────────────────────────────────────────────────
  const worker = service?.workerID
  const workerName = useMemo(() => {
    const u = worker?.userId
    if (!u) return ''
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
  }, [worker])

  const categoryName = useMemo(() => {
    if (!service?.categoryId) return ''
    if (typeof service.categoryId === 'string') return ''
    return service.categoryId.name ?? ''
  }, [service])

  const images = service?.images && service.images.length > 0 ? service.images : []

  // ─── Actions ──────────────────────────────────────────────────────
  // Order: jump to checkout. Logged-out users go to /signin and are returned
  // here-then-checkout via the existing redirect contract.
  const handleOrder = () => {
    if (!service) return
    const target = `/checkout?service=${service._id}`
    if (!isLoggedIn) {
      router.push(`/signin?redirect=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  // Ask: open or create a 1:1 chat with the worker, then deep-link the
  // composer to this service. MessageThread reads ?service=<id> and prefills
  // a templated question.
  //
  // Failure modes we surface (instead of silently doing nothing):
  //   • Worker's user account isn't populated → "بيانات المزود غير مكتملة"
  //   • Trying to chat with yourself (you're the worker) → backend 400
  //   • Backend down / network error → exception
  const handleAsk = async () => {
    setAskError('')
    if (!service) return
    if (!isLoggedIn) {
      router.push(`/signin?redirect=${encodeURIComponent(`/services/${service._id}`)}`)
      return
    }
    const otherUserId = service.workerID?.userId?._id
    if (!otherUserId) {
      setAskError('بيانات مزود الخدمة غير متاحة. حاول لاحقاً.')
      return
    }
    // Block self-chat at the UI layer so the user gets a clear message
    // instead of a silent backend 400.
    if (user?.id && String(user.id) === String(otherUserId)) {
      setAskError('هذه خدمتك أنت — لا يمكن استفسارك عن نفسك. سجّل دخولاً كعميل لتجربة الطلب.')
      return
    }
    setAsking(true)
    try {
      const conv = await findOrCreateConversation(otherUserId, service._id)
      if (conv) {
        router.push(`/messages/${conv._id}?service=${service._id}`)
      } else {
        setAskError('تعذّر فتح المحادثة. تحقق من اتصالك ثم حاول مرة أخرى.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setAskError(msg)
    } finally {
      setAsking(false)
    }
  }

  const openGallery = (startIndex = 0) => {
    if (images.length === 0) return
    // Reorder images so the chosen one is first; GalleryLightbox starts at 0.
    const reordered = [
      ...images.slice(startIndex),
      ...images.slice(0, startIndex),
    ]
    setOpenItem({
      title: service?.name ?? '',
      description: service?.description ?? '',
      images: reordered,
    })
  }

  // ─── Loading skeleton ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
            <div className="bg-surface-container-lowest rounded-2xl h-105 animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 bg-surface-container-lowest rounded animate-pulse" />
              <div className="h-5 bg-surface-container-lowest rounded w-2/3 animate-pulse" />
              <div className="h-32 bg-surface-container-lowest rounded animate-pulse" />
              <div className="h-12 bg-surface-container-lowest rounded animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ─── Error / not-found state ──────────────────────────────────────
  // The backend 404s for both "doesn't exist" and "not approved/active". We
  // present a single friendly state for both — no need to leak the difference.
  if (error || !service) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto text-center">
          <div className="bg-surface-container-lowest rounded-2xl p-12">
            <AlertCircle className="w-12 h-12 text-on-surface-variant mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-on-surface mb-2">
              لم يتم العثور على الخدمة
            </h1>
            <p className="text-on-surface-variant mb-6">
              قد تكون الخدمة غير متاحة حالياً أو تم إزالتها.
            </p>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-container transition-colors"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              تصفح كل الخدمات
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // ─── Main render ──────────────────────────────────────────────────
  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-sm text-on-surface-variant mb-6">
          <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
          <span className="mx-2">/</span>
          <Link href="/services" className="hover:text-primary transition-colors">الخدمات</Link>
          {categoryName && (
            <>
              <span className="mx-2">/</span>
              <span className="hover:text-primary transition-colors">{categoryName}</span>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-on-surface">{service.name}</span>
        </nav>

        {/* Two-column layout: gallery on the right (RTL), info on the left.
            DOM order = visual order in RTL reversed. Putting the gallery
            first in the DOM puts it on the visual right where the eye lands. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-8">

          {/* ============ GALLERY ============ */}
          <section className="space-y-3">
            {images.length > 0 ? (
              <>
                {/* Hero image — click to open the lightbox */}
                <button
                  type="button"
                  onClick={() => openGallery(0)}
                  className="relative block w-full h-72 sm:h-96 rounded-2xl overflow-hidden bg-surface-container-high group"
                >
                  <CloudinaryImage
                    src={images[0]}
                    alt={service.name}
                    fill
                    sizes="(min-width: 1024px) 700px, 100vw"
                    priority
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {images.length > 1 && (
                    <span className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
                      +{images.length - 1}
                    </span>
                  )}
                </button>

                {/* Thumbnail row — only when there's more than one image */}
                {images.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {images.slice(1, 5).map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => openGallery(i + 1)}
                        className="relative h-20 rounded-xl overflow-hidden bg-surface-container-high group"
                      >
                        <CloudinaryImage
                          src={src}
                          alt={`${service.name} ${i + 2}`}
                          fill
                          sizes="(min-width: 640px) 160px, 25vw"
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // No images yet — show a tasteful placeholder so the layout
              // doesn't collapse. Workers without portfolio images can still
              // be ordered; we just nudge them visually.
              <div className="w-full h-72 sm:h-96 rounded-2xl bg-linear-to-br from-primary/10 to-primary-container/30 flex flex-col items-center justify-center text-on-surface-variant">
                <ImageIcon className="w-12 h-12 mb-2 opacity-40" />
                <p className="text-sm">لا توجد صور للخدمة بعد</p>
              </div>
            )}
          </section>

          {/* ============ INFO + CTA ============ */}
          <aside className="space-y-5">

            {/* Title + category chip */}
            <div className="text-right">
              {categoryName && (
                <span className="inline-flex items-center gap-1.5 bg-primary-container/40 text-primary text-xs font-semibold px-2.5 py-1 rounded-full mb-3">
                  <Tag className="w-3 h-3" />
                  {categoryName}
                </span>
              )}
              <h1 className="text-3xl font-black text-on-surface mb-2 leading-tight">
                {service.name}
              </h1>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-primary">
                  {formatPrice(service)}
                </span>
                {service.typeofService === 'range' && (
                  <span className="text-xs text-on-surface-variant">
                    حسب نطاق العمل
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {service.description ? (
              <div className="bg-surface-container-lowest rounded-2xl p-5 text-right h-50 max-h-100" style={{lineBreak: "anywhere", overflow: "hidden", overflowY: "scroll"}}>
                <h2 className="text-sm font-bold text-on-surface mb-2">عن هذه الخدمة</h2>
                {/* whitespace-pre-line preserves line breaks the worker typed */}
                <span className="text-sm text-on-surface-variant leading-7 whitespace-pre-line overflow-auto max-w-100 h-20 max-h-100">
                  {service.description}
                </span>
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-2xl p-5 text-right text-sm text-on-surface-variant">
                لم يضف مزود الخدمة وصفاً تفصيلياً بعد. تواصل معه مباشرة لمزيد من المعلومات.
              </div>
            )}

            {/* Worker card */}
            {worker?.userId && (
              <Link
                href={`/worker/${worker._id}`}
                className="flex items-center gap-3 bg-surface-container-lowest rounded-2xl p-4 hover:bg-surface-container-low transition-colors"
              >
                <div className="relative w-14 h-14 rounded-full overflow-hidden bg-surface-container-high shrink-0">
                  {worker.userId.profileImage ? (
                    <CloudinaryImage
                      src={worker.userId.profileImage}
                      alt={workerName}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary font-black text-xl">
                      {worker.userId.firstName?.charAt(0) ?? '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-bold text-on-surface truncate">{workerName || 'مزود الخدمة'}</span>
                    {worker.verificationStatus === 'approved' && (
                      <BadgeCheck className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </div>
                  {/* Rating row — only render once we know the worker has reviews.
                      Workers with zero reviews show "حرفي جديد" instead of a
                      misleading 0.0 / "no reviews" display. */}
                  {(worker.totalReviews ?? 0) > 0 ? (
                    <div className="flex items-center gap-1.5 justify-end mt-0.5">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-bold text-on-surface">
                        {worker.ratingAverage?.toFixed(1) ?? '0.0'}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        ({worker.totalReviews} تقييم)
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-on-surface-variant">حرفي جديد</span>
                  )}
                  <span className="text-xs text-primary mt-1 block">عرض ملف الحرفي الكامل ←</span>
                </div>
              </Link>
            )}

            {/* CTAs */}
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleOrder}
                className="w-full inline-flex items-center justify-center gap-2 bg-primary text-on-primary font-bold py-3.5 rounded-2xl hover:bg-primary-container transition-colors shadow-sm"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>اطلب هذه الخدمة الآن</span>
              </button>
              <button
                type="button"
                onClick={handleAsk}
                disabled={asking}
                className="w-full inline-flex items-center justify-center gap-2 border border-outline-variant/30 text-on-surface font-semibold py-3 rounded-2xl hover:bg-surface-container-low transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                <MessageCircleQuestion className="w-4 h-4" />
                <span>{asking ? 'جارٍ فتح المحادثة...' : 'استفسر قبل الطلب'}</span>
              </button>
              {askError && (
                <p
                  role="alert"
                  className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-right"
                >
                  {askError}
                </p>
              )}
            </div>

            {/* Trust strip */}
            <div className="flex items-center justify-around text-xs text-on-surface-variant gap-3 px-2">
              <span className="flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-primary" />
                مزود موثّق
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                تقييمات حقيقية
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary" />
                دفع عند الاستلام
              </span>
            </div>
          </aside>
        </div>
      </main>

      {/* Lightbox renders at the root so it overlays everything */}
      <GalleryLightbox item={openItem} onClose={() => setOpenItem(null)} />
    </div>
  )
}
