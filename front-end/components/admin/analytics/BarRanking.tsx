'use client'

// Horizontal-style bar chart for ranked categorical data
// (orders by governorate, reports by category, avg completion time).
// Recharts' BarChart with vertical layout is what reads best for RTL
// labels on long category names.

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Props {
  title: string
  data: Array<{ name: string; value: number }>
  color?: string
  emptyText?: string
}

export default function BarRanking({
  title,
  data,
  color = '#6366f1',
  emptyText = 'لا توجد بيانات',
}: Props) {
  return (
    <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
      <h3 className="font-semibold text-on-surface mb-4">{title}</h3>
      {data.length === 0 ? (
        <div className="text-center text-on-surface-variant text-sm py-12">{emptyText}</div>
      ) : (
        <div style={{ height: Math.max(220, data.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" fontSize={11} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" width={110} fontSize={11} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
