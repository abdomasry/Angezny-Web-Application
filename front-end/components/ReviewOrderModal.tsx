'use client'

// ReviewOrderModal — shown from the customer's "تقييم الخدمة" button on
// completed orders. Submits via POST /api/reviews. The backend handles:
//   - one-review-per-order dedupe
//   - WorkerProfile.ratingAverage + totalReviews recompute
//   - notification to the worker
//
// On success we call onDone with the created review so the parent can
// swap the button for the rendered review inline without a refetch.

import { useState } from 'react'
import { Star, Loader2, X as XIcon, AlertCircle, Send } from 'lucide-react'
import { api } from '@/lib/api'

interface Props {
  orderId: string
  serviceName?: string
  workerName?: string
  onClose: () => void
  onDone: (review: {
    _id: string
    rating: number
    comment?: string
    createdAt: string
  }) => void
}

export default function ReviewOrderModal({
  orderId,
  serviceName,
  workerName,
  onClose,
  onDone,
}: Props) {
  // We keep a separate `hovered` so the stars preview as the user moves the
  // mouse, falling back to the committed `rating` state when not hovering.
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const display = hovered || rating

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!rating) {
      setError('يرجى اختيار تقييم من 1 إلى 5 نجوم')
      return
    }
    setSubmitting(true)
    try {
      const data = await api.postWithAuth('/reviews', {
        serviceRequestId: orderId,
        rating,
        comment: comment.trim() || undefined,
      })
      onDone(data.review)
    } catch (err: any) {
      setError(err?.message || 'تعذّر إرسال التقييم')
    } finally {
      setSubmitting(false)
    }
  }

  // Friendly label that changes with the selected rating. Gives the star
  // picker a clear "what does 4 mean here" hint instead of leaving it numeric.
  const ratingLabel = (n: number) => {
    if (n >= 5) return 'ممتاز'
    if (n >= 4) return 'جيد جداً'
    if (n >= 3) return 'جيد'
    if (n >= 2) return 'مقبول'
    if (n >= 1) return 'سيء'
    return 'اختر تقييمك'
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-outline-variant/10">
          <div>
            <h2 className="text-xl font-black text-on-surface">تقييم الخدمة</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {serviceName && <>{serviceName}</>}
              {workerName && <span> • {workerName}</span>}
            </p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Star picker — row of 5, click to commit, hover to preview. */}
          <div className="text-center">
            <p className="text-sm text-on-surface-variant mb-3">كم ترشّح هذه الخدمة؟</p>
            <div className="flex items-center justify-center gap-2" dir="ltr">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={`${n} نجوم`}
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      n <= display
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-outline-variant/40'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className={`mt-3 text-sm font-bold transition-colors ${
              display > 0 ? 'text-primary' : 'text-on-surface-variant/60'
            }`}>
              {ratingLabel(display)}
            </p>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">
              تعليقك (اختياري)
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="شارك تجربتك مع الحرفي — جودة العمل، الالتزام بالوقت، الاحترافية..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
            <p className="text-xs text-on-surface-variant mt-1 text-left">
              {comment.length} / 1000
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
              لاحقاً
            </button>
            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  إرسال التقييم
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
