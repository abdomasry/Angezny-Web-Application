'use client'

import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export default function Pagination({ page, totalPages, onPageChange, className = '' }: Props) {
  const t = useTranslations('common')
  const isRTL = useLocale() === 'ar'
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft
  const NextIcon = isRTL ? ChevronLeft : ChevronRight

  if (totalPages <= 1) return null

  const goPrev = () => onPageChange(Math.max(1, page - 1))
  const goNext = () => onPageChange(Math.min(totalPages, page + 1))

  // Pick a window of up to 5 page numbers centred on the current page.
  // Keeps numeric controls usable when totalPages is large (the old code
  // always showed 1..5, so users on page 7 couldn't see their current page).
  const windowSize = 5
  const start = Math.max(1, Math.min(page - Math.floor(windowSize / 2), totalPages - windowSize + 1))
  const end = Math.min(totalPages, start + windowSize - 1)
  const numbers: number[] = []
  for (let i = start; i <= end; i++) numbers.push(i)

  const arrowBtn = 'inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30 hover:bg-surface-container'
  const numBtnBase = 'w-9 h-9 sm:w-10 sm:h-10 inline-flex items-center justify-center rounded-lg font-bold transition-colors text-sm'

  return (
    <div className={`flex items-center justify-center gap-1.5 sm:gap-2 ${className}`}>
      <button type="button" onClick={goPrev} disabled={page === 1} className={arrowBtn} aria-label={t('previous')}>
        <PrevIcon className="w-5 h-5" />
      </button>

      {/* Compact label on phones — numeric buttons take too much space. */}
      <span className="sm:hidden text-sm text-on-surface-variant px-2 min-w-[80px] text-center">
        {t('page', { page, total: totalPages })}
      </span>

      {/* Numeric buttons on >= sm. */}
      <div className="hidden sm:flex items-center gap-2">
        {numbers.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onPageChange(n)}
            className={`${numBtnBase} ${n === page ? 'bg-primary text-white' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'}`}
          >
            {n}
          </button>
        ))}
      </div>

      <button type="button" onClick={goNext} disabled={page === totalPages} className={arrowBtn} aria-label={t('next')}>
        <NextIcon className="w-5 h-5" />
      </button>
    </div>
  )
}
