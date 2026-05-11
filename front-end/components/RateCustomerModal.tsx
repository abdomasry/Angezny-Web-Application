'use client'

import { useState } from 'react'
import { Star, X } from 'lucide-react'
import { api } from '@/lib/api'

interface RateCustomerModalProps {
  serviceRequestId: string
  customerName: string
  onClose: () => void
  onSuccess: () => void  // called after a 201 so the parent can disable the trigger
}

export default function RateCustomerModal({ serviceRequestId, customerName, onClose, onSuccess }: RateCustomerModalProps) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (rating < 1) {
      setError('يرجى اختيار تقييم من 1 إلى 5')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await api.postWithAuth('/reviews', {
        serviceRequestId,
        rating,
        comment: comment.trim(),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'تعذر إرسال التقييم')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">قيم العميل</h2>
            <p className="text-sm text-on-surface-variant">{customerName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-surface-container-low rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center gap-2 mb-6" dir="ltr">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-1"
              aria-label={`${n} نجوم`}
            >
              <Star
                className={`w-9 h-9 transition-colors ${
                  n <= (hover || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-outline-variant'
                }`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="اكتب تعليقاً (اختياري)..."
          maxLength={1000}
          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-primary"
          rows={4}
        />

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-outline-variant/30 font-medium hover:bg-surface-container-low"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary-container disabled:opacity-50"
          >
            {submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}
          </button>
        </div>
      </div>
    </div>
  )
}
