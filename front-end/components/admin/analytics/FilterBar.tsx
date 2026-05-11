'use client'

// Sticky filter bar at the top of the analytics page. Owns the range
// selector and writes it back into the URL so the filter is shareable
// and survives a refresh. The page reads the range from `useSearchParams`.

import type { AnalyticsRange } from '@/lib/api/adminAnalytics'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: '7d', label: '٧ أيام' },
  { value: '30d', label: '٣٠ يوماً' },
  { value: '90d', label: '٩٠ يوماً' },
  { value: 'all', label: 'كل الوقت' },
]

interface Props {
  range: AnalyticsRange
}

export default function FilterBar({ range }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Update the `range` query param without losing other params (e.g. tab).
  const setRange = (next: AnalyticsRange) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', next)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="sticky top-16 z-30 bg-background/90 backdrop-blur border-b border-outline-variant/15 -mx-8 px-8 py-3 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-on-surface-variant ml-2">النطاق الزمني:</span>
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              range === r.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
