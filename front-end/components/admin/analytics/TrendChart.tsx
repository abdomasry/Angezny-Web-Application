'use client'

// Line chart for time-series data (orders trend, revenue trend).
// Wrapper around Recharts. Auto-formats date labels based on the
// number of points so a 90-day chart doesn't render every label.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Props {
  title: string
  // Loose shape on purpose — callers pass typed series like `TrendPoint[]`
  // (with optional `count`/`revenue`) and Recharts only needs `date` plus
  // whatever `dataKey` points to. An index signature would reject
  // interface types whose optional fields aren't `unknown`-compatible.
  data: Array<{ date: string }>
  dataKey: string
  color?: string
  emptyText?: string
}

export default function TrendChart({
  title,
  data,
  dataKey,
  color = '#6366f1',
  emptyText = 'لا توجد بيانات',
}: Props) {
  return (
    <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
      <h3 className="font-semibold text-on-surface mb-4">{title}</h3>
      {data.length === 0 ? (
        <div className="text-center text-on-surface-variant text-sm py-12">{emptyText}</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDateLabel(String(v))}
                fontSize={11}
                stroke="#94a3b8"
              />
              <YAxis fontSize={11} stroke="#94a3b8" />
              <Tooltip
                labelFormatter={(v) => formatDateLabel(String(v), true)}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// Compact date label for the X axis. ISO string in → "MM/DD" or "MMM" out.
function formatDateLabel(iso: string, full = false) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (full) return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
  return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}
