'use client'

// Single KPI tile. Used for the cards row at the top of the analytics
// page (total orders, revenue, cancellation rate, etc.).
//
// `value` accepts a string so callers can pre-format with locale/currency.
// We don't format inside because revenue, percentages, and counts each
// need different formatters.

import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const tones = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-green-50 text-green-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
}

export default function KpiCard({ label, value, icon: Icon, hint, tone = 'default' }: Props) {
  return (
    <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-on-surface-variant">{label}</span>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-on-surface">{value}</div>
      {hint && <div className="text-xs text-on-surface-variant mt-1">{hint}</div>}
    </div>
  )
}
