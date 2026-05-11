'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'

interface SectionErrorProps {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
  title?: string
  description?: string
}

// Lighter-weight error UI for nested route segments. The root app/error.tsx
// keeps the Navbar; per-section error.tsx files render inside the existing
// layout, so this fallback skips it.
export default function SectionError({
  error,
  reset,
  unstable_retry,
  title = 'تعذّر تحميل هذا القسم',
  description = 'حدث خطأ أثناء تحميل المحتوى. حاول مرة أخرى.',
}: SectionErrorProps) {
  useEffect(() => {
    console.error('Section route threw:', error)
  }, [error])

  const retry = unstable_retry ?? reset ?? (() => window.location.reload())

  return (
    <div className="px-6 py-12">
      <div className="bg-surface-container-lowest rounded-2xl p-8 max-w-xl mx-auto text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-on-surface mb-1">{title}</h2>
        <p className="text-sm text-on-surface-variant mb-4">{description}</p>

        {error.digest && (
          <p className="text-xs text-on-surface-variant/70 mb-4 font-mono">
            معرّف الخطأ: {error.digest}
          </p>
        )}

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-container transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            حاول مرة أخرى
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
          >
            <Home className="w-4 h-4" />
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  )
}
