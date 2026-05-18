'use client'

// Admin-only read-only detail page for a single order.
// Each section is omitted entirely when its data is absent — admins should
// never see empty placeholders that imply "this might be filled in later."

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  User as UserIcon,
  Wrench,
  MapPin,
  CreditCard,
  StickyNote,
  Camera,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

// Loose shape — the admin list already uses `any` here. A future cleanup
// can introduce a shared AdminOrderDetail interface; for now we accept the
// dynamic shape returned by the backend populate chain.
type AdminOrder = {
  _id: string
  status: string
  description?: string
  proposedPrice?: number
  discountAmount?: number
  couponCode?: string | null
  paymentMode?: 'cash_on_delivery' | 'card'
  paymentTiming?: 'before' | 'after'
  scheduledDate?: string
  createdAt?: string
  completedAt?: string
  rejectionReason?: string | null
  problemImages?: string[]
  customerId?: {
    _id?: string
    firstName?: string
    lastName?: string
    profileImage?: string
    email?: string
    phone?: string
  }
  workerId?: {
    _id?: string
    firstName?: string
    lastName?: string
    profileImage?: string
    email?: string
    phone?: string
  } | null
  categoryId?: { _id?: string; name?: string }
  serviceId?: {
    _id?: string
    name?: string
    images?: string[]
    price?: number
    typeofService?: string
    priceRange?: { min?: number; max?: number }
  }
  location?: {
    address?: string
    governorate?: string
    city?: string
    lat?: number
    lng?: number
  }
  completionReport?: {
    details?: string
    images?: string[]
    submittedAt?: string
  }
  cancellationRequest?: {
    requestedBy?: 'customer' | 'worker'
    reason?: string
    status?: 'pending' | 'approved' | 'denied'
    requestedAt?: string
    respondedAt?: string
    denialReason?: string
  }
  payment?: {
    _id?: string
    status?: string
    amount?: number
    method?: string
    paymobOrderId?: string | number
    transactionId?: string | number
  } | null
}

// Reuse the same status palette used in the admin list. Inlined here so the
// detail page is independent of the admin list state — admins might deep-link
// without ever opening the list.
const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'قيد الانتظار', bg: 'bg-amber-50', text: 'text-amber-700' },
  pending_customer_confirmation: { label: 'بانتظار العميل', bg: 'bg-amber-50', text: 'text-amber-700' },
  accepted: { label: 'مقبول', bg: 'bg-blue-50', text: 'text-blue-700' },
  in_progress: { label: 'قيد التنفيذ', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  completed: { label: 'مكتمل', bg: 'bg-green-50', text: 'text-green-700' },
  cancelled: { label: 'ملغي', bg: 'bg-gray-100', text: 'text-gray-600' },
  rejected: { label: 'مرفوض', bg: 'bg-red-50', text: 'text-red-600' },
}

const formatDate = (iso?: string) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

const paymentModeLabel = (mode?: string) =>
  mode === 'card' ? 'بطاقة / محفظة' : mode === 'cash_on_delivery' ? 'نقدي عند الاستلام' : '—'

const paymentTimingLabel = (timing?: string) =>
  timing === 'before' ? 'قبل الخدمة' : timing === 'after' ? 'بعد الخدمة' : '—'

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
      <h2 className="flex items-center gap-2 text-base font-bold text-on-surface border-r-4 border-primary pr-3 mb-4">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function PersonBlock({
  person,
}: {
  person: NonNullable<AdminOrder['customerId']>
}) {
  const initial = person.firstName?.charAt(0) || '?'
  return (
    <div className="flex items-center gap-4">
      {person.profileImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.profileImage} alt="" className="w-14 h-14 rounded-full object-cover" />
      ) : (
        <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center text-lg font-bold">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-on-surface">
          {person.firstName} {person.lastName}
        </p>
        {person.email && (
          <p className="text-sm text-on-surface-variant break-all">{person.email}</p>
        )}
        {person.phone && (
          <p className="text-sm text-on-surface-variant" dir="ltr">{person.phone}</p>
        )}
      </div>
    </div>
  )
}

