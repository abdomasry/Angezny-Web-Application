// RankBadge — small inline pill that visually represents a worker's rank.
// Used on both the public profile sidebar and the worker dashboard header.
//
// The label and color come from a single map so the component stays in sync
// with the backend enum (back-end/src/lib/rank.js).

import { Award } from 'lucide-react'

type Rank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

const RANK_META: Record<Rank, { label: string; bg: string; text: string; ring: string }> = {
  bronze:   { label: 'برونزي', bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  silver:   { label: 'فضي',    bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-200' },
  gold:     { label: 'ذهبي',   bg: 'bg-yellow-100',  text: 'text-yellow-700',  ring: 'ring-yellow-200' },
  platinum: { label: 'بلاتيني', bg: 'bg-cyan-100',   text: 'text-cyan-700',    ring: 'ring-cyan-200' },
  diamond:  { label: 'ماسي',   bg: 'bg-primary/10', text: 'text-primary',     ring: 'ring-primary/20' },
}

interface Props {
  rank?: string
  size?: 'sm' | 'md'
  className?: string
}

export default function RankBadge({ rank, size = 'sm', className = '' }: Props) {
  // Default to bronze if a worker has no rank set yet (e.g. a freshly-created
  // profile from before this feature shipped, where the field is absent).
  const safe: Rank = (rank as Rank) in RANK_META ? (rank as Rank) : 'bronze'
  const meta = RANK_META[safe]

  const sizing = size === 'md'
    ? 'text-sm px-3 py-1'
    : 'text-xs px-2 py-0.5'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ring-1 ${meta.bg} ${meta.text} ${meta.ring} ${sizing} ${className}`}
    >
      <Award className={size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} />
      {meta.label}
    </span>
  )
}
