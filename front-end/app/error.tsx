'use client'

// =============================================================================
// GLOBAL ERROR BOUNDARY — shown when any page in the app throws at runtime
// =============================================================================
// In Next.js 16, error.tsx wraps page.tsx + nested layouts (but NOT the root
// layout) in a React error boundary. When a render or effect throws, the
// router unmounts the broken segment and renders this fallback UI instead of
// the white screen of death.
//
// `unstable_retry` is the Next 16 successor to `reset` — calls re-attempt
// the rendering of the boundary's children. If the underlying cause is
// transient (network blip, race condition), the user gets back to work.
// =============================================================================

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'
import Navbar from '@/components/Navbar'

interface ErrorProps {
  error: Error & { digest?: string }
  // Next 16 API. We accept it as optional so the file still compiles cleanly
  // if the framework ever renames it again — falling back to `location.reload`
  // means the user can always recover.
  reset?: () => void
  unstable_retry?: () => void
}

export default function GlobalError({ error, reset, unstable_retry }: ErrorProps) {
  // Send to console at minimum so the dev sees what blew up. When Sentry/Pino
  // gets wired, this is the natural hook for that capture call too.
  useEffect(() => {
    console.error('App route threw:', error)
  }, [error])

  const retry = unstable_retry ?? reset ?? (() => window.location.reload())

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-2xl mx-auto text-center">
        <div className="bg-surface-container-lowest rounded-2xl p-12">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-2">
            حدث خطأ غير متوقع
          </h1>
          <p className="text-sm text-on-surface-variant mb-6">
            عذراً، صادفنا مشكلة أثناء عرض الصفحة. حاول مرة أخرى أو عُد للرئيسية.
          </p>

          {/* Show the error digest to the user. It's a stable hash Next assigns
              to each rendered error — useful when reporting bugs because it
              ties their experience to the server logs without leaking the
              full stack trace. */}
          {error.digest && (
            <p className="text-xs text-on-surface-variant/70 mb-6 font-mono">
              معرّف الخطأ: {error.digest}
            </p>
          )}

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-container transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              حاول مرة أخرى
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
            >
              <Home className="w-4 h-4" />
              الرئيسية
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
