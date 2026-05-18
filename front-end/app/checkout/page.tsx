'use client'

// =============================================================================
// CHECKOUT PAGE — /checkout?service=<serviceId>
// =============================================================================

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import {
  Calendar, MapPin, StickyNote, Tag, CreditCard, Wallet,
  CheckCircle2, Loader2, AlertCircle, ShieldCheck, Camera,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { checkoutSchema, type CheckoutValues } from '@/lib/schemas'
import type { PaymentMethod, WorkerService } from '@/lib/types'
import AddressPicker, { type PickedAddress } from '@/components/AddressPicker/AddressPicker'
import ProblemImagesPicker from '@/components/ProblemImagesPicker'

// Shape the /api/workers/service/:id endpoint returns (populated chain).
interface CheckoutService extends WorkerService {
  workerID?: {
    _id: string
    userId?: {
      _id: string
      firstName: string
      lastName: string
      profileImage?: string
    }
  }
  categoryId?: string | { _id: string; name: string }
}

// Resolve a numeric base price from a WorkerService. Range services use the
// minimum — we never want to overstate the up-front commitment.
const resolveBasePrice = (service: CheckoutService | null) => {
  if (!service) return 0
  if (service.typeofService === 'range' && service.priceRange?.min) {
    return Number(service.priceRange.min)
  }
  return Number(service.price || 0)
}

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoggedIn, isLoading: authLoading } = useAuth()
  const t = useTranslations()

  const serviceId = searchParams.get('service')

  // ─── Data state ────────────────────────────────────────────────────────
  const [service, setService] = useState<CheckoutService | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // ─── Form (react-hook-form + zod) ──────────────────────────────────────
  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      scheduledDate: '',
      address: '',
      notes: '',
      paymentMode: 'cash_on_delivery',
      couponCode: '',
    },
    mode: 'onTouched',
  })
  const { register, handleSubmit, watch, setValue, formState } = form
  const { errors, isSubmitting } = formState
  const paymentMode = watch('paymentMode')

  // ─── Coupon state (kept outside the form) ──────────────────────────────
  // The apply flow is async and orthogonal to the main submit; mixing it
  // into the form schema would couple validation to a network call.
  const [couponInput, setCouponInput] = useState('')
  const [applyingCoupon, setApplyingCoupon] = useState(false)
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null)
  const [couponError, setCouponError] = useState('')

  // ─── Problem images (Cloudinary URLs the customer attached) ──────────
  // Kept outside react-hook-form because uploads are async + parallel; mixing
  // them into the form schema would require either re-validating on every
  // upload tick or special-casing async validators. State + a "busy" flag
  // that gates the submit button is simpler and matches the coupon pattern.
  const [problemImages, setProblemImages] = useState<string[]>([])
  const [imagesUploading, setImagesUploading] = useState(false)

  // ─── Top-level submit error (server-side rejections) ───────────────────
  const [submitError, setSubmitError] = useState('')

  // ─── Address-picker modal ─────────────────────────────────────────────
  // When the customer confirms a pin, we set the form's address text from
  // Nominatim's reverse-geocode AND store the lat/lng so the worker can
  // see the exact spot on a map afterwards.
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickedLat = watch('lat')
  const pickedLng = watch('lng')

  const handlePickerConfirm = (picked: PickedAddress) => {
    setPickerOpen(false)
    setValue('lat', picked.lat, { shouldDirty: true })
    setValue('lng', picked.lng, { shouldDirty: true })
    if (picked.address && picked.address.trim()) {
      setValue('address', picked.address.trim(), { shouldDirty: true, shouldValidate: true })
    }
    // Carry the reverse-geocoded city + (normalized) governorate through to
    // submit so the order doc ends up with them set. They get used by admin
    // analytics' geography tab — without them every order would group under
    // "غير محدد".
    if (picked.city && picked.city.trim()) {
      setValue('city', picked.city.trim(), { shouldDirty: true })
    }
    if (picked.governorate && picked.governorate.trim()) {
      setValue('governorate', picked.governorate.trim(), { shouldDirty: true })
    }
  }

  // ─── Auth gate ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) {
      const back = encodeURIComponent(`/checkout${serviceId ? `?service=${serviceId}` : ''}`)
      router.replace(`/signin?redirect=${back}`)
    }
  }, [authLoading, isLoggedIn, router, serviceId])

  // ─── Fetch the service details ─────────────────────────────────────────
  useEffect(() => {
    if (!serviceId) {
      setLoadError('لم يتم تحديد الخدمة')
      setLoading(false)
      return
    }
    const run = async () => {
      try {
        const data = await api.get(`/workers/service/${serviceId}`)
        setService(data.service)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'تعذّر تحميل بيانات الخدمة')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [serviceId])

  // ─── Fetch saved payment methods (for the card-mode UI) ────────────────
  useEffect(() => {
    if (!isLoggedIn) return
    api.getWithAuth('/customer/payment-methods')
      .then(data => setPaymentMethods(data.paymentMethods || []))
      .catch(() => setPaymentMethods([]))
  }, [isLoggedIn])

  // ─── Price calculations ────────────────────────────────────────────────
  const basePrice = useMemo(() => resolveBasePrice(service), [service])
  const discount = coupon?.discount || 0
  const total = Math.max(0, basePrice - discount)

  // ─── Coupon apply ──────────────────────────────────────────────────────
  const handleApplyCoupon = async () => {
    setCouponError('')
    const code = couponInput.trim().toUpperCase()
    if (!code) {
      setCouponError('يرجى إدخال الكود')
      return
    }
    if (!service) return
    setApplyingCoupon(true)
    try {
      const categoryId = typeof service.categoryId === 'string'
        ? service.categoryId
        : service.categoryId?._id
      const result = await api.postWithAuth('/coupons/validate', {
        code,
        categoryId,
        amount: basePrice,
      })
      if (result.valid) {
        setCoupon({ code: result.code, discount: result.discount })
        setValue('couponCode', result.code, { shouldDirty: true })
        setCouponError('')
      } else {
        setCoupon(null)
        setValue('couponCode', '', { shouldDirty: true })
        setCouponError(result.message || 'الكود غير صالح')
      }
    } catch (err) {
      setCoupon(null)
      setValue('couponCode', '', { shouldDirty: true })
      setCouponError(err instanceof Error ? err.message : 'تعذّر التحقق من الكود')
    } finally {
      setApplyingCoupon(false)
    }
  }

  const handleRemoveCoupon = () => {
    setCoupon(null)
    setCouponInput('')
    setCouponError('')
    setValue('couponCode', '', { shouldDirty: true })
  }

  // ─── Submit order ──────────────────────────────────────────────────────
  // Two paths:
  //   - cash_on_delivery: create the order; backend pings the worker. We
  //     land the customer on their /profile orders tab.
  //   - card: create the order in `pending` (no worker ping yet), then start
  //     a Paymob checkout and redirect the browser there. The worker is
  //     pinged from the payment webhook once Paymob confirms.
  const onSubmit = async (values: CheckoutValues) => {
    setSubmitError('')
    if (!serviceId) {
      setSubmitError('الخدمة غير محددة')
      return
    }
    try {
      const createResp = await api.postWithAuth('/customer/orders', {
        serviceId,
        scheduledDate: values.scheduledDate,
        address: values.address.trim(),
        // Forward the pin only when both coords are present. The backend
        // validates and silently drops a half-pair, but sending undefined
        // here keeps the request body tidy.
        ...(typeof values.lat === 'number' && typeof values.lng === 'number'
          ? { lat: values.lat, lng: values.lng }
          : {}),
        ...(values.governorate ? { governorate: values.governorate } : {}),
        ...(values.city ? { city: values.city } : {}),
        notes: (values.notes || '').trim(),
        paymentMode: values.paymentMode,
        couponCode: coupon?.code || undefined,
        ...(problemImages.length > 0 ? { problemImages } : {}),
      })

      if (values.paymentMode === 'card') {
        const orderId = createResp?.order?._id
        if (!orderId) {
          setSubmitError('تعذر بدء عملية الدفع')
          return
        }
        // Hand off to Paymob's hosted checkout. The browser fully navigates
        // away; we don't render anything after this point.
        const checkout = await api.postWithAuth('/payments/checkout', { orderId })
        if (!checkout?.checkoutUrl) {
          setSubmitError('تعذر توجيهك إلى صفحة الدفع')
          return
        }
        window.location.href = checkout.checkoutUrl
        return
      }

      router.push('/profile?tab=in_progress')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'تعذّر إنشاء الطلب')
    }
  }

  // ─── Render: loading / auth-redirect placeholder ───────────────────────
  if (authLoading || !isLoggedIn || loading) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
          <div className="flex items-center justify-center py-40 text-on-surface-variant">
            <Loader2 className="w-6 h-6 animate-spin mx-2" />
            جاري التحميل...
          </div>
        </main>
      </div>
    )
  }

  // ─── Render: error / not found ─────────────────────────────────────────
  if (loadError || !service) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
          <div className="bg-surface-container-lowest p-8 rounded-xl text-center">
            <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
            <h1 className="text-xl font-bold text-on-surface mb-2">تعذّر تحميل الخدمة</h1>
            <p className="text-on-surface-variant mb-6">{loadError || 'الخدمة غير موجودة'}</p>
            <Link
              href="/services"
              className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-container transition-colors"
            >
              تصفح الخدمات
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const workerUser = service.workerID?.userId
  const workerName = workerUser ? `${workerUser.firstName} ${workerUser.lastName}` : 'مقدم الخدمة'
  const categoryName = typeof service.categoryId === 'object' ? service.categoryId?.name : undefined

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-sm text-on-surface-variant mb-4">
          <Link href="/" className="hover:text-primary transition-colors">{t('common.home')}</Link>
          <span className="mx-2">/</span>
          <Link href="/services" className="hover:text-primary transition-colors">{t('common.services')}</Link>
          <span className="mx-2">/</span>
          <span className="text-on-surface">{t('checkout.title')}</span>
        </nav>

        <h1 className="text-3xl font-black text-on-surface mb-2 tracking-tight">{t('checkout.title')}</h1>
        <p className="text-on-surface-variant mb-8">
          {t('checkout.subtitle')}
        </p>

        {/* ─── Service summary card ─────────────────────────────────────── */}
        <section className="bg-surface-container-lowest p-5 rounded-xl mb-6 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-xl bg-surface-container-high overflow-hidden shrink-0">
              {service.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={service.images[0]} alt={service.name} className="w-full h-full object-cover" />
              ) : workerUser?.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={workerUser.profileImage} alt={workerName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-linear-to-br from-primary/20 to-primary-container/30 flex items-center justify-center text-primary font-black text-2xl">
                  {workerUser?.firstName?.charAt(0) || 'خ'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-on-surface truncate">{service.name}</h2>
              <p className="text-sm text-on-surface-variant mb-1">
                {workerName}
                {categoryName && <span> • {categoryName}</span>}
              </p>
              {service.description && (
                <p className="text-sm text-on-surface-variant line-clamp-2">{service.description}</p>
              )}
            </div>
            <div className="text-left shrink-0">
              <span className="text-xs text-on-surface-variant block">السعر</span>
              <span className="text-xl font-black text-primary">
                {basePrice} <span className="text-sm font-medium">ج.م</span>
              </span>
            </div>
          </div>
        </section>

        {/* ─── Form ────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>

          {/* Date + address */}
          <section className="bg-surface-container-lowest p-5 rounded-xl space-y-4 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
            <h3 className="flex items-center gap-2 text-base font-bold text-on-surface border-r-4 border-primary pr-3">
              <Calendar className="w-5 h-5 text-primary" />
              {t('checkout.appointmentDetails')}
            </h3>

            <div>
              <label htmlFor="scheduledDate" className="block text-sm font-medium text-on-surface mb-2">
                {t('checkout.labelDate')} <span className="text-error">*</span>
              </label>
              <input
                id="scheduledDate"
                type="datetime-local"
                min={new Date().toISOString().slice(0, 16)}
                aria-invalid={errors.scheduledDate ? 'true' : 'false'}
                className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-on-surface focus:ring-2 outline-none ${
                  errors.scheduledDate
                    ? 'border-red-300 ring-2 ring-red-300 focus:ring-red-300'
                    : 'border-outline-variant/30 focus:border-primary focus:ring-primary/20'
                }`}
                {...register('scheduledDate')}
              />
              {errors.scheduledDate && (
                <p role="alert" className="text-xs text-red-700 mt-1">{errors.scheduledDate.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-on-surface mb-2">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-on-surface-variant" />
                  {t('checkout.labelAddress')} <span className="text-error">*</span>
                </span>
              </label>
              <input
                id="address"
                type="text"
                placeholder={t('checkout.addressPlaceholder')}
                aria-invalid={errors.address ? 'true' : 'false'}
                className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-on-surface focus:ring-2 outline-none ${
                  errors.address
                    ? 'border-red-300 ring-2 ring-red-300 focus:ring-red-300'
                    : 'border-outline-variant/30 focus:border-primary focus:ring-primary/20'
                }`}
                {...register('address')}
              />
              {errors.address && (
                <p role="alert" className="text-xs text-red-700 mt-1">{errors.address.message}</p>
              )}

              {/* Map picker — drops a pin so the worker knows the exact spot.
                  Optional: typing a free-form address still works. The
                  Leaflet bundle is lazy-loaded inside the picker, so this
                  button costs nothing on initial page load. */}
              <div className="mt-3 flex items-center justify-between gap-3 bg-primary/5 rounded-xl p-3">
                <div className="text-right flex-1 min-w-0">
                  <p className="text-sm font-bold flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" />
                    تحديد الموقع على الخريطة
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {typeof pickedLat === 'number' && typeof pickedLng === 'number'
                      ? `محدد: ${pickedLat.toFixed(5)}, ${pickedLng.toFixed(5)} — سيشاهده الحرفي على الخريطة`
                      : 'ساعد الحرفي في الوصول بدقة بتحديد الموقع على الخريطة (اختياري)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-container transition-colors shrink-0"
                >
                  {typeof pickedLat === 'number' ? 'تعديل على الخريطة' : 'تحديد على الخريطة'}
                </button>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="bg-surface-container-lowest p-5 rounded-xl space-y-4 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
            <h3 className="flex items-center gap-2 text-base font-bold text-on-surface border-r-4 border-primary pr-3">
              <StickyNote className="w-5 h-5 text-primary" />
              {t('checkout.notes')}
            </h3>
            <textarea
              rows={3}
              placeholder={t('checkout.notesPlaceholder')}
              className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-on-surface focus:ring-2 outline-none resize-none ${
                errors.notes
                  ? 'border-red-300 ring-2 ring-red-300 focus:ring-red-300'
                  : 'border-outline-variant/30 focus:border-primary focus:ring-primary/20'
              }`}
              {...register('notes')}
            />
            {errors.notes && (
              <p role="alert" className="text-xs text-red-700">{errors.notes.message}</p>
            )}
          </section>

          {/* Problem images — optional photos of what needs fixing */}
          <section className="bg-surface-container-lowest p-5 rounded-xl space-y-3 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
            <h3 className="flex items-center gap-2 text-base font-bold text-on-surface border-r-4 border-primary pr-3">
              <Camera className="w-5 h-5 text-primary" />
              صور المشكلة (اختياري)
            </h3>
            <ProblemImagesPicker
              value={problemImages}
              onChange={setProblemImages}
              onUploadingChange={setImagesUploading}
            />
          </section>

          {/* Payment mode */}
          <section className="bg-surface-container-lowest p-5 rounded-xl space-y-4 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
            <h3 className="flex items-center gap-2 text-base font-bold text-on-surface border-r-4 border-primary pr-3">
              <Wallet className="w-5 h-5 text-primary" />
              {t('checkout.paymentMethod')}
            </h3>

            <div className="space-y-3">
              {/* Cash on delivery — the real option */}
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                paymentMode === 'cash_on_delivery'
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/30 hover:border-outline-variant/60'
              }`}>
                <input
                  type="radio"
                  value="cash_on_delivery"
                  className="mt-1 accent-primary"
                  {...register('paymentMode')}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="w-4 h-4 text-primary" />
                    <span className="font-bold text-on-surface">{t('checkout.paymentCash')}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {t('checkout.paymentCashDesc')}
                  </p>
                </div>
              </label>

              {/* Card / wallet / InstaPay — handled by Paymob's hosted
                  checkout. The customer is redirected to Paymob after the
                  order is created; the worker is only notified once payment
                  is confirmed via the webhook. */}
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                paymentMode === 'card'
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/30 hover:border-outline-variant/60'
              }`}>
                <input
                  type="radio"
                  value="card"
                  className="mt-1 accent-primary"
                  {...register('paymentMode')}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <span className="font-bold text-on-surface">{t('checkout.paymentCard')}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant mb-2">
                    {t('checkout.paymentCardDesc')}
                  </p>
                  {paymentMethods.length > 0 && (
                    <div className="space-y-1">
                      {paymentMethods.slice(0, 2).map(pm => (
                        <div key={pm._id} className="text-xs text-on-surface-variant bg-surface-container-low rounded-lg px-3 py-2 inline-block me-2">
                          {pm.cardBrand.toUpperCase()} •••• {pm.lastFourDigits}
                          {pm.isDefault && ' (افتراضية)'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            </div>
          </section>

          {/* Coupon */}
          <section className="bg-surface-container-lowest p-5 rounded-xl space-y-3 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
              <h3 className="flex items-center gap-2 text-base font-bold text-on-surface border-r-4 border-primary pr-3">
                <Tag className="w-5 h-5 text-primary" />
                {t('checkout.couponTitle')}
              </h3>
            
            {coupon ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-bold text-green-800">{coupon.code}</div>
                    <div className="text-xs text-green-700">{t('checkout.couponApplied', { amount: coupon.discount })}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="text-xs text-green-700 hover:underline"
                >
                  {t('checkout.couponRemove')}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    placeholder={t('checkout.couponPlaceholder')}
                    className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={applyingCoupon || !couponInput.trim()}
                    className="px-6 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : t('checkout.couponApply')}
                  </button>
                </div>
                {couponError && (
                  <p className="text-sm text-error flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {couponError}
                  </p>
                )}
              </>
            )}
          </section>

          {/* Total */}
          <section className="bg-primary/5 border-2 border-primary/20 p-5 rounded-xl">
            <div className="flex justify-between text-sm text-on-surface-variant mb-1">
              <span>{t('checkout.totalServicePrice')}</span>
              <span className="font-medium text-on-surface">{basePrice} {t('common.currency')}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-700 mb-1">
                <span>{t('checkout.totalDiscount', { code: coupon?.code ?? '' })}</span>
                <span className="font-medium">- {discount} {t('common.currency')}</span>
              </div>
            )}
            <div className="h-px bg-outline-variant/30 my-3" />
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-on-surface">{t('checkout.totalGrand')}</span>
              <span className="text-2xl font-black text-primary">
                {total} <span className="text-base font-medium">{t('common.currency')}</span>
              </span>
            </div>
          </section>

          {/* Submit error */}
          {submitError && (
            <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 text-error text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || imagesUploading}
            className="w-full bg-primary text-on-primary py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 hover:bg-primary-container transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('checkout.submitting')}
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                {t('checkout.submit')}
              </>
            )}
          </button>

          <p className="text-xs text-on-surface-variant text-center">
            {t('checkout.confirmFooter')}
          </p>
        </form>
      </main>

      {/* Address picker — Leaflet bundle is lazy-loaded inside */}
      <AddressPicker
        open={pickerOpen}
        initial={
          typeof pickedLat === 'number' && typeof pickedLng === 'number'
            ? { lat: pickedLat, lng: pickedLng }
            : null
        }
        onConfirm={handlePickerConfirm}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}

// Next.js requires useSearchParams() to be inside a Suspense boundary.
// Otherwise the build fails with "useSearchParams() should be wrapped in a suspense boundary".
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background min-h-screen">
          <Navbar />
          <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-center py-40 text-on-surface-variant">
              <Loader2 className="w-6 h-6 animate-spin mx-2" />
              جاري التحميل...
            </div>
          </main>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  )
}
