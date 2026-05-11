'use client'

// =============================================================================
// /support/[id] — single-ticket thread view (user side)
// =============================================================================
// Fetches the ticket on mount, renders the shared <TicketThread /> component
// (also used by the admin panel), and lets the submitter reply.
//
// Access control is backend-enforced: a user who tries to open someone else's
// ticket will get a 403 from GET /support/tickets/:id and we show a friendly
// error. Admins can view any ticket but we route them through /admin instead.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import Navbar from '@/components/Navbar'
import TicketThread from '@/components/TicketThread'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { SupportTicket } from '@/lib/types'

export default function TicketDetailPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const ticketId = params?.id as string | undefined

  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Auth gate (same rules as /support — logged out → signin, admin → /admin).
  useEffect(() => {
    if (authLoading) return
    if (!isLoggedIn) {
      router.replace(`/signin?redirect=/support/${ticketId || ''}`)
      return
    }
    if (user?.role === 'admin') {
      router.replace('/admin')
    }
  }, [authLoading, isLoggedIn, user, router, ticketId])

  useEffect(() => {
    if (!ticketId || !isLoggedIn || user?.role === 'admin') return
    setLoading(true)
    setError('')
    api.getWithAuth(`/support/tickets/${ticketId}`)
      .then(data => setTicket(data.ticket))
      .catch(err => setError(err?.message || 'تعذّر تحميل البلاغ'))
      .finally(() => setLoading(false))
  }, [ticketId, isLoggedIn, user])

  if (authLoading || !isLoggedIn || user?.role === 'admin') {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-40 text-on-surface-variant">
            <Loader2 className="w-6 h-6 animate-spin mx-2" />
            جاري التحميل...
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-sm text-on-surface-variant mb-4 flex items-center gap-1">
          <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/support" className="hover:text-primary transition-colors">الدعم والمساعدة</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-on-surface">البلاغ</span>
        </nav>

        {loading ? (
          <div className="bg-surface-container-lowest rounded-2xl h-96 animate-pulse" />
        ) : error || !ticket ? (
          <div className="bg-error/10 border border-error/30 rounded-xl px-6 py-8 text-center">
            <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
            <p className="text-error font-bold mb-2">{error || 'البلاغ غير موجود'}</p>
            <Link
              href="/support"
              className="inline-block bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold hover:bg-primary-container transition-colors"
            >
              العودة لبلاغاتي
            </Link>
          </div>
        ) : (
          <div className="h-[calc(100vh-180px)]">
            <TicketThread
              ticket={ticket}
              currentUserId={user?.id}
              onUpdate={setTicket}
            />
          </div>
        )}
      </main>
    </div>
  )
}
