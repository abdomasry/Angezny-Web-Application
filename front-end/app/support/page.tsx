'use client'

// =============================================================================
// /support — customer/worker entry point for the ticket system
// =============================================================================
// Two-tab layout (same pattern as /profile):
//   - "إرسال بلاغ جديد" — new ticket form with a type picker that reveals
//      dynamic target fields (service picker, user lookup, order picker).
//   - "بلاغاتي"          — list of the user's own tickets, click to open detail.
//
// Auth-gated: logged out → /signin?redirect=/support.
// Admins get redirected to /admin (they respond via the admin panel).
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Briefcase, UserX, Wrench, CreditCard, HelpCircle,
  Plus, Inbox, Send, Loader2, AlertCircle, X as XIcon,
  FileText, Paperclip, MessageCircle,
  Clock, CheckCircle2, Lock, ChevronLeft,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { uploadChatFile } from '@/lib/upload'
import { supportTicketSchema, type SupportTicketValues } from '@/lib/schemas'
import type { SupportTicket, TicketAttachment } from '@/lib/types'

type TicketType = SupportTicket['type']

// Minimal shape we read from the recent-orders endpoints. Both
// /worker/orders and /customer/orders return the same envelope shape.
interface MyOrder {
  _id: string
  scheduledDate?: string
  serviceId?: string | { _id: string; name?: string }
  categoryId?: string | { _id: string; name?: string }
}

// Config for the type-picker cards. Icon + label + short description tell
// the user what each category is for without needing a help popover.
const TYPE_OPTIONS: { value: TicketType; label: string; desc: string; icon: React.ElementType }[] = [
  { value: 'service_issue', label: 'مشكلة في خدمة', desc: 'مشكلة متعلقة بخدمة حجزتها',  icon: Briefcase },
  { value: 'user_report',   label: 'بلاغ عن مستخدم', desc: 'سلوك غير لائق أو إساءة',     icon: UserX },
  { value: 'technical',     label: 'مشكلة تقنية',    desc: 'الموقع لا يعمل كما يجب',     icon: Wrench },
  { value: 'payment_issue', label: 'مشكلة في الدفع', desc: 'دفعة مفقودة أو خطأ مالي',    icon: CreditCard },
  { value: 'other',         label: 'أخرى',            desc: 'أي موضوع آخر',                icon: HelpCircle },
]

