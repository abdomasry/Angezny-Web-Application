'use client'

// ChatContext
// ============================================================
// Single source of truth for chat state on the client:
//   - the Socket.IO connection (opens on login, closes on logout)
//   - the list of conversations
//   - which users are currently online
//   - total unread count (feeds the Navbar badge)
//   - per-conversation message streams (components subscribe via onMessage)
//
// Design note: we do NOT store every message in context. A global map of
// "all messages ever loaded" would leak memory on long sessions. Instead
// the open /messages/[id] page manages its own message list and subscribes
// to new messages via the onMessage helper.
// ============================================================

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import { useAuth } from './auth-context'
import { getSocket, disconnectSocket } from './socket'
import { api } from './api'
import type { ChatConversation, ChatMessage } from './types'

// ─── AI streaming types ────────────────────────────────────────
// Events emitted by the backend AI pipeline (see chat.socket.js).
// "ai:stream:start"  → first token is on its way; show a placeholder bubble
// "ai:stream"        → append `chunk` to the streaming text
// "ai:stream:end"    → done; clear the buffer (the canonical chat:message
//                       for this reply has already been broadcast)
// "ai:error"         → rate limit / upstream / not configured. UI shows a toast.
export interface AiErrorEvent {
  conversationId: string
  code: 'rate_limited' | 'upstream' | 'not_configured'
  message: string
  scope?: 'hour' | 'day'
  retryAfterSec?: number
}

// ─── Context shape ─────────────────────────────────────────────
interface ChatContextValue {
  // Connection state (useful for showing "reconnecting..." banners later)
  connected: boolean

  // Data
  conversations: ChatConversation[]
  onlineUserIds: Set<string>
  totalUnread: number  // sum of unreadCount across conversations

  // Notifications (piggy-backs on same socket for live bell updates)
  notifications: any[]
  unreadNotificationCount: number
  markNotificationsRead: () => Promise<void>

  // Imperative helpers
  sendMessage: (
    conversationId: string,
    text: string,
    messageType?: 'text' | 'image' | 'file',
    extras?: { fileName?: string; fileSize?: number }
  ) => Promise<ChatMessage | null>
  markRead: (conversationId: string) => void
  setTyping: (conversationId: string, isTyping: boolean) => void
  refreshConversations: () => Promise<void>
  findOrCreateConversation: (userId: string, serviceId?: string) => Promise<ChatConversation | null>

  // Subscription helpers (return unsubscribe)
  onMessage: (handler: (msg: ChatMessage) => void) => () => void
  onTyping: (handler: (data: { conversationId: string, userId: string, isTyping: boolean }) => void) => () => void
  onRead: (handler: (data: { conversationId: string, readerId: string }) => void) => () => void

