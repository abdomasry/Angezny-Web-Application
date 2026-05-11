'use client'

// CancelOrderModal — used by the customer's order cards on /profile.
//
// Two visual modes based on the order's current status:
//   - status === 'pending'
//       "direct cancel" copy — "الطلب سيُلغى فوراً".
//   - status === 'accepted' | 'in_progress'
//       "request cancellation" copy — "سيُرسل طلب الإلغاء للحرفي لمراجعته".
//
// Same POST endpoint handles both cases; the backend decides the effect
// from the order's current status. This keeps the client dumb.

import { useState } from 'react'
import { AlertTriangle, Loader2, X as XIcon, Send, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface Props {
  orderId: string
  orderStatus: 'pending' | 'accepted' | 'in_progress'
  serviceName?: string
  onClose: () => void
  // Called after a successful cancellation (direct or request). The parent
  // uses this to refresh the order list without a full page reload.
  onDone: (mode: 'direct' | 'request') => void
}

export default function CancelOrderModal({
  orderId,
  orderStatus,
  serviceName,
  onClose,
  onDone,
}: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isDirect = orderStatus === 'pending'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await api.postWithAuth(`/customer/orders/${orderId}/cancel`, {
        reason: reason.trim() || undefined,
      })
      onDone(data?.mode === 'direct' ? 'direct' : 'request')
    } catch (err: any) {
      setError(err?.message || 'تعذّر إلغاء الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-outline-variant/10">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-on-surface">
                {isDirect ? 'إلغاء الطلب' : 'طلب إلغاء الخدمة'}
              </h2>
              {serviceName && (
                <p className="text-sm text-on-surface-variant mt-0.5">{serviceName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Mode-specific explanation */}
          <div className={`rounded-xl p-4 text-sm leading-relaxed ${
            isDirect ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'
          }`}>
            {isDirect ? (
              <p>
                الطلب لم يُقبل بعد من الحرفي، لذا سيُلغى فوراً بدون الحاجة لموافقته.
              </p>
            ) : (
              <p>
                الحرفي وافق على الطلب بالفعل. سيُرسل طلب الإلغاء للحرفي لمراجعته،
                وسيتم إلغاء الخدمة فقط بعد موافقته.
              </p>
            )}
          </div>

          {/* Reason (optional) */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">
              سبب الإلغاء (اختياري)
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="أخبر الحرفي بسبب الإلغاء إن رغبت..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
            <p className="text-xs text-on-surface-variant mt-1 text-left">
              {reason.length} / 500
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 text-error text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-outline-variant/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-high disabled:opacity-50"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                isDirect ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : isDirect ? (
                <>
                  <XIcon className="w-4 h-4" />
                  تأكيد الإلغاء
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  إرسال طلب الإلغاء
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