// Same status pill as in TicketThread so the list looks consistent.
const STATUS_META: Record<SupportTicket['status'], { label: string; bg: string; text: string; icon: React.ElementType }> = {
  open:        { label: 'مفتوح',        bg: 'bg-blue-50',  text: 'text-blue-700',  icon: MessageCircle },
  in_progress: { label: 'قيد المعالجة', bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock },
  resolved:    { label: 'محلولة',       bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle2 },
  closed:      { label: 'مغلق',          bg: 'bg-gray-100', text: 'text-gray-600',  icon: Lock },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function SupportPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'new' | 'mine'>('new')

  // ─── My tickets list state ─────────────────────────────────────────────
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')

  // ─── New-ticket form state ─────────────────────────────────────────────
  // `type` is kept in plain state because the custom card-picker UI doesn't
  // map cleanly to a regular RHF-registered input. Title, message, and the
  // optional target ID fields go through RHF + zod (supportTicketSchema).
  const [type, setType] = useState<TicketType | null>(null)
  const [attachments, setAttachments] = useState<TicketAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState('')

  const ticketForm = useForm<SupportTicketValues>({
    resolver: zodResolver(supportTicketSchema),
    defaultValues: {
      title: '',
      message: '',
      targetUserId: '',
      targetServiceId: '',
      targetOrderId: '',
    },
    mode: 'onTouched',
  })
  const {
    register: registerTicket,
    handleSubmit: handleTicketSubmit,
    watch: watchTicket,
    setValue: setTicketValue,
    reset: resetTicket,
    formState: ticketFormState,
  } = ticketForm
  const { errors: ticketErrors, isSubmitting: ticketSubmitting } = ticketFormState

  // Watched values for live character counters and the picker side-effects.
  const titleValue = watchTicket('title')
  const messageValue = watchTicket('message')

  // ─── Order picker data ─────────────────────────────────────────────────
  // For service_issue / payment_issue we offer a picker of the user's recent
  // orders so they don't have to paste an ObjectId. We fetch both in_progress
  // and history so they can report issues on any past order.
  const [myOrders, setMyOrders] = useState<MyOrder[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)

  // ─── Auth gate ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) {
      router.replace('/signin?redirect=/support')
      return
    }
    if (user?.role === 'admin') {
      router.replace('/admin')
    }
  }, [authLoading, isLoggedIn, user, router])

  // ─── Fetch my tickets when switching to the list tab ──────────────────
  useEffect(() => {
    if (activeTab !== 'mine' || !isLoggedIn || user?.role === 'admin') return
    setListLoading(true)
    setListError('')
    api.getWithAuth('/support/tickets?limit=30')
      .then(data => setMyTickets(data.tickets || []))
      .catch(err => setListError(err?.message || 'تعذّر تحميل البلاغات'))
      .finally(() => setListLoading(false))
  }, [activeTab, isLoggedIn, user])

  // ─── Lazy-load my orders for the optional picker ──────────────────────
  // Runs only once, and only when the user picks a type that cares about
  // an order. Combines the worker and customer endpoints depending on role.
  const needsOrderPicker = type === 'service_issue' || type === 'payment_issue'
  useEffect(() => {
    if (!needsOrderPicker || ordersLoaded || !user) return
    const endpoint = user.role === 'worker' ? '/worker/orders' : '/customer/orders'
    Promise.all([
      api.getWithAuth(`${endpoint}?status=in_progress&limit=20`).catch(() => ({ orders: [] as MyOrder[] })),
      api.getWithAuth(`${endpoint}?status=history&limit=20`).catch(() => ({ orders: [] as MyOrder[] })),
    ])
      .then(([a, b]) => {
        const combined: MyOrder[] = [...(a.orders || []), ...(b.orders || [])]
        setMyOrders(combined)
        setOrdersLoaded(true)
      })
      .catch(() => setOrdersLoaded(true))
  }, [needsOrderPicker, ordersLoaded, user])

  // ─── Attachment upload ────────────────────────────────────────────────
  const handlePickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    const room = 6 - attachments.length
    if (room <= 0) {
      setFormError('الحد الأقصى 6 مرفقات')
      return
    }
    const toUpload = files.slice(0, room)
    setUploading(true)
    setFormError('')
    try {
      const results = await Promise.all(
        toUpload.map(f =>
          uploadChatFile(f)
            .then(r => ({ url: r.url, kind: r.kind, fileName: r.fileName, fileSize: r.fileSize }))
            .catch(err => {
              console.error('Upload failed:', err)
              return null
            }),
        ),
      )
      const ok = results.filter((r): r is TicketAttachment => !!r)
      if (ok.length < toUpload.length) setFormError('تعذّر رفع بعض الملفات')
      setAttachments(prev => [...prev, ...ok])
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx))

  // Reset the form when switching type — keeps stale target IDs from sneaking in
  // on a ticket where they don't make sense (e.g. "technical" with a service id).
  const handleTypeChange = (t: TicketType) => {
    setType(t)
    setTicketValue('targetUserId', '', { shouldDirty: true })
    setTicketValue('targetServiceId', '', { shouldDirty: true })
    setTicketValue('targetOrderId', '', { shouldDirty: true })
    setFormError('')
  }

  // RHF onValid handler — type is checked first since it's outside RHF.
  const onTicketSubmit = async (values: SupportTicketValues) => {
    setFormError('')
    if (!type) {
      setFormError('يرجى اختيار نوع البلاغ')
      return
    }

    try {
      const body: Record<string, unknown> = {
        type,
        title: values.title.trim(),
        message: values.message.trim(),
        attachments,
      }
      // Only send the relevant target fields per type. Sending an empty string
      // would fail Mongo's ObjectId coercion; null/undefined are dropped by the
      // backend's isValidObjectId check.
      if (values.targetUserId) body.targetUserId = values.targetUserId
      if (values.targetServiceId) body.targetServiceId = values.targetServiceId
      if (values.targetOrderId) body.targetOrderId = values.targetOrderId

      const data = await api.postWithAuth('/support/tickets', body)
      if (data?.ticket?._id) {
        router.push(`/support/${data.ticket._id}`)
        return
      }
      setType(null)
      setAttachments([])
      resetTicket()
      setActiveTab('mine')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذّر إرسال البلاغ')
    }
  }

  // ─── Render guards ────────────────────────────────────────────────────
  if (authLoading || !isLoggedIn || user?.role === 'admin') {
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

  const orderLabel = (o: MyOrder) => {
    const svc = typeof o.serviceId === 'object' ? o.serviceId?.name : undefined
    const cat = typeof o.categoryId === 'object' ? o.categoryId?.name : undefined
    const name = svc || cat || 'طلب'
    const date = o.scheduledDate ? formatDate(o.scheduledDate) : ''
    return `${name}${date ? ' • ' + date : ''}`
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto">
        {/* Header */}
        <nav className="text-sm text-on-surface-variant mb-4">
          <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
          <span className="mx-2">/</span>
          <span className="text-on-surface">الدعم والمساعدة</span>
        </nav>
        <h1 className="text-3xl font-black text-on-surface mb-2 tracking-tight">الدعم والمساعدة</h1>
        <p className="text-on-surface-variant mb-8">
          أرسل بلاغاً للإدارة عن أي مشكلة في الخدمات، المستخدمين، الدفع، أو أي مشكلة تقنية. سنقوم بمراجعة البلاغ والرد عليك في أقرب وقت.
        </p>

        {/* Tabs */}
        <div className="flex gap-3 mb-8 flex-wrap">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'new'
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <Plus className="w-4 h-4" />
            إرسال بلاغ جديد
          </button>
          <button
            onClick={() => setActiveTab('mine')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'mine'
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <Inbox className="w-4 h-4" />
            بلاغاتي
          </button>
        </div>

        {/* ─── New ticket form ─────────────────────────────────────────── */}
        {activeTab === 'new' && (
          <form onSubmit={handleTicketSubmit(onTicketSubmit)} className="space-y-6" noValidate>
            {/* Type picker */}
            <section className="bg-surface-container-lowest p-5 rounded-xl">
              <h3 className="text-base font-bold mb-3 border-r-4 border-primary pr-3">
                ما نوع البلاغ؟
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {TYPE_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const selected = type === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleTypeChange(opt.value)}
                      className={`text-right p-4 rounded-xl border-2 transition-all ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-outline-variant/30 hover:border-outline-variant/60'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mb-2 ${selected ? 'text-primary' : 'text-on-surface-variant'}`} />
                      <p className={`font-bold text-sm mb-0.5 ${selected ? 'text-primary' : 'text-on-surface'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-on-surface-variant">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </section>

            {type && (
              <>
                {/* Dynamic target fields */}
                {needsOrderPicker && (
                  <section className="bg-surface-container-lowest p-5 rounded-xl">
                    <h3 className="text-base font-bold mb-3 border-r-4 border-primary pr-3">
                      الطلب المرتبط (اختياري)
                    </h3>
                    {!ordersLoaded ? (
                      <p className="text-sm text-on-surface-variant">
                        <Loader2 className="inline w-4 h-4 animate-spin ms-1" />
                        جاري تحميل الطلبات...
                      </p>
                    ) : myOrders.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">لا توجد طلبات في حسابك.</p>
                    ) : (
                      <select
                        {...registerTicket('targetOrderId', {
                          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                            // service_issue: auto-fill targetServiceId from the picked order.
                            if (type === 'service_issue') {
                              const ord = myOrders.find(o => o._id === e.target.value)
                              const svcId = typeof ord?.serviceId === 'object'
                                ? ord.serviceId?._id || ''
                                : (ord?.serviceId as string | undefined) || ''
                              setTicketValue('targetServiceId', svcId, { shouldDirty: true })
                            }
                          },
                        })}
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                      >
                        <option value="">— لا أرفق طلباً محدداً —</option>
                        {myOrders.map(o => (
                          <option key={o._id} value={o._id}>
                            {orderLabel(o)}
                          </option>
                        ))}
                      </select>
                    )}
                  </section>
                )}

                {type === 'user_report' && (
                  <section className="bg-surface-container-lowest p-5 rounded-xl">
                    <h3 className="text-base font-bold mb-3 border-r-4 border-primary pr-3">
                      المستخدم المُبلَّغ عنه (اختياري)
                    </h3>
                    <input
                      type="text"
                      {...registerTicket('targetUserId')}
                      placeholder="الصق معرف المستخدم (User ID) أو اتركه فارغاً واذكر التفاصيل في الرسالة"
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface text-sm font-mono focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <p className="text-xs text-on-surface-variant mt-1">
                      يمكنك إيجاد معرف المستخدم من رابط ملفه الشخصي. أو اتركه فارغاً واشرح في الرسالة مع اسمه.
                    </p>
                  </section>
                )}

                {/* Title */}
                <section className="bg-surface-container-lowest p-5 rounded-xl">
                  <label htmlFor="ticket-title" className="block text-base font-bold mb-2 border-r-4 border-primary pr-3">
                    عنوان البلاغ <span className="text-error">*</span>
                  </label>
                  <input
                    id="ticket-title"
                    type="text"
                    maxLength={150}
                    placeholder="مثال: لم يتم إنجاز الخدمة في الموعد المتفق"
                    aria-invalid={ticketErrors.title ? 'true' : 'false'}
                    className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-on-surface focus:ring-2 outline-none ${
                      ticketErrors.title
                        ? 'border-red-300 ring-2 ring-red-300 focus:ring-red-300'
                        : 'border-outline-variant/30 focus:border-primary focus:ring-primary/20'
                    }`}
                    {...registerTicket('title')}
                  />
                  <div className="flex justify-between items-start mt-1">
                    <span>
                      {ticketErrors.title && (
                        <span role="alert" className="text-xs text-red-700">{ticketErrors.title.message}</span>
                      )}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {(titleValue || '').length} / 150
                    </span>
                  </div>
                </section>

                {/* Message */}
                <section className="bg-surface-container-lowest p-5 rounded-xl">
                  <label htmlFor="ticket-message" className="block text-base font-bold mb-2 border-r-4 border-primary pr-3">
                    تفاصيل البلاغ <span className="text-error">*</span>
                  </label>
                  <textarea
                    id="ticket-message"
                    maxLength={2000}
                    rows={6}
                    placeholder="اشرح ما حدث بالتفصيل — متى، أين، من، وماذا كنت تتوقع بدلاً من ذلك."
                    aria-invalid={ticketErrors.message ? 'true' : 'false'}
                    className={`w-full bg-surface-container-low border rounded-xl px-4 py-3 text-on-surface focus:ring-2 outline-none resize-none ${
                      ticketErrors.message
                        ? 'border-red-300 ring-2 ring-red-300 focus:ring-red-300'
                        : 'border-outline-variant/30 focus:border-primary focus:ring-primary/20'
                    }`}
                    {...registerTicket('message')}
                  />
                  <div className="flex justify-between items-start mt-1">
                    <span>
                      {ticketErrors.message && (
                        <span role="alert" className="text-xs text-red-700">{ticketErrors.message.message}</span>
                      )}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {(messageValue || '').length} / 2000
                    </span>
                  </div>
                </section>

                {/* Attachments */}
                <section className="bg-surface-container-lowest p-5 rounded-xl">
                  <h3 className="text-base font-bold mb-3 border-r-4 border-primary pr-3">
                    المرفقات (اختياري)
                    <span className="text-xs font-normal text-on-surface-variant ms-2">
                      (حتى 6 مرفقات)
                    </span>
                  </h3>

                  {attachments.length > 0 && (
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                      {attachments.map((a, idx) => (
                        <div key={idx} className="relative group bg-surface-container-low rounded-lg overflow-hidden aspect-square">
                          {a.kind === 'image' ? (
                            <img src={a.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                              <FileText className="w-6 h-6 text-primary mb-1" />
                              <span className="text-[10px] text-on-surface truncate w-full">
                                {a.fileName}
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {attachments.length < 6 && (
                    <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-outline-variant/40 rounded-xl py-4 cursor-pointer transition-colors ${
                      uploading ? 'opacity-50' : 'hover:border-primary hover:bg-primary/5'
                    }`}>
                      <input
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                        multiple
                        className="hidden"
                        disabled={uploading}
                        onChange={handlePickFiles}
                      />
                      {uploading ? (
                        <>
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          <span className="text-sm text-on-surface-variant">جاري الرفع...</span>
                        </>
                      ) : (
                        <>
                          <Paperclip className="w-5 h-5 text-primary" />
                          <span className="text-sm font-medium text-on-surface">
                            أضف صوراً أو ملفات (PDF، Word، Excel...)
                          </span>
                        </>
                      )}
                    </label>
                  )}
                </section>

                {/* Error + submit */}
                {formError && (
                  <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 text-error text-sm flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={ticketSubmitting || uploading}
                  className="w-full bg-primary text-on-primary py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 hover:bg-primary-container transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                >
                  {ticketSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      إرسال البلاغ
                    </>
                  )}
                </button>
              </>
            )}
          </form>
        )}

        {/* ─── My tickets list ─────────────────────────────────────────── */}
        {activeTab === 'mine' && (
          <div>
            {listLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-surface-container-lowest rounded-xl h-24 animate-pulse" />
                ))}
              </div>
            ) : listError ? (
              <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 text-error text-sm">
                {listError}
              </div>
            ) : myTickets.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl p-12 text-center">
                <Inbox className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
                <p className="text-on-surface-variant mb-4">لا يوجد بلاغات مسجلة.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold hover:bg-primary-container transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  إرسال بلاغ جديد
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myTickets.map(t => {
                  const meta = STATUS_META[t.status]
                  const StatusIcon = meta.icon
                  const typeOpt = TYPE_OPTIONS.find(o => o.value === t.type)
                  const TypeIcon = typeOpt?.icon || HelpCircle
                  return (
                    <Link
                      key={t._id}
                      href={`/support/${t._id}`}
                      className="block bg-surface-container-lowest rounded-xl p-5 hover:shadow-lg transition-all border border-transparent hover:border-primary/20"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <TypeIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <h3 className="font-bold text-on-surface truncate">{t.title}</h3>
                            <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 shrink-0 ${meta.bg} ${meta.text}`}>
                              <StatusIcon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </div>
                          <p className="text-sm text-on-surface-variant line-clamp-1 mb-1">
                            {t.message}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                            <span>{typeOpt?.label}</span>
                            <span>•</span>
                            <span>آخر نشاط: {formatDate(t.lastActivityAt)}</span>
                          </div>
                        </div>
                        <ChevronLeft className="w-4 h-4 text-on-surface-variant shrink-0 mt-2" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
