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
import { MessageSquare, X, ChevronRight, Maximize2, Bot, Sparkles } from 'lucide-react'
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
        className="fixed bottom-20 start-4 sm:bottom-6 sm:start-6 z-40 w-14 h-14 bg-primary hover:bg-primary-container text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center transition-all hover:scale-105"
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
    <div className="fixed z-40 inset-x-3 bottom-20 h-[calc(100vh-6rem)] max-h-[32rem] sm:inset-x-auto sm:bottom-6 sm:start-6 sm:w-96 sm:h-[32rem] sm:max-h-[calc(100vh-3rem)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/15 flex flex-col overflow-hidden">
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
              {/* AI conversations get a fixed label + status, never a
                  online-dot or human name (the AI doesn't have one). */}
              {activeConv.type === 'ai' ? (
                <>
                  <p className="font-bold text-sm truncate flex items-center justify-end gap-1">
                    المساعد الذكي
                    <Sparkles className="w-3 h-3 opacity-80" />
                  </p>
                  <p className="text-[11px] opacity-80">يجيب على أسئلتك حول المنصة</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sm truncate">
                    {activeConv.otherUser?.firstName} {activeConv.otherUser?.lastName}
                  </p>
                  <p className="text-[11px] opacity-80">
                    {activeConv.otherUser && onlineUserIds.has(String(activeConv.otherUser._id))
                      ? 'متصل الآن'
                      : 'غير متصل'}
                  </p>
                </>
              )}
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
                const isAi = conv.type === 'ai'
                const isOnline = !isAi && conv.otherUser && onlineUserIds.has(String(conv.otherUser._id))
                const displayName = isAi
                  ? 'المساعد الذكي'
                  : conv.otherUser
                    ? `${conv.otherUser.firstName} ${conv.otherUser.lastName}`
                    : 'مستخدم'
                return (
                  <li key={conv._id}>
                    <button
                      onClick={() => setActiveConvId(conv._id)}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-surface-container-low/60 transition-colors text-right ${isAi ? 'bg-primary/5' : ''}`}
                    >
                      <div className="relative shrink-0">
                        {isAi ? (
                          <div className="w-10 h-10 rounded-full bg-linear-to-br from-primary to-blue-500 text-white flex items-center justify-center">
                            <Bot className="w-5 h-5" />
                          </div>
                        ) : conv.otherUser?.profileImage ? (
                          <img src={conv.otherUser.profileImage} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                            {conv.otherUser?.firstName?.charAt(0) || '?'}
                          </div>
                        )}
                        {!isAi && (
                          <span className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full border-2 border-surface-container-lowest ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[10px] text-on-surface-variant shrink-0">
                            {isAi ? 'مثبت' : (conv.lastMessageAt ? formatTime(conv.lastMessageAt) : '')}
                          </span>
                          <p className="font-semibold text-sm text-on-surface truncate flex items-center gap-1 justify-end">
                            {displayName}
                            {isAi && <Sparkles className="w-3 h-3 text-primary shrink-0" />}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-white text-[9px] font-bold rounded-full min-w-[18px] h-4 px-1 flex items-center justify-center shrink-0">
                              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                            </span>
                          )}
                          <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                            {conv.lastMessage || (isAi ? 'اسألني عن أي شيء يخص المنصة' : 'ابدأ المحادثة')}
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
