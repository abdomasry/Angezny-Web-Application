'use client'

// =============================================================================
// LICENSES EDITOR — used in the worker dashboard "ملفي" tab
// =============================================================================
// Manages a worker's credentials list (training certificates, professional
// licenses, safety certs, etc.). Each entry goes through three states:
//
//     pending  ──admin approves──▶  approved (worker can flip `active`)
//        │                              │
//        └─admin rejects─▶ rejected ◀─worker edits & re-submits
//
// We extract this from dashboard/page.tsx because the page is already 2700+
// lines and the license flow is naturally self-contained: it only needs the
// current list + a callback to bubble changes back. All API calls happen
// inside this component.
// =============================================================================

import { useRef, useState } from 'react'
import { Plus, Pencil, Trash2, FileText, ImageIcon, AlertCircle, BadgeCheck, Clock, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '@/lib/api'
import { uploadChatFile } from '@/lib/upload'
import { licenseFormSchema, type LicenseFormValues } from '@/lib/schemas'
import type { WorkerLicense } from '@/lib/types'

interface Props {
  licenses: WorkerLicense[]
  onLicensesChange: (next: WorkerLicense[]) => void
}

// Status pill styles + Arabic labels. Kept in one place so the badge can be
// rendered consistently in the list and in the success/error alerts.
const STATUS_META: Record<WorkerLicense['status'], { label: string; classes: string }> = {
  pending: { label: 'قيد المراجعة', classes: 'bg-amber-50 text-amber-700' },
  approved: { label: 'معتمدة', classes: 'bg-green-50 text-green-700' },
  rejected: { label: 'مرفوضة', classes: 'bg-red-50 text-red-700' },
}

const emptyValues: LicenseFormValues = {
  name: '',
  number: '',
  issuedBy: '',
  fileUrl: '',
}

export default function LicensesEditor({ licenses, onLicensesChange }: Props) {
  // Form lifecycle:
  //   editingId === 'new'   → adding a fresh license (empty draft)
  //   editingId === '<_id>' → editing an existing one (draft pre-filled)
  //   editingId === null    → form hidden, list visible
  const [editingId, setEditingId] = useState<string | null>(null)

  // RHF form. fileUrl is set programmatically by the upload handler since
  // there's no input field for it (we hide the native file picker).
  const form = useForm<LicenseFormValues>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: emptyValues,
    mode: 'onTouched',
  })
  const { register, handleSubmit, watch, setValue, reset, formState } = form
  const { errors, isSubmitting } = formState
  // We need fileUrl read-side for the "preview existing file" link + button label.
  const fileUrlValue = watch('fileUrl')

  // Upload + non-form errors share this state (form-level zod errors live in
  // formState.errors and render under each input).
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Two-step delete: first click sets this; second click commits.
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingInFlight, setDeletingInFlight] = useState(false)

  // Per-row "toggle active" busy flag — keyed by license id so each toggle
  // can spin independently if multiple are clicked.
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const startNewLicense = () => {
    setEditingId('new')
    reset(emptyValues)
    setError('')
  }

  const startEditLicense = (license: WorkerLicense) => {
    setEditingId(license._id)
    reset({
      name: license.name || '',
      number: license.number || '',
      issuedBy: license.issuedBy || '',
      fileUrl: license.fileUrl || '',
    })
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    reset(emptyValues)
    setError('')
  }

  // File picker — accepts images AND PDFs. Cloudinary's /auto/upload sorts
  // them into the right resource_type. Same pipeline used by avatar/chat.
  // On success we write the URL straight into the form via setValue, which
  // also clears the zod "fileUrl required" error.
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so picking the same file twice still triggers
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const result = await uploadChatFile(file)
      setValue('fileUrl', result.url, { shouldValidate: true, shouldDirty: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل رفع الملف'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  // RHF onValid handler — POST or PUT depending on whether we're editing.
  const onSubmit = async (values: LicenseFormValues) => {
    setError('')
    try {
      const payload = {
        name: values.name.trim(),
        number: (values.number || '').trim(),
        fileUrl: values.fileUrl,
        issuedBy: (values.issuedBy || '').trim(),
      }

      if (editingId === 'new') {
        const data = await api.postWithAuth('/worker/licenses', payload)
        onLicensesChange([...(licenses || []), data.license])
      } else if (editingId) {
        const data = await api.putWithAuth(`/worker/licenses/${editingId}`, payload)
        onLicensesChange(licenses.map(l => l._id === editingId ? data.license : l))
      }

      setEditingId(null)
      reset(emptyValues)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر حفظ الرخصة'
      setError(msg)
    }
  }

  const deleteLicense = async (licenseId: string) => {
    setDeletingInFlight(true)
    try {
      await api.deleteWithAuth(`/worker/licenses/${licenseId}`)
      onLicensesChange(licenses.filter(l => l._id !== licenseId))
      setDeletingId(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر حذف الرخصة'
      setError(msg)
    } finally {
      setDeletingInFlight(false)
    }
  }

  const toggleActive = async (license: WorkerLicense) => {
    setTogglingId(license._id)
    // Optimistic — flip immediately so the UI feels snappy.
    const optimisticActive = !license.active
    onLicensesChange(licenses.map(l => l._id === license._id ? { ...l, active: optimisticActive } : l))
    try {
      const data = await api.putWithAuth(`/worker/licenses/${license._id}/active`, { active: optimisticActive })
      // Trust the backend's version — it has authoritative status flags.
      onLicensesChange(licenses.map(l => l._id === license._id ? data.license : l))
    } catch (err) {
      // Revert
      onLicensesChange(licenses.map(l => l._id === license._id ? license : l))
      const msg = err instanceof Error ? err.message : 'تعذّر تحديث حالة الرخصة'
      setError(msg)
    } finally {
      setTogglingId(null)
    }
  }

  const list = licenses || []

  return (
    <section className="bg-surface-container-lowest p-6 rounded-2xl shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-on-surface flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          الرخص والشهادات
          <span className="text-xs text-on-surface-variant font-normal">
            ({list.length})
          </span>
        </h3>
        {editingId === null && (
          <button
            type="button"
            onClick={startNewLicense}
            className="inline-flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            رخصة جديدة
          </button>
        )}
      </div>

      {/* Top-level error banner — shown when the form is closed (e.g. delete or
          toggle failed). Form-level errors render inside the form below. */}
      {error && editingId === null && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-xs font-semibold underline">
            إخفاء
          </button>
        </div>
      )}

      {/* ───── FORM (add / edit) ───── */}
      {editingId !== null && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-3 bg-surface-container-low rounded-2xl p-5"
          noValidate
        >
          <h4 className="font-bold text-sm">
            {editingId === 'new' ? 'إضافة رخصة جديدة' : 'تعديل الرخصة'}
          </h4>

          <div>
            <label htmlFor="license-name" className="block text-xs font-semibold mb-1">اسم الرخصة *</label>
            <input
              id="license-name"
              type="text"
              placeholder="مثال: رخصة تدريب اللحام المتقدم"
              aria-invalid={errors.name ? 'true' : 'false'}
              className={`w-full bg-surface-container-lowest rounded-xl px-3 py-2.5 text-sm focus:ring-2 outline-none ${
                errors.name ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
              }`}
              {...register('name')}
            />
            {errors.name && (
              <p role="alert" className="text-xs text-red-700 mt-1">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="license-number" className="block text-xs font-semibold mb-1">رقم الرخصة</label>
              <input
                id="license-number"
                type="text"
                placeholder="اختياري"
                className="w-full bg-surface-container-lowest rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                {...register('number')}
              />
            </div>
            <div>
              <label htmlFor="license-issuedBy" className="block text-xs font-semibold mb-1">الجهة المُصدِرة</label>
              <input
                id="license-issuedBy"
                type="text"
                placeholder="اختياري"
                className="w-full bg-surface-container-lowest rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                {...register('issuedBy')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">ملف الرخصة *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={handleFilePick}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                {uploading ? 'جاري الرفع...' : fileUrlValue ? 'استبدال الملف' : 'رفع ملف'}
              </button>
              {fileUrlValue && (
                <a
                  href={fileUrlValue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" />
                  معاينة الملف الحالي
                </a>
              )}
            </div>
            {errors.fileUrl && (
              <p role="alert" className="text-xs text-red-700 mt-1">{errors.fileUrl.message}</p>
            )}
            <p className="text-xs text-on-surface-variant mt-1">
              PDF أو صورة (حد أقصى 10 ميجابايت). تغيير الملف يعيد الرخصة إلى مرحلة المراجعة.
            </p>
          </div>

          {error && (
            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || uploading}
              className="flex-1 bg-primary text-on-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : editingId === 'new' ? 'إرسال للمراجعة' : 'حفظ التعديلات'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isSubmitting || uploading}
              className="flex-1 bg-surface-container-high text-on-surface-variant py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* ───── LIST ───── */}
      {list.length === 0 && editingId === null ? (
        <div className="text-center py-12 bg-surface-container-low rounded-2xl">
          <ShieldCheck className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-2" />
          <p className="text-sm text-on-surface-variant">لم تُضِف أي رخصة بعد</p>
          <p className="text-xs text-on-surface-variant/60 mt-1">
            تضيف ثقة أكبر للعملاء — سيراجعها الإدارة ثم تظهر في ملفك بعد التفعيل.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map(license => {
            const meta = STATUS_META[license.status]
            const isApproved = license.status === 'approved'
            const isRejected = license.status === 'rejected'

            return (
              <li
                key={license._id}
                className="bg-surface-container-low rounded-2xl p-4"
              >
                {/* Title row: name + status pill */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-on-surface truncate">{license.name}</h4>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${meta.classes}`}>
                        {license.status === 'pending' && <Clock className="w-3 h-3" />}
                        {license.status === 'approved' && <BadgeCheck className="w-3 h-3" />}
                        {license.status === 'rejected' && <AlertCircle className="w-3 h-3" />}
                        {meta.label}
                      </span>
                    </div>
                    {(license.number || license.issuedBy) && (
                      <p className="text-xs text-on-surface-variant mt-1">
                        {license.number && <span>رقم: {license.number}</span>}
                        {license.number && license.issuedBy && <span className="mx-2">•</span>}
                        {license.issuedBy && <span>الجهة: {license.issuedBy}</span>}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rejection reason — only when admin pushed back */}
                {isRejected && license.rejectionReason && (
                  <div className="mb-3 text-xs text-red-700 bg-red-50/60 border border-red-100 rounded-lg px-3 py-2">
                    <span className="font-semibold">سبب الرفض:</span> {license.rejectionReason}
                  </div>
                )}

                {/* Bottom row OR delete-confirm strip */}
                {deletingId === license._id ? (
                  <div className="flex items-center justify-between gap-3 bg-red-50/60 border border-red-100 rounded-lg px-3 py-2">
                    <span className="text-xs text-red-700 font-semibold">هل أنت متأكد من الحذف؟</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => deleteLicense(license._id)}
                        disabled={deletingInFlight}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {deletingInFlight ? 'جاري الحذف...' : 'تأكيد'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        disabled={deletingInFlight}
                        className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold disabled:opacity-50"
                      >
                        تراجع
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {/* Activate switch — only meaningful when approved */}
                    <div className="flex items-center gap-2">
                      {isApproved ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleActive(license)}
                            disabled={togglingId === license._id}
                            className={`w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
                              license.active ? 'bg-primary' : 'bg-outline-variant/40'
                            }`}
                            aria-label={license.active ? 'إيقاف' : 'تفعيل'}
                          >
                            <span
                              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                                license.active ? 'right-1' : 'right-6'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-on-surface-variant">
                            {license.active ? 'مفعّلة' : 'غير مفعّلة'}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-on-surface-variant/60">
                          {license.status === 'pending'
                            ? 'في انتظار موافقة الإدارة'
                            : 'يجب التعديل وإعادة التقديم'}
                        </span>
                      )}
                    </div>

                    {/* File preview + edit + delete */}
                    <div className="flex items-center gap-1.5">
                      <a
                        href={license.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="معاينة الملف"
                        title="معاينة الملف"
                      >
                        <FileText className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => startEditLicense(license)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="تعديل"
                        title="تعديل"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setError(''); setDeletingId(license._id) }}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-surface-container-lowest text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="حذف"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
