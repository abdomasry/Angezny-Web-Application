'use client'

// =============================================================================
// PROVIDER APPLICATIONS QUEUE — admin-side
// =============================================================================
// One row per /become-provider submission. Admin can approve (flips the user's
// role to worker, creates a WorkerProfile + initial services) or reject with
// an optional reason. Approved/rejected rows fall out of the "pending" tab.

import { useEffect, useState } from 'react'
import { Briefcase, Check, X as XIcon, FileText, ImageIcon, ChevronDown, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface ProposedService {
  name: string
  description?: string
  price?: number
  typeofService?: 'fixed' | 'hourly' | 'range'
  priceRange?: { min?: number; max?: number }
  images?: string[]
  pdfs?: string[]
}

interface ApplicationRow {
  _id: string
  status: 'pending' | 'approved' | 'rejected'
  bio: string
  rejectionReason?: string
  submittedAt?: string
  createdAt?: string
  userId: { _id: string; firstName: string; lastName: string; email?: string; phone?: string; profileImage?: string } | null
  category: { _id: string; name: string } | null
  proposedServices?: ProposedService[]
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'approved', label: 'مقبولة' },
  { key: 'rejected', label: 'مرفوضة' },
  { key: 'all', label: 'الكل' },
]

const STATUS_BADGE: Record<ApplicationRow['status'], { label: string; classes: string }> = {
  pending: { label: 'قيد المراجعة', classes: 'bg-amber-50 text-amber-700' },
  approved: { label: 'مقبولة', classes: 'bg-green-50 text-green-700' },
  rejected: { label: 'مرفوضة', classes: 'bg-red-50 text-red-700' },
}

export default function ProviderApplicationsQueue() {
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [rows, setRows] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .getWithAuth(`/provider-applications?status=${status}`)
      .then((data) => {
        if (cancelled) return
        setRows(data.applications || [])
      })
      .catch((err: any) => {
        if (cancelled) return
        setError(err?.message || 'تعذّر جلب الطلبات')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [status])

  const approve = async (row: ApplicationRow) => {
    setActingId(row._id)
    try {
      await api.putWithAuth(`/provider-applications/${row._id}/approve`, {})
      // Drop from current view if filtering by pending; mark approved otherwise.
      if (status === 'pending') {
        setRows(prev => prev.filter(r => r._id !== row._id))
      } else {
        setRows(prev => prev.map(r => r._id === row._id ? { ...r, status: 'approved' } : r))
      }
    } catch (err: any) {
      setError(err?.message || 'تعذّر قبول الطلب')
    } finally {
      setActingId(null)
    }
  }

  const reject = async (row: ApplicationRow) => {
    const reason = window.prompt('سبب الرفض (اختياري):') ?? ''
    setActingId(row._id)
    try {
      await api.putWithAuth(`/provider-applications/${row._id}/reject`, {
        rejectionReason: reason,
      })
      if (status === 'pending') {
        setRows(prev => prev.filter(r => r._id !== row._id))
      } else {
        setRows(prev => prev.map(r => r._id === row._id ? { ...r, status: 'rejected', rejectionReason: reason } : r))
      }
    } catch (err: any) {
      setError(err?.message || 'تعذّر رفض الطلب')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">طلبات الانضمام كمزوّد خدمة</h2>
          <p className="text-on-surface-variant text-sm mt-1">
            مراجعة طلبات العملاء للترقية إلى مزوّد خدمة
          </p>
        </div>
        <Briefcase className="w-7 h-7 text-primary" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-outline-variant/30">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              status === tab.key
                ? 'text-primary border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-error-container/30 text-on-error-container text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-on-surface-variant py-12 bg-surface-container-lowest rounded-2xl">
          لا توجد طلبات في هذا التصنيف
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(row => {
            const expanded = expandedId === row._id
            const userName = row.userId
              ? `${row.userId.firstName || ''} ${row.userId.lastName || ''}`.trim()
              : 'مستخدم محذوف'
            const badge = STATUS_BADGE[row.status]
            return (
              <div key={row._id} className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-primary-container/40 flex items-center justify-center text-primary font-bold shrink-0 overflow-hidden">
                      {row.userId?.profileImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.userId.profileImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        userName.charAt(0) || '?'
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-on-surface truncate">{userName}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {row.userId?.email || row.userId?.phone || '—'}
                      </p>
                      <p className="text-xs text-primary mt-1">
                        فئة العمل: {row.category?.name || '—'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${badge.classes}`}>
                    {badge.label}
                  </span>
                </div>

                <p className="text-sm text-on-surface-variant mb-3 leading-relaxed">
                  {row.bio}
                </p>

                {row.proposedServices && row.proposedServices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : row._id)}
                    className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    {expanded ? 'إخفاء' : `عرض الخدمات المقترحة (${row.proposedServices.length})`}
                  </button>
                )}

                {expanded && row.proposedServices && (
                  <div className="mt-3 space-y-2">
                    {row.proposedServices.map((s, i) => (
                      <div key={i} className="bg-surface-container-low rounded-xl p-3 text-sm">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <p className="font-bold text-on-surface">{s.name}</p>
                          <p className="text-xs text-on-surface-variant whitespace-nowrap">
                            {s.typeofService === 'range'
                              ? `${s.priceRange?.min ?? 0} - ${s.priceRange?.max ?? 0} ج.م`
                              : `${s.price ?? 0} ج.م${s.typeofService === 'hourly' ? ' / الساعة' : ''}`}
                          </p>
                        </div>
                        {s.description && (
                          <p className="text-xs text-on-surface-variant mb-2">{s.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {(s.images || []).map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1 text-xs bg-primary-container/30 text-primary px-2 py-1 rounded-md hover:underline">
                              <ImageIcon className="w-3 h-3" /> صورة {idx + 1}
                            </a>
                          ))}
                          {(s.pdfs || []).map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1 text-xs bg-surface-container border border-outline-variant/30 text-on-surface px-2 py-1 rounded-md hover:underline">
                              <FileText className="w-3 h-3" /> PDF {idx + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {row.status === 'rejected' && row.rejectionReason && (
                  <p className="mt-3 text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg">
                    سبب الرفض: {row.rejectionReason}
                  </p>
                )}

                {row.status === 'pending' && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => approve(row)}
                      disabled={actingId === row._id}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> قبول
                    </button>
                    <button
                      onClick={() => reject(row)}
                      disabled={actingId === row._id}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <XIcon className="w-4 h-4" /> رفض
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