function ImageGrid({ urls, label }: { urls: string[]; label: string }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
      {urls.map((url, idx) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block aspect-square rounded-xl overflow-hidden bg-surface-container-low hover:opacity-80 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${label} ${idx + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  )
}

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Next 15: route params are now a Promise — unwrap with React.use().
  const { id } = use(params)
  const router = useRouter()
  const { isLoggedIn, isLoading: authLoading, user } = useAuth()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Admin gate — mirror the existing /admin page's pattern.
  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) {
      router.replace('/signin')
      return
    }
    if (user?.role !== 'admin') {
      router.replace('/')
    }
  }, [authLoading, isLoggedIn, user, router])

  useEffect(() => {
    if (authLoading || !isLoggedIn || user?.role !== 'admin') return
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .getWithAuth(`/admin/orders/${id}`)
      .then((data) => {
        if (!cancelled) setOrder(data.order)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذّر تحميل الطلب')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, authLoading, isLoggedIn, user])

  if (authLoading || loading) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-40 text-on-surface-variant">
            <Loader2 className="w-6 h-6 animate-spin mx-2" />
            جاري التحميل...
          </div>
        </main>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto">
          <div className="bg-surface-container-lowest p-8 rounded-xl text-center">
            <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
            <h1 className="text-xl font-bold text-on-surface mb-2">تعذّر تحميل الطلب</h1>
            <p className="text-on-surface-variant mb-6">{error || 'الطلب غير موجود'}</p>
            <Link
              href="/admin?tab=orders"
              className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-container transition-colors"
            >
              العودة إلى قائمة الطلبات
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const badge = STATUS_BADGE[order.status] || {
    label: order.status,
    bg: 'bg-gray-100',
    text: 'text-gray-500',
  }
  const hasCoords =
    typeof order.location?.lat === 'number' && typeof order.location?.lng === 'number'
  const mapUrl = hasCoords
    ? `https://www.google.com/maps?q=${order.location!.lat},${order.location!.lng}`
    : null
  const shortId = order._id.slice(-6).toUpperCase()
  const basePrice =
    order.serviceId?.typeofService === 'range'
      ? order.serviceId?.priceRange?.min
      : order.serviceId?.price

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/admin?tab=orders"
          className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى قائمة الطلبات
        </Link>

        {/* Header */}
        <div className="bg-surface-container-lowest rounded-xl p-5 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-on-surface">
                طلب #{shortId}
              </h1>
              <p className="text-sm text-on-surface-variant mt-1">
                {order.categoryId?.name || 'خدمة عامة'}
              </p>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-bold ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 text-sm">
            <div>
              <p className="text-on-surface-variant text-xs mb-1">تاريخ الإنشاء</p>
              <p className="font-medium text-on-surface">{formatDate(order.createdAt)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant text-xs mb-1">موعد الخدمة</p>
              <p className="font-medium text-on-surface">{formatDate(order.scheduledDate)}</p>
            </div>
            {order.completedAt && (
              <div>
                <p className="text-on-surface-variant text-xs mb-1">تاريخ الإنجاز</p>
                <p className="font-medium text-on-surface">{formatDate(order.completedAt)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Customer */}
        {order.customerId && (
          <SectionCard icon={<UserIcon className="w-5 h-5 text-primary" />} title="العميل">
            <PersonBlock person={order.customerId} />
          </SectionCard>
        )}

        {/* Worker */}
        <SectionCard icon={<Wrench className="w-5 h-5 text-primary" />} title="مزود الخدمة">
          {order.workerId ? (
            <PersonBlock person={order.workerId} />
          ) : (
            <p className="text-on-surface-variant text-sm">غير معيّن</p>
          )}
        </SectionCard>

        {/* Service */}
        {order.serviceId && (
          <SectionCard icon={<Wrench className="w-5 h-5 text-primary" />} title="الخدمة">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-on-surface-variant">الاسم: </span>
                <span className="font-medium text-on-surface">{order.serviceId.name || '—'}</span>
              </p>
              <p>
                <span className="text-on-surface-variant">التصنيف: </span>
                <span className="font-medium text-on-surface">
                  {order.categoryId?.name || '—'}
                </span>
              </p>
              <p>
                <span className="text-on-surface-variant">السعر الأساسي: </span>
                <span className="font-medium text-on-surface">
                  {basePrice ? `${basePrice} ج.م` : '—'}
                </span>
              </p>
            </div>
          </SectionCard>
        )}

        {/* Location */}
        {order.location?.address && (
          <SectionCard icon={<MapPin className="w-5 h-5 text-primary" />} title="الموقع">
            <p className="text-on-surface">{order.location.address}</p>
            {(order.location.governorate || order.location.city) && (
              <p className="text-sm text-on-surface-variant mt-1">
                {[order.location.governorate, order.location.city].filter(Boolean).join(' • ')}
              </p>
            )}
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm text-primary hover:underline"
              >
                فتح على الخريطة ({order.location.lat!.toFixed(5)}, {order.location.lng!.toFixed(5)})
              </a>
            )}
          </SectionCard>
        )}

        {/* Payment */}
        <SectionCard icon={<CreditCard className="w-5 h-5 text-primary" />} title="الدفع">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-on-surface-variant text-xs mb-1">طريقة الدفع</p>
              <p className="font-medium">{paymentModeLabel(order.paymentMode)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant text-xs mb-1">توقيت الدفع</p>
              <p className="font-medium">{paymentTimingLabel(order.paymentTiming)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant text-xs mb-1">السعر المقترح</p>
              <p className="font-medium">
                {order.proposedPrice != null ? `${order.proposedPrice} ج.م` : '—'}
              </p>
            </div>
            {order.couponCode && (
              <div>
                <p className="text-on-surface-variant text-xs mb-1">كوبون</p>
                <p className="font-medium">
                  {order.couponCode} {order.discountAmount ? `(-${order.discountAmount} ج.م)` : ''}
                </p>
              </div>
            )}
            {order.payment && (
              <>
                <div>
                  <p className="text-on-surface-variant text-xs mb-1">حالة الدفع</p>
                  <p className="font-medium">{order.payment.status || '—'}</p>
                </div>
                {order.payment.transactionId && (
                  <div>
                    <p className="text-on-surface-variant text-xs mb-1">رقم العملية</p>
                    <p className="font-medium" dir="ltr">{String(order.payment.transactionId)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </SectionCard>

        {/* Customer notes */}
        {order.description && (
          <SectionCard icon={<StickyNote className="w-5 h-5 text-primary" />} title="ملاحظات العميل">
            <p className="text-on-surface whitespace-pre-wrap">{order.description}</p>
          </SectionCard>
        )}

        {/* Problem images */}
        {order.problemImages && order.problemImages.length > 0 && (
          <SectionCard icon={<Camera className="w-5 h-5 text-primary" />} title={`صور المشكلة (${order.problemImages.length})`}>
            <ImageGrid urls={order.problemImages} label="صورة المشكلة" />
          </SectionCard>
        )}

        {/* Completion report */}
        {order.completionReport?.submittedAt && (
          <SectionCard
            icon={<CheckCircle2 className="w-5 h-5 text-primary" />}
            title={`تقرير إنجاز العمل — ${formatDate(order.completionReport.submittedAt)}`}
          >
            {order.completionReport.details && (
              <p className="text-on-surface whitespace-pre-wrap mb-4">
                {order.completionReport.details}
              </p>
            )}
            {order.completionReport.images && order.completionReport.images.length > 0 && (
              <ImageGrid urls={order.completionReport.images} label="صورة الإنجاز" />
            )}
          </SectionCard>
        )}

        {/* Cancellation request */}
        {order.cancellationRequest?.requestedAt && (
          <SectionCard icon={<XCircle className="w-5 h-5 text-primary" />} title="طلب الإلغاء">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-on-surface-variant">طلب الإلغاء بواسطة: </span>
                <span className="font-medium">
                  {order.cancellationRequest.requestedBy === 'worker' ? 'الحرفي' : 'العميل'}
                </span>
              </p>
              <p>
                <span className="text-on-surface-variant">الحالة: </span>
                <span className="font-medium">{order.cancellationRequest.status || '—'}</span>
              </p>
              {order.cancellationRequest.reason && (
                <p>
                  <span className="text-on-surface-variant">السبب: </span>
                  <span className="text-on-surface">{order.cancellationRequest.reason}</span>
                </p>
              )}
              {order.cancellationRequest.denialReason && (
                <p>
                  <span className="text-on-surface-variant">سبب الرفض: </span>
                  <span className="text-on-surface">{order.cancellationRequest.denialReason}</span>
                </p>
              )}
              <p className="text-xs text-on-surface-variant">
                طُلب في {formatDate(order.cancellationRequest.requestedAt)}
                {order.cancellationRequest.respondedAt
                  ? ` • تم الرد في ${formatDate(order.cancellationRequest.respondedAt)}`
                  : ''}
              </p>
            </div>
          </SectionCard>
        )}

        {/* Rejection */}
        {order.status === 'rejected' && order.rejectionReason && (
          <SectionCard icon={<XCircle className="w-5 h-5 text-primary" />} title="سبب الرفض">
            <p className="text-on-surface">{order.rejectionReason}</p>
          </SectionCard>
        )}
      </main>
    </div>
  )
}
