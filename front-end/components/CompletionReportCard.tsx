'use client'

// CompletionReportCard — shared renderer for the worker's "proof of work"
// attached to a completed order. Used on both:
//   - /profile (customer viewing their completed order)
//   - /dashboard (worker viewing their own history)
//
// The card is collapsed by default so completed-order lists stay compact,
// and expands to show details + a thumbnail gallery. Clicking a thumbnail
// opens the full-size image in a new tab (same UX as chat image messages).

import { useState } from 'react'
import { FileCheck2, ChevronDown, ChevronUp, Calendar } from 'lucide-react'

export interface CompletionReportData {
  details?: string
  images?: string[]
  submittedAt?: string
}

interface Props {
  report: CompletionReportData
  // When true (worker viewing their own history), the card shows "your report"
  // phrasing. When false (customer viewing), it shows "worker's report".
  viewerIsWorker?: boolean
  // Force the card open on mount (used when the customer lands from a
  // completion notification and we want them to see the report immediately).
  defaultOpen?: boolean
}

export default function CompletionReportCard({
  report,
  viewerIsWorker = false,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  const hasContent = !!report && (report.details || (report.images && report.images.length > 0))
  if (!hasContent) return null

  const submittedAt = report.submittedAt
    ? new Date(report.submittedAt).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <div className="mt-4 bg-green-50 border border-green-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-green-100 transition-colors text-right"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCheck2 className="w-5 h-5 text-green-700 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-green-800 text-sm truncate">
              {viewerIsWorker ? 'تقرير الإنجاز المرسل' : 'تقرير إنجاز الحرفي'}
            </p>
            {submittedAt && (
              <p className="text-xs text-green-700/80 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {submittedAt}
              </p>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-green-700 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-green-700 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {report.details && (
            <div>
              <p className="text-xs font-bold text-green-800 mb-1">التفاصيل</p>
              <p className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">
                {report.details}
              </p>
            </div>
          )}
          {report.images && report.images.length > 0 && (
            <div>
              <p className="text-xs font-bold text-green-800 mb-2">
                الصور ({report.images.length})
              </p>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {report.images.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-lg overflow-hidden bg-white/40 block group"
                    title="عرض الصورة"
                  >
                    <img
                      src={url}
                      alt={`صورة ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
