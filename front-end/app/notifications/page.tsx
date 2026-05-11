'use client'

// =============================================================================
// NOTIFICATIONS PAGE — /notifications
// =============================================================================
// Full-screen view of the user's notifications. The Navbar bell already shows
// the latest 10 in a small dropdown — this page shows the same list grouped by
// day with breathing room and a "mark all as read" action prominent at the
// top. Notifications carry a 24h TTL on the backend, so this is essentially
// "everything new in the last day" — older entries auto-delete in MongoDB.
//
// Data source:
//   We read directly from `useChat()` instead of fetching again, because
//   ChatProvider already seeded the list at login and keeps it live via the
//   `notification:new` socket event. No second round-trip needed.
//
// Auth:
//   Logged-out users get redirected to /signin (client-side, matching the
//   pattern used by /profile and /dashboard — no app-wide middleware yet).
// =============================================================================

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, BellRing, CheckCheck, ChevronLeft } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { wrap } from 'module'

// Notification shape returned by /api/auth/notifications. Kept inline here
// because ChatContext intentionally types this as `any[]` (notifications were
// added later and never had a shared type carved out). We don't pollute
// lib/types.ts for one consumer.
interface Notification {
  _id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  link: string | null
  createdAt: string
}

// Pretty date-bucket label. Today → "اليوم", yesterday → "أمس", everything
// else → the localized date ("27 أبريل"). Keeps the page scannable when the
// list spans multiple days.
function bucketLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()

  // Compare on calendar-day boundaries, ignoring time-of-day.
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const ms = startOfDay(now).getTime() - startOfDay(d).getTime()
  const days = Math.round(ms / (1000 * 60 * 60 * 24))

  if (days <= 0) return 'اليوم'
  if (days === 1) return 'أمس'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })
}

// Time-of-day for a single notification ("الساعة 9:42 م" / "9:42 AM").
function timeLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Color of the small leading dot for each notification, by type.
const typeDotClass: Record<Notification['type'], string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

export default function NotificationsPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const { notifications, unreadNotificationCount, markNotificationsRead } = useChat()

  // Auth gate. Wait for auth to finish loading so we don't redirect during
  // the brief "session restoring" window after a refresh.
  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.replace('/signin?redirect=/notifications')
    }
  }, [isLoading, isLoggedIn, router])

  // Group by day-bucket label so we can render section headers. useMemo
  // because notifications can update live via socket; we don't want to
  // re-bucket on every unrelated render.
  const grouped = useMemo(() => {
    const list = notifications as Notification[]
    const map = new Map<string, Notification[]>()
    for (const n of list) {
      const key = bucketLabel(n.createdAt)
      const existing = map.get(key)
      if (existing) existing.push(n)
      else map.set(key, [n])
    }
    return Array.from(map.entries())
  }, [notifications])

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-sm text-on-surface-variant mb-4">
          <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
          <span className="mx-2">/</span>
          <span className="text-on-surface">الإشعارات</span>
        </nav>

        {/* Header: title + unread chip + mark-all-read button */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">الإشعارات</h1>
            {unreadNotificationCount > 0 && (
              <span className="bg-primary-container/40 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                {unreadNotificationCount} جديد
              </span>
            )}
          </div>
          {unreadNotificationCount > 0 && (
            <button
              type="button"
              onClick={markNotificationsRead}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <CheckCheck className="w-4 h-4" />
              تعيين الكل كمقروء
            </button>
          )}
        </div>

        {/* Empty state — same icon as the Navbar dropdown for consistency */}
        {notifications.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl py-20 text-center">
            <BellRing className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-on-surface-variant">لا توجد إشعارات بعد</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              ستظهر هنا تحديثات الطلبات والرسائل وكل ما يخصك.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([label, items]) => (
              <section key={label}>
                {/* Day section header */}
                <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2 px-1">
                  {label}
                </h2>

                <div className="bg-surface-container-lowest rounded-2xl overflow-hidden">
                  {items.map((notif) => {
                    // Card body — wrapped in a Link only if the notification
                    // points somewhere (e.g. an order page, a chat thread).
                    // Otherwise it's an informational card with no click target.


                    // to just break line and overflow the msg
                    const formattedMessage = notif.message.replace(/"(.*?)"/,'"$1\n')

                    const cardClasses = [
                      'flex items-start gap-3 px-4 py-4 border-b border-outline-variant/10 last:border-0 transition-colors',
                      !notif.isRead ? 'bg-primary/5' : '',
                      notif.link ? 'hover:bg-surface-container-low cursor-pointer' : '',
                    ].filter(Boolean).join(' ')

                    const body = (
                      <>
                        {/* Type dot — vertically aligned to the title baseline */}
                        <div
                          className={`w-2 h-2 rounded-full mt-2 shrink-0 ${typeDotClass[notif.type] ?? 'bg-blue-500'}`}
                          aria-hidden
                        />

                        <div className="flex-1 min-w-0 text-right">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-bold text-on-surface truncate">
                              {notif.title}
                            </p>
                            <span className="text-xs text-on-surface-variant/70 shrink-0">
                              {timeLabel(notif.createdAt)}
                            </span>
                          </div>
                          <span className="text-sm text-on-surface-variant mt-0.5 leading-6" style={{ overflowWrap: "break-word", display: "block", whiteSpace: "pre-line" }}>
                            {formattedMessage}
                          </span>
                          {/* Visual cue when there's a target — matches the
                              breadcrumb-arrow style used elsewhere. */}
                          {notif.link && (
                            <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-2">
                              فتح
                              <ChevronLeft className="w-3 h-3" />
                            </span>
                          )}
                        </div>

                        {/* Unread indicator — small dot on the leading edge */}
                        {!notif.isRead && (
                          <span
                            className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0"
                            aria-label="غير مقروء"
                          />
                        )}
                      </>
                    )

                    return notif.link ? (
                      <Link key={notif._id} href={notif.link} className={cardClasses}>
                        {body}
                      </Link>
                    ) : (
                      <div key={notif._id} className={cardClasses}>
                        {body}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}

            {/* Footer note — explains the 24h TTL so users don't think
                older notifications are missing. */}
            <p className="text-xs text-on-surface-variant/60 text-center pt-2">
              تُحفظ الإشعارات لمدة 24 ساعة ثم تُحذف تلقائياً.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
