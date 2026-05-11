'use client'

// /become-provider — application form for customers who want to upgrade
// to a service provider (worker). On approval, the admin flips the user's
// role and creates a WorkerProfile + initial services automatically.
//
// Flow:
//   1. Mount → GET /provider-applications/me
//        - null  → render the form
//        - status "pending"   → show waiting card
//        - status "approved"  → show success card + link to dashboard
//        - status "rejected"  → show rejection reason + "re-apply" button
//   2. Submit → POST /provider-applications. After success, switch to the
//      pending card without a full reload.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Image as ImageIcon, FileText, CheckCircle2, Clock, XCircle } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { uploadChatFile } from '@/lib/upload'
import type { Category } from '@/lib/types'

interface ProposedService {
  name: string
  description: string
  price: string         // kept as string in the input, parsed on submit
  typeofService: 'fixed' | 'hourly' | 'range'
  priceMin: string
  priceMax: string
  images: string[]      // Cloudinary URLs
  pdfs: string[]        // Cloudinary URLs
}

interface ApplicationStatus {
  _id: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  category?: { _id: string; name: string } | null
}

const emptyService = (): ProposedService => ({
  name: '',
  description: '',
  price: '',
  typeofService: 'fixed',
  priceMin: '',
  priceMax: '',
  images: [],
  pdfs: [],
})

