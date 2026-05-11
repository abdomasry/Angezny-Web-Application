'use client'

// /messages/[id] — full-page conversation view.
// Delegates the actual message list + composer to MessageThread so the
// same logic is reused by the ChatWidget.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import Navbar from '@/components/Navbar'
import MessageThread from '@/components/MessageThread'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import type { ChatConversation } from '@/lib/types'

export default function ConversationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const conversationId = params.id

  const { isLoggedIn, isLoading } = useAuth()
  const { conversations } = useChat()

  // Try to find the conversation from the cached list so the header renders
  // instantly. If not found, we still render MessageThread — it'll fetch
  // the messages and show a spinner until they arrive.
  const [conversation, setConversation] = useState<ChatConversation | null>(null)

  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.push('/signin')
  }, [isLoading, isLoggedIn, router])

  useEffect(() => {
    const match = conversations.find(c => c._id === conversationId)
    if (match) setConversation(match)
  }, [conversations, conversationId])

  if (!conversationId) return null

  return (
    <div className="bg-background min-h-screen flex flex-col">
      <Navbar />

      {/* Full-height chat area starts below the sticky navbar. pt-20 = nav height. */}
      <div className="pt-20 flex-1 flex flex-col">
        <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col">
          {/* Back link to inbox — useful on mobile where the sidebar isn't visible */}
          <div className="px-4 py-2">
            <Link
              href="/messages"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ChevronRight className="w-4 h-4" />
              كل الرسائل
            </Link>
          </div>

          {/* The thread takes the remaining height. h-0 + flex-1 is the standard
              trick to make a flex child actually constrain its children's overflow. */}
          <div className="flex-1 min-h-0 bg-surface-container-lowest md:rounded-t-2xl overflow-hidden shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)]">
            <MessageThread
              conversationId={conversationId}
              otherUser={conversation?.otherUser || null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
