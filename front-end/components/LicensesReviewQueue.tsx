'use client'

// =============================================================================
// LICENSES REVIEW QUEUE — admin-side
// =============================================================================
// One row per license submission, fetched from GET /api/admin/licenses.
// Admin can approve (creates a "تمت الموافقة" notification for the worker) or
// reject with an optional reason (creates a "تم الرفض" notification with that
// reason). On either action we drop the row from the visible queue locally so
// the admin doesn't have to wait for a re-fetch.
//
// Filter tabs let the admin browse pending / approved / rejected. Pagination
// is handled by the backend; we just request page numbers as the admin clicks.
// =============================================================================

import { useEffect, useState } from 'react'
import { ShieldCheck, FileText, Check, X as XIcon, ChevronLeft, ChevronRight, AlertCircle, Clock, BadgeCheck } from 'lucide-react'
import { api } from '@/lib/api'
import type { WorkerLicense, PaginationInfo } from '@/lib/types'

// Row shape returned by the aggregation in admin.controller.getLicenses.
// The backend flattens each license out so we render one card per submission.
interface AdminLicenseRow {
  workerProfileId: string
  workerUserId: string
  workerName: string
  workerProfileImage?: string
  license: WorkerLicense
}

type StatusFilter = 'pending' | 'approved' | 'rejected'

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'approved', label: 'معتمدة' },
  { key: 'rejected', label: 'مرفوضة' },
]

// Status pill — same colors as the worker-side LicensesEditor for consistency.
const STATUS_BADGE: Record<WorkerLicense['status'], { label: string; classes: string }> = {
  pending: { label: 'قيد المراجعة', classes: 'bg-amber-50 text-amber-700' },
  approved: { label: 'معتمدة', classes: 'bg-green-50 text-green-700' },
  rejected: { label: 'مرفوضة', classes: 'bg-red-50 text-red-700' },
}

export default function LicensesReviewQueue() {
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [rows, setRows] = useState<AdminLicenseRow[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1, limit: 20, total: 0, pages: 0,
  })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Per-row in-flight flag — keyed by license id so each card spins
  // independently (admin can't double-click the same license).
  const [actingId, setActingId] = useState<string | null>(null)

  // Reset to page 1 whenever the status filter changes — otherwise the admin
  // could land on "page 3" of a list with only 2 pages.
  useEffect(() => {
    setPage(1)
  }, [status])

  // Fetch on mount + whenever filters/page change.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await api.getWithAuth(`/admin/licenses?status=${status}&page=${page}&limit=20`)
        if (cancelled) return
        setRows(data.licenses || [])
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 0 })
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'تعذّر جلب الرخص'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [status, page])

  const approve = async (row: AdminLicenseRow) => {
    setActingId(row.license._id)
    try {
      await api.putWithAuth(`/admin/licenses/${row.license._id}/approve`, {})
      // Drop the row optimistically — only matters when filter is "pending".
      // For other filters we leave it; a refresh would correct any drift.
      if (status === 'pending') {
        setRows(prev => prev.filter(r => r.license._id !== row.license._id))
        setPagination(p => ({ ...p, total: Math.max(0, p.total - 1) }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر الموافقة على الرخصة'
      setError(msg)
    } finally {
      setActingId(null)
    }
  }

  const reject = async (row: AdminLicenseRow) => {
    // window.prompt is the existing reject-reason pattern in this app
    // (see worker dashboard order rejection). Plain, accessible, no modal.
    const reason = window.prompt('سبب الرفض (اختياري):')
    if (reason === null) return // admin clicked Cancel

    setActingId(row.license._id)
    try {
      await api.putWithAuth(`/admin/licenses/${row.license._id}/reject`, {
        reason: reason.trim(),
      })
      if (status === 'pending') {
        setRows(prev => prev.filter(r => r.license._id !== row.license._id))
        setPagination(p => ({ ...p, total: Math.max(0, p.total - 1) }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر رفض الرخصة'
      setError(msg)
    } finally {
      setActingId(null)
    }
  }

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-black text-on-surface flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          مراجعة الرخص
          {pagination.total > 0 && (
            <span className="bg-primary-container/40 text-primary text-sm font-semibold px-2.5 py-0.5 rounded-full">
              {pagination.total}
            </span>
          )}
        </h2>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatus(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              status === tab.key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-xs font-semibold underline">
            إخفاء
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-surface-container-lowest rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-surface-container-lowest rounded-2xl">
          <ShieldCheck className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-2" />
          <p className="text-on-surface-variant">لا توجد رخص في هذه الحالة</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(row => {
            const meta = STATUS_BADGE[row.license.status]
            return (
              <li key={row.license._id} className="bg-surface-container-lowest rounded-2xl p-5">
                {/* Top row: worker info + license name + status badge */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high shrink-0">
                    {row.workerProfileImage ? (
                      <img
                        src={row.workerProfileImage}
                        alt={row.workerName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary font-black">
                        {row.workerName?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface-variant">{row.workerName || 'حرفي'}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <h3 className="font-bold text-on-surface truncate">{row.license.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${meta.classes}`}>
                        {row.license.status === 'pending' && <Clock className="w-3 h-3" />}
                        {row.license.status === 'approved' && <BadgeCheck className="w-3 h-3" />}
                        {row.license.status === 'rejected' && <AlertCircle className="w-3 h-3" />}
                        {meta.label}
                      </span>
                    </div>
                    {(row.license.number || row.license.issuedBy) && (
                      <p className="text-xs text-on-surface-variant mt-1">
                        {row.license.number && <span>رقم: {row.license.number}</span>}
                        {row.license.number && row.license.issuedBy && <span className="mx-2">•</span>}
                        {row.license.issuedBy && <span>الجهة: {row.license.issuedBy}</span>}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rejection reason (only for already-rejected rows) */}
                {row.license.status === 'rejected' && row.license.rejectionReason && (
                  <div className="mb-3 text-xs text-red-700 bg-red-50/60 border border-red-100 rounded-lg px-3 py-2">
                    <span className="font-semibold">السبب المُسجّل:</span> {row.license.rejectionReason}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <a
                    href={row.license.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    معاينة الملف
                  </a>

                  {/* Approve/Reject only meaningful for pending entries.
                      For approved/rejected rows we still show "Reject" / "Approve"
                      respectively so admin can flip a decision. */}
                  <div className="flex items-center gap-2">
                    {row.license.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => approve(row)}
                        disabled={actingId === row.license._id}
                        className="inline-flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        موافقة
                      </button>
                    )}
                    {row.license.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => reject(row)}
                        disabled={actingId === row.license._id}
                        className="inline-flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        <XIcon className="w-4 h-4" />
                        رفض
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Pagination — only when there's more than one page */}
      {pagination.pages > 1 && !loading && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
            aria-label="السابق"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="text-sm text-on-surface-variant px-3">
            صفحة {page} من {pagination.pages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
            aria-label="التالي"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      )}
    </section>
  )
}
