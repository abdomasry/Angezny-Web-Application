'use client'

// =============================================================================
// CHECKOUT RESULT — /checkout/result?paymentId=<id>
// =============================================================================
// Where Paymob redirects the customer after the hosted checkout. The webhook
// is the source of truth (it flips Payment.status on the server), so all this
// page does is read the latest state and show it. We poll for a few seconds
// because the redirect can land a tick before the webhook.
// =============================================================================

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import type { PaymentStatus } from '@/lib/types'

function CheckoutResultContent() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('paymentId')
  const t = useTranslations()

  const [payment, setPayment] = useState<PaymentStatus | null>(null)
  const [error, setError] = useState('')
  // We poll up to ~10s. If the webhook hasn't landed by then, the customer
  // can come back later — the order is already linked to the Payment doc.
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    if (!paymentId) {
      setError('Missing payment id')
      setPolling(false)
      return
    }
    let cancelled = false
    let attempts = 0
    const MAX = 10

    const tick = async () => {
      if (cancelled) return
      attempts += 1
      try {
        const data = await api.getWithAuth(`/payments/${paymentId}/status`)
        const p = data?.payment as PaymentStatus | undefined
        if (p) {
          setPayment(p)
          // Stop the moment we see a terminal status — no point polling more.
          if (p.status === 'completed' || p.status === 'failed') {
            setPolling(false)
            return
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load status')
      }
      if (attempts >= MAX) {
        setPolling(false)
        return
      }
      setTimeout(tick, 1000)
    }
    tick()
    return () => { cancelled = true }
  }, [paymentId])

  const status = payment?.status

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="pt-24 pb-24 px-6 max-w-2xl mx-auto">
        <div className="bg-surface-container-lowest p-8 rounded-2xl text-center shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
          {/* Pending — webhook hasn't landed yet */}
          {polling && status !== 'completed' && status !== 'failed' && (
            <>
              <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
              <h1 className="text-2xl font-black text-on-surface mb-2">
                {t('checkoutResult.confirmingTitle')}
              </h1>
              <p className="text-on-surface-variant">
                {t('checkoutResult.confirmingBody')}
              </p>
            </>
          )}

          {/* Success */}
          {status === 'completed' && (
            <>
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h1 className="text-2xl font-black text-on-surface mb-2">
                {t('checkoutResult.successTitle')}
              </h1>
              <p className="text-on-surface-variant mb-6">
                {t('checkoutResult.successBody')}
              </p>
              <Link
                href="/profile?tab=in_progress"
                className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-container transition-colors"
              >
                {t('checkoutResult.goToOrders')}
              </Link>
            </>
          )}

          {/* Failure */}
          {status === 'failed' && (
            <>
              <AlertCircle className="w-16 h-16 text-error mx-auto mb-4" />
              <h1 className="text-2xl font-black text-on-surface mb-2">
                {t('checkoutResult.failedTitle')}
              </h1>
              <p className="text-on-surface-variant mb-2">
                {t('checkoutResult.failedBody')}
              </p>
              {payment?.failureReason && (
                <p className="text-sm text-error mb-6">{payment.failureReason}</p>
              )}
              <Link
                href="/profile?tab=in_progress"
                className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-container transition-colors"
              >
                {t('checkoutResult.retry')}
              </Link>
            </>
          )}

          {/* Polling timed out without a terminal status */}
          {!polling && status !== 'completed' && status !== 'failed' && (
            <>
              <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
              <h1 className="text-2xl font-black text-on-surface mb-2">
                {t('checkoutResult.unknownTitle')}
              </h1>
              <p className="text-on-surface-variant mb-6">
                {t('checkoutResult.unknownBody')}
              </p>
              <Link
                href="/profile?tab=in_progress"
                className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-container transition-colors"
              >
                {t('checkoutResult.goToOrders')}
              </Link>
            </>
          )}

          {error && (
            <p className="mt-4 text-sm text-error">{error}</p>
          )}
        </div>
      </main>
    </div>
  )
}

export default function CheckoutResultPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background min-h-screen">
          <Navbar />
          <main className="pt-24 pb-24 px-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-center py-40 text-on-surface-variant">
              <Loader2 className="w-6 h-6 animate-spin mx-2" />
              ...
            </div>
          </main>
        </div>
      }
    >
      <CheckoutResultContent />
    </Suspense>
  )
}
