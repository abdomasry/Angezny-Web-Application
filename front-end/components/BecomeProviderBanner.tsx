'use client'

// "Join us, earn money" banner — shown on the home and services pages.
// Hides itself for users who are already workers/admins, and for guests
// links straight to signin with a redirect-back to /become-provider so
// they land on the form right after authenticating.

import Link from 'next/link'
import { Briefcase, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export default function BecomeProviderBanner() {
  const { user, isLoggedIn, isLoading } = useAuth()

  // Don't render anything while auth is still resolving — avoids a flash
  // of the banner for logged-in workers.
  if (isLoading) return null
  if (isLoggedIn && user && user.role !== 'customer') return null

  const href = isLoggedIn
    ? '/become-provider'
    : '/signin?redirect=/become-provider'

  return (
    <div className="bg-linear-to-l from-primary to-primary-container text-on-primary rounded-2xl p-5 lg:p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
      <div className="flex items-start sm:items-center gap-3">
        <div className="bg-white/15 rounded-xl p-2.5 shrink-0">
          <Briefcase className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-base lg:text-lg mb-0.5">
            انضم إلينا كمزوّد خدمة وابدأ في الكسب
          </h3>
          <p className="text-on-primary/85 text-xs lg:text-sm">
            قدّم طلبك الآن، وبعد القبول ستظهر خدماتك للعملاء فوراً.
          </p>
        </div>
      </div>
      <Link
        href={href}
        className="bg-white text-primary font-bold px-5 py-2.5 rounded-xl hover:bg-white/90 transition-colors inline-flex items-center gap-2 shrink-0"
      >
        قدّم الآن
        <ArrowLeft className="w-4 h-4" />
      </Link>
    </div>
  )
}
