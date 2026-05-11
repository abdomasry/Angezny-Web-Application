'use client'

// ChatWidget — floating chat bubble mounted globally in app/layout.tsx.
// Only renders when the user is logged in AND they're not already on /messages
// (no point showing the widget on the page that IS the chat).
//
// Three visual states:
//   1. Collapsed:  a single round button with unread badge
//   2. List:       expanded panel showing conversation list
//   3. Thread:     expanded panel showing one conversation's thread
//
// The thread view reuses the same MessageThread component as /messages/[id],
// just in compact mode (no big header, tighter padding).

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { MessageSquare, X, ChevronRight, Maximize2 } from 'lucide-react'
import MessageThread from '@/components/MessageThread'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'

export default function ChatWidget() {
  const pathname = usePathname()
  const { isLoggedIn, isLoading } = useAuth()
  const { conversations, totalUnread, onlineUserIds } = useChat()

  const [open, setOpen] = useState(false)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  // Hide the widget when not logged in, while auth is still resolving, or
  // when the user is already on a /messages page.
  if (isLoading || !isLoggedIn) return null
  if (pathname?.startsWith('/messages')) return null
  // Also hide in admin dashboard — admins don't chat with customers/workers.
  if (pathname?.startsWith('/admin')) return null

  const activeConv = activeConvId ? conversations.find(c => c._id === activeConvId) : null
  const formatTime = (iso: string) => {
    const date = new Date(iso)
    const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60)
    return diffHours < 24
      ? date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
  }

  // ─── Collapsed: just the bubble ───────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 start-6 z-40 w-14 h-14 bg-primary hover:bg-primary-container text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center transition-all hover:scale-105"
        aria-label="فتح الرسائل"
      >
        <MessageSquare className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -end-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center border-2 border-background">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    )
  }

  // ─── Expanded panel ───────────────────────────────────────
  return (
    <div className="fixed bottom-6 start-6 z-40 w-96 h-[32rem] max-h-[calc(100vh-3rem)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/15 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="bg-primary text-white p-3 flex items-center justify-between gap-2">
        {activeConv ? (
          <>
            <button
              onClick={() => setActiveConvId(null)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
              aria-label="رجوع"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0 text-right">
              <p className="font-bold text-sm truncate">
                {activeConv.otherUser?.firstName} {activeConv.otherUser?.lastName}
              </p>
              <p className="text-[11px] opacity-80">
                {activeConv.otherUser && onlineUserIds.has(String(activeConv.otherUser._id))
                  ? 'متصل الآن'
                  : 'غير متصل'}
              </p>
            </div>
            <Link
              href={`/messages/${activeConv._id}`}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
              aria-label="فتح في الصفحة الكاملة"
              title="فتح في الصفحة الكاملة"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <>
            <button
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold">الرسائل</h2>
            <Link
              href="/messages"
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
              aria-label="فتح صفحة الرسائل"
              title="الصفحة الكاملة"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>
          </>
        )}
      </div>

      {/* Panel body */}
      {activeConv ? (
        <div className="flex-1 min-h-0">
          <MessageThread
            conversationId={activeConv._id}
            otherUser={activeConv.otherUser}
            compact
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="py-10 text-center px-4">
              <MessageSquare className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant mb-1">لا توجد محادثات بعد</p>
              <p className="text-xs text-on-surface-variant/70">
                ابدأ بزيارة صفحة أي مزود خدمة
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {conversations.map(conv => {
                const isOnline = conv.otherUser && onlineUserIds.has(String(conv.otherUser._id))
                return (
                  <li key={conv._id}>
                    <button
                      onClick={() => setActiveConvId(conv._id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-surface-container-low/60 transition-colors text-right"
                    >
                      <div className="relative shrink-0">
                        {conv.otherUser?.profileImage ? (
                          <img src={conv.otherUser.profileImage} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                            {conv.otherUser?.firstName?.charAt(0) || '?'}
                          </div>
                        )}
                        <span className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full border-2 border-surface-container-lowest ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[10px] text-on-surface-variant shrink-0">
                            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}
                          </span>
                          <p className="font-semibold text-sm text-on-surface truncate">
                            {conv.otherUser ? `${conv.otherUser.firstName} ${conv.otherUser.lastName}` : 'مستخدم'}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-white text-[9px] font-bold rounded-full min-w-[18px] h-4 px-1 flex items-center justify-center shrink-0">
                              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                            </span>
                          )}
                          <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                            {conv.lastMessage || 'ابدأ المحادثة'}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
