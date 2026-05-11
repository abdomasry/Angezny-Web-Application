// =============================================================================
// 404 — shown for any URL that doesn't match a route
// =============================================================================
// In Next.js 16's App Router, a top-level not-found.tsx catches both:
//   1. Explicit notFound() calls from inside pages/route handlers, and
//   2. Any URL the router can't match to a page.
//
// Server component by default — keeps the bundle small and lets us mount
// Navbar (which is a client component) at the boundary without issues.
// =============================================================================

import Link from 'next/link'
import { ChevronLeft, FileQuestion } from 'lucide-react'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: 'الصفحة غير موجودة | DK yet',
}

export default function NotFound() {
  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-2xl mx-auto text-center">
        <div className="bg-surface-container-lowest rounded-2xl p-12">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <FileQuestion className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-on-surface mb-2">404</h1>
          <p className="text-lg text-on-surface mb-1">الصفحة غير موجودة</p>
          <p className="text-sm text-on-surface-variant mb-6">
            قد يكون الرابط قديماً أو تم إزالة الصفحة.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-container transition-colors"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              العودة للرئيسية
            </Link>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
            >
              تصفح الخدمات
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