  // AI streaming — per-conversation accumulating text the UI renders as
  // a "typing" bubble until the canonical chat:message replaces it.
  getAiStreamingText: (conversationId: string) => string
  // Returns a key that changes whenever ANY AI stream advances. Subscribed
  // components useEffect on it to re-render without us having to put the
  // whole streaming map in React state (which would churn the entire tree
  // on every token).
  aiStreamTick: number
  onAiError: (handler: (e: AiErrorEvent) => void) => () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isLoggedIn } = useAuth()

  const [connected, setConnected] = useState(false)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [notifications, setNotifications] = useState<any[]>([])

  // Subscription registries for "open conversation" components. Using refs
  // instead of state because they change frequently and don't need to trigger
  // re-renders of the whole tree.
  const messageHandlersRef = useRef<Set<(m: ChatMessage) => void>>(new Set())
  const typingHandlersRef = useRef<Set<(d: any) => void>>(new Set())
  const readHandlersRef = useRef<Set<(d: any) => void>>(new Set())
  const aiErrorHandlersRef = useRef<Set<(e: AiErrorEvent) => void>>(new Set())
  // Per-conversation accumulating text from ai:stream chunks. Stored as a
  // ref (not state) because every token would otherwise re-render every
  // consumer of useChat() — we use `aiStreamTick` below as a lightweight
  // signal for thread views to re-read the buffer.
  const aiStreamingRef = useRef<Map<string, string>>(new Map())
  const [aiStreamTick, setAiStreamTick] = useState(0)
  const socketRef = useRef<Socket | null>(null)

  // ─── Seed + connect when logged in ──────────────────────────
  useEffect(() => {
    if (!isLoggedIn) {
      // On logout: tear down
      disconnectSocket()
      socketRef.current = null
      setConnected(false)
      setConversations([])
      setOnlineUserIds(new Set())
      setNotifications([])
      return
    }

    // Seed state from REST before the socket is even ready.
    // These run in parallel; failures are logged, not fatal.
    Promise.all([
      api.getWithAuth('/chat/conversations').catch(() => ({ conversations: [] })),
      api.getWithAuth('/auth/notifications').catch(() => ({ notifications: [] })),
    ]).then(([convRes, notifRes]) => {
      setConversations(convRes.conversations || [])
      setNotifications(notifRes.notifications || [])
    })

    // Open the socket. getSocket() is a lazy singleton — safe to call here.
    const socket = getSocket()
    if (!socket) return
    socketRef.current = socket

    // ─── Socket event wiring ─────────────────────────────────
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    // Initial snapshot of who's online, sent by the server on connect.
    const onPresenceSnapshot = (data: { onlineUserIds: string[] }) => {
      setOnlineUserIds(new Set(data.onlineUserIds))
    }

    // Incremental presence updates as people come and go.
    const onPresenceUpdate = (data: { userId: string, online: boolean }) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev)
        if (data.online) next.add(data.userId)
        else next.delete(data.userId)
        return next
      })
    }

    // A new message arrived (either from me or someone else).
    const onMessage = (msg: ChatMessage) => {
      // Update the conversation row: bump lastMessage + lastMessageAt.
      // If the incoming message is from the OTHER side (not me), also bump unread.
      setConversations(prev => {
        const meId = user?.id
        const updated = prev.map(conv => {
          if (conv._id !== msg.conversationId) return conv
          const isIncoming = String(msg.senderId) !== String(meId)
          // Match the server-side snapshot format so inbox previews
          // look identical whether they come from the list endpoint
          // or from a live onMessage update.
          const preview = msg.messageType === 'image'
            ? '📷 صورة'
            : msg.messageType === 'file'
              ? `📎 ${msg.fileName || 'ملف'}`
              : msg.message.slice(0, 120)
          return {
            ...conv,
            lastMessage: preview,
            lastMessageAt: msg.createdAt,
            unreadCount: isIncoming ? conv.unreadCount + 1 : conv.unreadCount,
          }
        })
        // Move the touched conversation to the top of the list.
        const idx = updated.findIndex(c => c._id === msg.conversationId)
        if (idx > 0) {
          const [touched] = updated.splice(idx, 1)
          updated.unshift(touched)
        }
        return updated
      })

      // Fan out to any subscribed conversation views.
      messageHandlersRef.current.forEach(h => h(msg))
    }

    // Someone read my messages — fan out to handlers so the ✓✓ can render.
    const onRead = (data: { conversationId: string, readerId: string }) => {
      readHandlersRef.current.forEach(h => h(data))
    }

    // Typing indicator — fan out.
    const onTyping = (data: any) => {
      typingHandlersRef.current.forEach(h => h(data))
    }

    // A new bell-notification was pushed — prepend to the list.
    const onNotificationNew = (notif: any) => {
      setNotifications(prev => [notif, ...prev])
    }

    // ─── AI streaming events ──────────────────────────────────
    // start  → seed an empty buffer so the open thread can render a
    //          "typing" bubble even before the first token lands.
    // chunk  → append + bump the tick so subscribers re-read the buffer.
    // end    → wipe the buffer. The canonical chat:message has already
    //          been broadcast and inserted via onMessage, so removing the
    //          streaming entry hands rendering back to the regular flow.
    // error  → fan out to subscribed thread components (toast UI).
    const onAiStreamStart = ({ conversationId }: { conversationId: string }) => {
      aiStreamingRef.current.set(conversationId, '')
      setAiStreamTick(t => t + 1)
    }
    const onAiStream = ({ conversationId, chunk }: { conversationId: string, chunk: string }) => {
      const prev = aiStreamingRef.current.get(conversationId) || ''
      aiStreamingRef.current.set(conversationId, prev + chunk)
      setAiStreamTick(t => t + 1)
    }
    const onAiStreamEnd = ({ conversationId }: { conversationId: string }) => {
      aiStreamingRef.current.delete(conversationId)
      setAiStreamTick(t => t + 1)
    }
    const onAiError = (e: AiErrorEvent) => {
      // Always clear the streaming buffer so the UI doesn't leave a stale
      // "typing..." bubble after a failed call.
      aiStreamingRef.current.delete(e.conversationId)
      setAiStreamTick(t => t + 1)
      aiErrorHandlersRef.current.forEach(h => h(e))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('presence:snapshot', onPresenceSnapshot)
    socket.on('presence:update', onPresenceUpdate)
    socket.on('chat:message', onMessage)
    socket.on('chat:read', onRead)
    socket.on('chat:typing', onTyping)
    socket.on('notification:new', onNotificationNew)
    socket.on('ai:stream:start', onAiStreamStart)
    socket.on('ai:stream', onAiStream)
    socket.on('ai:stream:end', onAiStreamEnd)
    socket.on('ai:error', onAiError)

    // If the socket was already connected (singleton reuse), set connected:true immediately.
    if (socket.connected) setConnected(true)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('presence:snapshot', onPresenceSnapshot)
      socket.off('presence:update', onPresenceUpdate)
      socket.off('chat:message', onMessage)
      socket.off('chat:read', onRead)
      socket.off('chat:typing', onTyping)
      socket.off('notification:new', onNotificationNew)
      socket.off('ai:stream:start', onAiStreamStart)
      socket.off('ai:stream', onAiStream)
      socket.off('ai:stream:end', onAiStreamEnd)
      socket.off('ai:error', onAiError)
    }
  }, [isLoggedIn, user?.id])

  // ─── Imperative helpers ─────────────────────────────────────

  const sendMessage = useCallback(async (
    conversationId: string,
    text: string,
    messageType: 'text' | 'image' | 'file' = 'text',
    extras?: { fileName?: string; fileSize?: number },
  ): Promise<ChatMessage | null> => {
    const socket = socketRef.current
    if (!socket) return null
    return new Promise(resolve => {
      socket.emit(
        'chat:send',
        {
          conversationId,
          message: text,
          messageType,
          ...(extras?.fileName && { fileName: extras.fileName }),
          ...(extras?.fileSize != null && { fileSize: extras.fileSize }),
        },
        (ack: any) => {
          resolve(ack?.ok ? ack.message : null)
        },
      )
    })
  }, [])

  const markRead = useCallback((conversationId: string) => {
    socketRef.current?.emit('chat:read', { conversationId })
    // Optimistically zero the badge locally so the UI is snappy.
    setConversations(prev => prev.map(c =>
      c._id === conversationId ? { ...c, unreadCount: 0 } : c
    ))
  }, [])

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit('chat:typing', { conversationId, isTyping })
  }, [])

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api.getWithAuth('/chat/conversations')
      setConversations(data.conversations || [])
    } catch (err) {
      console.error('refreshConversations failed:', err)
    }
  }, [])

  const findOrCreateConversation = useCallback(async (userId: string, serviceId?: string): Promise<ChatConversation | null> => {
    try {
      const data = await api.postWithAuth('/chat/conversations', {
        userId,
        ...(serviceId ? { serviceId } : {}),
      })
      const conv = data.conversation
      // Insert at the top if not already present.
      setConversations(prev => {
        if (prev.some(c => c._id === conv._id)) return prev
        return [conv, ...prev]
      })
      return conv
    } catch (err) {
      console.error('findOrCreateConversation failed:', err)
      return null
    }
  }, [])

  const markNotificationsRead = useCallback(async () => {
    try {
      await api.putWithAuth('/auth/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    } catch (err) {
      console.error('markNotificationsRead failed:', err)
    }
  }, [])

  // Subscription helpers — return an unsubscribe function.
  const onMessage = useCallback((handler: (msg: ChatMessage) => void) => {
    messageHandlersRef.current.add(handler)
    return () => { messageHandlersRef.current.delete(handler) }
  }, [])
  const onTyping = useCallback((handler: (data: any) => void) => {
    typingHandlersRef.current.add(handler)
    return () => { typingHandlersRef.current.delete(handler) }
  }, [])
  const onRead = useCallback((handler: (data: any) => void) => {
    readHandlersRef.current.add(handler)
    return () => { readHandlersRef.current.delete(handler) }
  }, [])

  // AI streaming accessors. getAiStreamingText reads the ref-backed buffer
  // directly — consumers should also depend on `aiStreamTick` so React
  // re-renders them as tokens arrive.
  const getAiStreamingText = useCallback((conversationId: string) => {
    return aiStreamingRef.current.get(conversationId) || ''
  }, [])
  const onAiError = useCallback((handler: (e: AiErrorEvent) => void) => {
    aiErrorHandlersRef.current.add(handler)
    return () => { aiErrorHandlersRef.current.delete(handler) }
  }, [])

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  const unreadNotificationCount = notifications.filter(n => !n.isRead).length

  return (
    <ChatContext.Provider value={{
      connected,
      conversations,
      onlineUserIds,
      totalUnread,
      notifications,
      unreadNotificationCount,
      markNotificationsRead,
      sendMessage,
      markRead,
      setTyping,
      refreshConversations,
      findOrCreateConversation,
      onMessage,
      onTyping,
      onRead,
      getAiStreamingText,
      aiStreamTick,
      onAiError,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}