export default function BecomeProviderPage() {
  const router = useRouter()
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()

  const [statusLoading, setStatusLoading] = useState(true)
  const [application, setApplication] = useState<ApplicationStatus | null>(null)

  // Form state
  const [bio, setBio] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [services, setServices] = useState<ProposedService[]>([emptyService()])
  const [categories, setCategories] = useState<Category[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Auth gate — redirect guests to signin, then back here
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.replace('/signin?redirect=/become-provider')
    }
  }, [authLoading, isLoggedIn, router])

  // Load existing application + categories in parallel
  useEffect(() => {
    if (!isLoggedIn) return
    let cancelled = false
    ;(async () => {
      try {
        const [appData, catsData] = await Promise.all([
          api.getWithAuth('/provider-applications/me').catch(() => ({ application: null })),
          api.get('/categories').catch(() => ({ categories: [] })),
        ])
        if (cancelled) return
        setApplication(appData.application || null)
        setCategories(catsData.categories || [])
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isLoggedIn])

  // ─── Service row helpers ────────────────────────────────────────
  const updateService = (idx: number, patch: Partial<ProposedService>) => {
    setServices(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }
  const addServiceRow = () => setServices(prev => [...prev, emptyService()])
  const removeServiceRow = (idx: number) =>
    setServices(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))

  // Cloudinary upload (image or pdf). On success, append URL to the
  // appropriate array. On failure, surface the message.
  const handleFileUpload = async (idx: number, file: File, kind: 'image' | 'pdf') => {
    try {
      const res = await uploadChatFile(file)
      if (kind === 'image') {
        updateService(idx, { images: [...services[idx].images, res.url] })
      } else {
        updateService(idx, { pdfs: [...services[idx].pdfs, res.url] })
      }
    } catch (err: any) {
      setError(err?.message || 'فشل رفع الملف')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (bio.trim().length < 10) {
      setError('يرجى كتابة نبذة عن خبرتك (10 أحرف على الأقل)')
      return
    }
    if (!categoryId) {
      setError('اختر فئة عملك')
      return
    }

    // Build payload — prune empty services and parse numbers.
    const proposedServices = services
      .filter(s => s.name.trim())
      .map(s => ({
        name: s.name.trim(),
        description: s.description.trim(),
        typeofService: s.typeofService,
        price: s.typeofService === 'range' ? 0 : Number(s.price) || 0,
        priceRange: s.typeofService === 'range'
          ? { min: Number(s.priceMin) || 0, max: Number(s.priceMax) || 0 }
          : undefined,
        images: s.images,
        pdfs: s.pdfs,
      }))

    setSubmitting(true)
    try {
      const data = await api.postWithAuth('/provider-applications', {
        bio: bio.trim(),
        category: categoryId,
        proposedServices,
      })
      setApplication({
        _id: data.application._id,
        status: data.application.status,
      })
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء إرسال الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render branches ────────────────────────────────────────────
  if (authLoading || statusLoading) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <div className="flex items-center justify-center pt-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  // Workers and admins shouldn't see this form at all.
  if (user && user.role !== 'customer') {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-28 pb-16 px-6 max-w-2xl mx-auto text-center">
          <p className="text-on-surface-variant">
            هذه الصفحة متاحة للعملاء فقط. أنت مسجّل بالفعل بحساب{' '}
            {user.role === 'worker' ? 'مزوّد خدمة' : 'مشرف'}.
          </p>
          <Link href="/" className="text-primary font-bold hover:underline mt-4 inline-block">
            العودة للرئيسية
          </Link>
        </main>
      </div>
    )
  }

  // Status cards — pending / approved / rejected
  if (application && application.status === 'pending') {
    return (
      <StatusShell
        icon={<Clock className="w-12 h-12 text-primary" />}
        title="طلبك قيد المراجعة"
        description="استلمنا طلبك بنجاح، وسيقوم فريق المراجعة بدراسته في أقرب وقت. ستصلك إشعار بالنتيجة."
      />
    )
  }
  if (application && application.status === 'approved') {
    return (
      <StatusShell
        icon={<CheckCircle2 className="w-12 h-12 text-green-600" />}
        title="تم قبولك كمزوّد خدمة"
        description="تهانينا! يمكنك الآن إدارة خدماتك من لوحة تحكم العامل."
        action={{ href: '/dashboard', label: 'الذهاب للوحة التحكم' }}
      />
    )
  }

  const previouslyRejected = application && application.status === 'rejected'

  return (
    <div className="bg-background min-h-screen" dir="rtl">
      <Navbar />
      <main className="pt-28 pb-16 px-6 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl font-black text-on-surface mb-2">
            انضم إلينا كمزوّد خدمة
          </h1>
          <p className="text-on-surface-variant">
            أكمل بياناتك وسيقوم فريقنا بمراجعة طلبك خلال 48 ساعة
          </p>
        </div>

        {previouslyRejected && (
          <div className="bg-error-container/30 border border-error/20 rounded-2xl p-4 mb-6 flex gap-3">
            <XCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-on-error-container mb-1">تم رفض طلبك السابق</p>
              {application?.rejectionReason && (
                <p className="text-on-error-container/80">السبب: {application.rejectionReason}</p>
              )}
              <p className="text-on-error-container/80 mt-1">يمكنك تعديل بياناتك وإعادة التقديم.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-surface-container-lowest rounded-2xl p-6 lg:p-8 shadow-sm">
          {/* Bio */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">
              نبذة عن خبرتك <span className="text-error">*</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="مثال: حرفي سباكة بخبرة 10 سنوات، متخصص في تركيب وصيانة شبكات المياه..."
              className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/30 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none text-on-surface"
            />
            <p className="text-xs text-on-surface-variant mt-1">{bio.length}/1000</p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">
              فئة عملك <span className="text-error">*</span>
            </label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/30 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-on-surface"
            >
              <option value="">— اختر الفئة —</option>
              {categories.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-on-surface-variant mt-1">
              ستضاف خدماتك ضمن هذه الفئة فقط، ولا يمكن تغييرها لاحقاً.
            </p>
          </div>

          {/* Services */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold text-on-surface">
                خدماتك (اختياري)
              </label>
              <button
                type="button"
                onClick={addServiceRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="w-4 h-4" /> إضافة خدمة
              </button>
            </div>

            <div className="space-y-4">
              {services.map((s, idx) => (
                <div key={idx} className="bg-surface-container-low rounded-xl p-4 space-y-3 border border-outline-variant/15">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-on-surface-variant">خدمة #{idx + 1}</span>
                    {services.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeServiceRow(idx)}
                        className="text-error hover:text-error/80"
                        aria-label="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    value={s.name}
                    onChange={e => updateService(idx, { name: e.target.value })}
                    placeholder="اسم الخدمة (مثال: تركيب سخان كهربائي)"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm"
                  />

                  <textarea
                    value={s.description}
                    onChange={e => updateService(idx, { description: e.target.value })}
                    rows={2}
                    placeholder="وصف مختصر للخدمة"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm resize-none"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={s.typeofService}
                      onChange={e => updateService(idx, { typeofService: e.target.value as ProposedService['typeofService'] })}
                      className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none text-sm"
                    >
                      <option value="fixed">سعر ثابت</option>
                      <option value="hourly">بالساعة</option>
                      <option value="range">نطاق سعري</option>
                    </select>

                    {s.typeofService === 'range' ? (
                      <div className="grid grid-cols-2 gap-1">
                        <input
                          type="number"
                          value={s.priceMin}
                          onChange={e => updateService(idx, { priceMin: e.target.value })}
                          placeholder="من"
                          className="px-2 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none text-sm"
                        />
                        <input
                          type="number"
                          value={s.priceMax}
                          onChange={e => updateService(idx, { priceMax: e.target.value })}
                          placeholder="إلى"
                          className="px-2 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none text-sm"
                        />
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={s.price}
                        onChange={e => updateService(idx, { price: e.target.value })}
                        placeholder="السعر بالجنيه"
                        className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none text-sm"
                      />
                    )}
                  </div>

                  {/* File uploads */}
                  <div className="flex gap-2">
                    <label className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary-container/30 text-primary text-xs font-bold cursor-pointer hover:bg-primary-container/50">
                      <ImageIcon className="w-4 h-4" />
                      صور ({s.images.length})
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleFileUpload(idx, f, 'image')
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <label className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-bold cursor-pointer hover:bg-surface-container-high">
                      <FileText className="w-4 h-4" />
                      ملفات PDF ({s.pdfs.length})
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleFileUpload(idx, f, 'pdf')
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-error-container/30 text-on-error-container text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            إرسال الطلب
          </button>
        </form>
      </main>
    </div>
  )
}

function StatusShell({
  icon, title, description, action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="bg-background min-h-screen" dir="rtl">
      <Navbar />
      <main className="pt-32 pb-16 px-6 max-w-xl mx-auto text-center">
        <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-sm">
          <div className="flex justify-center mb-4">{icon}</div>
          <h1 className="text-2xl font-bold text-on-surface mb-2">{title}</h1>
          <p className="text-on-surface-variant mb-6">{description}</p>
          {action ? (
            <Link href={action.href} className="inline-block bg-primary text-on-primary font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90">
              {action.label}
            </Link>
          ) : (
            <Link href="/" className="text-primary font-bold hover:underline">العودة للرئيسية</Link>
          )}
        </div>
      </main>
    </div>
  )
}
