'use client'

// Pie / donut chart for status & payment-method breakdowns.
// Slice colors come from a fixed palette so consecutive slices stay
// visually distinct.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#14b8a6', // teal
]

interface Props {
  title: string
  data: Array<{ name: string; value: number }>
  donut?: boolean
  emptyText?: string
}

export default function BreakdownChart({
  title,
  data,
  donut = false,
  emptyText = 'لا توجد بيانات',
}: Props) {
  const total = data.reduce((s, r) => s + r.value, 0)

  return (
    <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
      <h3 className="font-semibold text-on-surface mb-4">{title}</h3>
      {total === 0 ? (
        <div className="text-center text-on-surface-variant text-sm py-12">{emptyText}</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={donut ? 50 : 0}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
