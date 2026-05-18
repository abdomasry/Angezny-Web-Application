'use client'

// /messages — the chat inbox.
// Lists all conversations, newest activity first. Click one to open
// /messages/<id>. Presence dots update live via ChatContext.

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquare, Bot, Sparkles, Pin } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'

export default function MessagesInboxPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const { conversations, onlineUserIds, refreshConversations } = useChat()

  // Kick unauthenticated users to the sign-in page — chat is logged-in-only.
  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.push('/signin')
  }, [isLoading, isLoggedIn, router])

  // Inbox is the entry point for messaging; refresh on mount in case a
  // conversation was created elsewhere (e.g. from the worker profile button)
  // while the context was already initialized on a different page.
  useEffect(() => {
    if (isLoggedIn) refreshConversations()
  }, [isLoggedIn, refreshConversations])

  const formatTime = (iso: string) => {
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    if (diffHours < 24) {
      return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-4xl mx-auto">
        <header className="mb-8 text-right">
          <h1 className="text-3xl md:text-4xl font-black text-on-surface mb-2">الرسائل</h1>
          <p className="text-on-surface-variant text-sm">
            محادثاتك مع مزودي الخدمات والعملاء
          </p>
        </header>

        <div className="bg-surface-container-lowest rounded-2xl shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)] overflow-hidden">
          {conversations.length === 0 ? (
            <div className="py-20 text-center">
              <MessageSquare className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
              <p className="text-on-surface-variant text-lg">لا توجد محادثات بعد</p>
              <p className="text-on-surface-variant text-sm mt-1">
                ابدأ محادثة بالضغط على "أرسل طلباً" من صفحة أي مزود خدمة
              </p>
              <Link href="/services" className="inline-block mt-4 text-primary font-semibold hover:underline">
                تصفح الخدمات
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {conversations.map(conv => {
                const isAi = conv.type === 'ai'
                const isOnline = !isAi && conv.otherUser && onlineUserIds.has(String(conv.otherUser._id))
                const name = isAi
                  ? 'المساعد الذكي'
                  : conv.otherUser
                    ? `${conv.otherUser.firstName} ${conv.otherUser.lastName}`
                    : 'مستخدم محذوف'
                return (
                  <li key={conv._id}>
                    <Link
                      href={`/messages/${conv._id}`}
                      className={`flex items-center gap-4 p-4 hover:bg-surface-container-low/50 transition-colors ${isAi ? 'bg-primary/5' : ''}`}
                    >
                      {/* Avatar — robot icon for AI, photo/initial for humans.
                          AI row also skips the online/offline dot since the
                          assistant is always "online". */}
                      <div className="relative shrink-0">
                        {isAi ? (
                          <div className="w-12 h-12 rounded-full bg-linear-to-br from-primary to-blue-500 text-white flex items-center justify-center shadow-sm">
                            <Bot className="w-6 h-6" />
                          </div>
                        ) : conv.otherUser?.profileImage ? (
                          <img
                            src={conv.otherUser.profileImage}
                            alt=""
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
                            {conv.otherUser?.firstName?.charAt(0) || '?'}
                          </div>
                        )}
                        {!isAi && (
                          <span className={`absolute bottom-0 end-0 w-3 h-3 rounded-full border-2 border-surface-container-lowest ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                        )}
                      </div>

                      {/* Name + snippet (right-aligned, RTL).
                          AI rows show a pin icon + "مثبت" instead of a
                          timestamp to make the always-on-top placement
                          feel intentional rather than buggy. */}
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          {isAi ? (
                            <span className="text-[11px] text-primary shrink-0 flex items-center gap-0.5">
                              <Pin className="w-3 h-3" />
                              مثبت
                            </span>
                          ) : (
                            <span className="text-xs text-on-surface-variant shrink-0">
                              {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}
                            </span>
                          )}
                          <h3 className="font-bold text-on-surface truncate flex items-center gap-1.5 justify-end">
                            {name}
                            {isAi && <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </h3>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shrink-0">
                              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                            </span>
                          )}
                          <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                            {conv.lastMessage || (isAi ? 'اسألني عن أي شيء يخص المنصة' : 'ابدأ المحادثة')}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
