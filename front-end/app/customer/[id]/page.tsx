'use client'

// =============================================================================
// PUBLIC CUSTOMER PROFILE — /customer/[id]
// =============================================================================

import { useState, useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { Star, Calendar, ChevronLeft, ChevronRight, MessageSquare, ShieldOff, ShoppingBag, CheckCircle, Plus, X } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { CustomerPublicProfile, CustomerReview, PaginationInfo } from '@/lib/types'

// ── AddOrderForCustomer modal ─────────────────────────────────────────────
// Worker-only inline form for creating a one-off custom-priced order against
// the customer whose profile is being viewed. Hits POST /api/worker/orders.
// Server validates that this worker has a prior order with this customer.
function AddOrderForCustomer({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string
  customerName: string
  onClose: (created: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [paymentTiming, setPaymentTiming] = useState<'before' | 'after'>('before')
  const [paymentMode, setPaymentMode] = useState<'cash_on_delivery' | 'card'>('cash_on_delivery')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const priceNum = Number(price)
    if (!title.trim()) return setError('يرجى إدخال وصف الطلب')
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setError('يرجى إدخال سعر صحيح')

    setSubmitting(true)
    try {
      await api.postWithAuth('/worker/orders', {
        customerId,
        customTitle: title.trim(),
        customPrice: priceNum,
        paymentTiming,
        paymentMode,
        location: address.trim() ? { address: address.trim() } : undefined,
      })
      onClose(true)
    } catch (err: any) {
      setError(err?.message || 'تعذر إنشاء الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !submitting && onClose(false)}>
      <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold">إضافة طلب لـ {customerName}</h3>
            <p className="text-sm text-on-surface-variant mt-1">العميل سيصله إشعار للمراجعة، ثم يؤكد ويدفع حسب التوقيت الذي تختاره.</p>
          </div>
          <button type="button" onClick={() => !submitting && onClose(false)} className="text-on-surface-variant hover:text-on-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">وصف الطلب</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="مثلاً: استبدال القاطع الكهربائي"
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">السعر (جنيه)</label>
            <input
              type="number"
              min="1"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">توقيت الدفع</label>
            <div className="flex gap-3">
              {(['before', 'after'] as const).map((opt) => (
                <label key={opt} className={`flex-1 px-3 py-2 rounded-lg border text-center cursor-pointer ${paymentTiming === opt ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30'}`}>
                  <input type="radio" name="paymentTiming" value={opt} checked={paymentTiming === opt} onChange={() => setPaymentTiming(opt)} className="sr-only" />
                  {opt === 'before' ? 'قبل الخدمة' : 'بعد الخدمة'}
                </label>
              ))}
            </div>
            <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
              {paymentTiming === 'before'
                ? 'قبل الخدمة: العميل يدفع قبل بدء العمل.'
                : 'بعد الخدمة: العميل يؤكد الآن ويدفع بعد إنهاء الخدمة.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">طريقة الدفع</label>
            <div className="flex gap-3">
              {(['cash_on_delivery', 'card'] as const).map((opt) => (
                <label key={opt} className={`flex-1 px-3 py-2 rounded-lg border text-center cursor-pointer ${paymentMode === opt ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30'}`}>
                  <input type="radio" name="paymentMode" value={opt} checked={paymentMode === opt} onChange={() => setPaymentMode(opt)} className="sr-only" />
                  {opt === 'cash_on_delivery' ? 'كاش' : 'بطاقة'}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">العنوان (اختياري)</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => !submitting && onClose(false)} disabled={submitting} className="flex-1 px-4 py-2 rounded-lg border border-outline-variant/30">
              إلغاء
            </button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
              {submitting ? '...جارٍ الإرسال' : 'إنشاء الطلب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StarRating({ rating, size = 'w-5 h-5' }: { rating: number; size?: string }) {
  const filled = Math.round(rating)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`${size} ${i < filled ? 'fill-yellow-400 text-yellow-400' : 'text-outline-variant/40'}`}
        />
      ))}
    </div>
  )
}

export default function CustomerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()

  const [customer, setCustomer] = useState<CustomerPublicProfile | null>(null)
  const [reviews, setReviews] = useState<CustomerReview[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 6, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOrderOpen, setAddOrderOpen] = useState(false)
  const [createdToast, setCreatedToast] = useState(false)

  // Auth gate redirect
  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) {
      router.push(`/signin?redirect=${encodeURIComponent(pathname || '/')}`)
    }
  }, [authLoading, isLoggedIn, router, pathname])

  // Fetch profile + reviews (only when role is allowed)
  useEffect(() => {
    if (authLoading || !isLoggedIn || !params.id) return
    if (user && user.role !== 'worker' && user.role !== 'admin') {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const [profileData, reviewsData] = await Promise.all([
          api.getWithAuth(`/customers/${params.id}`),
          api.getWithAuth(`/customers/${params.id}/reviews?page=${pagination.page}&limit=6`),
        ])
        if (cancelled) return
        setCustomer(profileData.customer)
        setReviews(reviewsData.reviews)
        setPagination(reviewsData.pagination)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'تعذر تحميل الملف')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [authLoading, isLoggedIn, user, params.id, pagination.page])

  if (authLoading || (loading && !error)) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-5xl mx-auto">
          <div className="bg-surface-container-lowest p-10 rounded-2xl animate-pulse">
            <div className="w-24 h-24 rounded-full bg-surface-container-high mx-auto mb-4" />
            <div className="h-6 bg-surface-container-high rounded w-48 mx-auto mb-2" />
            <div className="h-4 bg-surface-container-high rounded w-32 mx-auto" />
          </div>
        </main>
      </div>
    )
  }

  // Role gate — non-worker, non-admin viewers see a 403 message
  if (user && user.role !== 'worker' && user.role !== 'admin') {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
          <div className="bg-surface-container-lowest p-10 rounded-2xl border border-outline-variant/10 text-center">
            <ShieldOff className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">هذه الصفحة مخصصة لمزودي الخدمة فقط</h1>
            <p className="text-on-surface-variant">لا تتوفر صفحات ملف العملاء لحسابات العملاء.</p>
          </div>
        </main>
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
          <div className="text-center py-24">
            <h1 className="text-2xl font-bold mb-2">لم يتم العثور على العميل</h1>
            <p className="text-on-surface-variant">{error || 'الرابط غير صحيح'}</p>
          </div>
        </main>
      </div>
    )
  }

  const memberYear = customer.createdAt ? new Date(customer.createdAt).getFullYear() : null
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })

  const goToPage = (page: number) => setPagination(prev => ({ ...prev, page }))

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      {addOrderOpen && customer && (
        <AddOrderForCustomer
          customerId={String(params.id)}
          customerName={`${customer.firstName} ${customer.lastName}`.trim()}
          onClose={(created) => {
            setAddOrderOpen(false)
            if (created) {
              setCreatedToast(true)
              setTimeout(() => setCreatedToast(false), 4000)
            }
          }}
        />
      )}

      {createdToast && (
        <div className="fixed top-24 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg">
          تم إرسال الطلب — في انتظار تأكيد العميل
        </div>
      )}

      <section className="bg-primary text-white pt-24 pb-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-8">
            <div className="shrink-0">
              {customer.profileImage ? (
                <img
                  src={customer.profileImage}
                  alt={customer.firstName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white/30"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-white/15 flex items-center justify-center font-bold text-4xl border-4 border-white/30">
                  {customer.firstName?.charAt(0) || '?'}
                </div>
              )}
            </div>
            <div className="text-center md:text-right flex-1">
              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2 md:justify-end">
                <h1 className="text-4xl font-bold">{customer.firstName} {customer.lastName}</h1>
                {user?.role === 'worker' && (
                  <button
                    type="button"
                    onClick={() => setAddOrderOpen(true)}
                    className="inline-flex items-center gap-2 bg-white text-primary px-4 py-2 rounded-lg font-semibold shadow hover:bg-white/90 self-center md:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة طلب لهذا العميل
                  </button>
                )}
              </div>
              <div className="flex flex-wrap justify-center md:justify-start gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-lg">{customer.customerRatingAverage.toFixed(1)}</span>
                  <span>({customer.customerTotalReviews} تقييم)</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  <span className="font-bold text-lg">{customer.totalOrders}</span>
                  <span>طلبات</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-bold text-lg">{customer.completedOrders}</span>
                  <span>مكتملة</span>
                </div>
                {memberYear && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    <span>عميل منذ {memberYear}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="-mt-20 pb-24 px-6 max-w-5xl mx-auto relative z-10">
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            تقييمات الحرفيين عن هذا العميل
          </h2>
          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <Star className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
              <p className="text-on-surface-variant">لا توجد تقييمات بعد</p>
            </div>
          ) : (
            <div className="space-y-6">
              {reviews.map(review => {
                const author = typeof review.workerId === 'string' ? null : review.workerId
                return (
                  <div key={review._id} className="flex gap-4">
                    {author?.profileImage ? (
                      <img src={author.profileImage} alt={author.firstName} className="w-12 h-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-primary shrink-0">
                        {author?.firstName?.charAt(0) || '?'}
                      </div>
                    )}
                    <div className="flex-1 bg-surface-container-low p-5 rounded-2xl rounded-tr-none">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-bold">{author?.firstName} {author?.lastName}</h4>
                          <div className="mt-1"><StarRating rating={review.rating} size="w-4 h-4" /></div>
                        </div>
                        <span className="text-on-surface-variant text-xs">{formatDate(review.createdAt)}</span>
                      </div>
                      {review.comment && (
                        <p className="text-on-surface-variant leading-relaxed text-sm">{review.comment}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {pagination.pages > 1 && (
            <div className="mt-8 flex justify-center items-center gap-2">
              <button
                onClick={() => goToPage(Math.max(1, pagination.page - 1))}
                disabled={pagination.page === 1}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold ${
                    pagination.page === page ? 'bg-primary text-white' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => goToPage(Math.min(pagination.pages, pagination.page + 1))}
                disabled={pagination.page === pagination.pages}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
