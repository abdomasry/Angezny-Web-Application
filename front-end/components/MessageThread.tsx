'use client'

// MessageThread — shared between /messages/[id] full page and the ChatWidget.
// Responsible for:
//   - Loading the initial page of history
//   - Streaming new messages from ChatContext.onMessage
//   - Rendering the scroll area + composer (text + image)
//   - Firing chat:typing while the user types (debounced stop at 2s)
//   - Emitting chat:read when opened (via markRead in ChatContext)

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Send, Image as ImageIcon, Paperclip, Check, CheckCheck, FileText, Download, Briefcase, X as XIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { useChat } from '@/lib/chat-context'
import { useAuth } from '@/lib/auth-context'
import { uploadChatFile } from '@/lib/upload'
import type { ChatMessage, ChatParticipant, WorkerService } from '@/lib/types'

// Split a text message into plain-text + URL segments so URLs can be rendered
// as <a> tags (clickable) while the rest stays as regular text. Applied in the
// bubble renderer below.
//
// Regex note: we intentionally stop at whitespace so Arabic punctuation (،؟ .)
// attached to a URL doesn't get swallowed. http(s) only — we don't autolink
// bare domains because false positives outnumber wins in chat context.
const URL_REGEX = /(https?:\/\/[^\s]+)/g
type TextSegment = { kind: 'text' | 'link'; value: string }
function splitByUrls(message: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  for (const match of message.matchAll(URL_REGEX)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({ kind: 'text', value: message.slice(lastIndex, start) })
    }
    segments.push({ kind: 'link', value: match[0] })
    lastIndex = start + match[0].length
  }
  if (lastIndex < message.length) {
    segments.push({ kind: 'text', value: message.slice(lastIndex) })
  }
  return segments
}

// Build the friendly inquiry text that gets auto-sent when the user arrives
// via the "اسأل" button on /services or /worker/:id. The message includes:
//   - a greeting line with a waving-hand emoji
//   - the service name on its own line with a wrench emoji
//   - the formatted price with a money-bag emoji
//   - a deep link back to the service row on the worker's profile
//     (anchor = #service-<id>, handled by the worker profile page to scroll
//      + briefly highlight that row)
//
// Composed as a plain text message because the chat only persists three
// messageType values: text/image/file. A dedicated "service card" type would
// need schema + renderer changes that aren't justified for this feature.
function buildServiceInquiryText(service: WorkerService, workerProfileId?: string) {
  const pricePart = service.typeofService === 'range' && service.priceRange
    ? `${service.priceRange.min} - ${service.priceRange.max} ج.م`
    : service.typeofService === 'hourly'
      ? `${service.price} ج.م / الساعة`
      : `${service.price} ج.م`

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const deepLink = workerProfileId && origin
    ? `${origin}/worker/${workerProfileId}#service-${service._id}`
    : ''

  const lines = [
    '👋 مرحباً، أودّ الاستفسار عن هذه الخدمة:',
    '',
    `🛠️ ${service.name}`,
    `💰 ${pricePart}`,
  ]
  if (deepLink) {
    lines.push('')
    lines.push(`🔗 ${deepLink}`)
  }
  return lines.join('\n')
}

// Formats a byte count like 2415616 → "2.3 MB". Used in file-message cards.
function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Maps a file extension to a short label + a Tailwind background class.
// Used to render a colored badge in file-attachment cards (like Gmail's
// attachment pills) so a PDF is instantly recognizable as a PDF vs. a Word
// doc. Falls back to a neutral primary teal for anything unknown.
//
// Returns a stable object shape so the renderer can always read `.label`,
// `.bg`, `.text` without null-checking.
function getFileBadge(fileName: string | null | undefined) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || ''
  const map: Record<string, { label: string; bg: string; text: string }> = {
    pdf:  { label: 'PDF',  bg: 'bg-red-500',     text: 'text-white' },
    doc:  { label: 'DOC',  bg: 'bg-blue-500',    text: 'text-white' },
    docx: { label: 'DOC',  bg: 'bg-blue-500',    text: 'text-white' },
    xls:  { label: 'XLS',  bg: 'bg-green-600',   text: 'text-white' },
    xlsx: { label: 'XLS',  bg: 'bg-green-600',   text: 'text-white' },
    ppt:  { label: 'PPT',  bg: 'bg-orange-500',  text: 'text-white' },
    pptx: { label: 'PPT',  bg: 'bg-orange-500',  text: 'text-white' },
    txt:  { label: 'TXT',  bg: 'bg-gray-500',    text: 'text-white' },
    zip:  { label: 'ZIP',  bg: 'bg-amber-600',   text: 'text-white' },
    rar:  { label: 'RAR',  bg: 'bg-amber-600',   text: 'text-white' },
    csv:  { label: 'CSV',  bg: 'bg-emerald-600', text: 'text-white' },
    json: { label: 'JSON', bg: 'bg-slate-600',   text: 'text-white' },
  }
  return map[ext] || { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', bg: 'bg-primary', text: 'text-white' }
}

interface Props {
  conversationId: string
  otherUser: ChatParticipant | null
  // Compact: widget mode (smaller paddings, no header). Full: page mode.
  compact?: boolean
}

export default function MessageThread({ conversationId, otherUser, compact = false }: Props) {
  const { user } = useAuth()
  const { sendMessage, markRead, setTyping, onMessage, onRead, onTyping, onlineUserIds } = useChat()

  // Pathname + params are used to detect the "ask-about-service" prefill
  // handoff from /services or /worker/[id]. When the URL looks like
  // /messages/<id>?service=<serviceId>, we fetch that service, prefill the
  // composer with a template, and strip the param so a refresh doesn't
  // overwrite user edits.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [theyAreTyping, setTheyAreTyping] = useState(false)
  const [loading, setLoading] = useState(true)
  // Persisted "asking about <service>" context — survives refresh because
  // the conversation now stores serviceContextId on the server.
  const [serviceContext, setServiceContext] = useState<(WorkerService & {
    workerID?: { _id?: string; userId?: string }
  }) | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLInputElement>(null)
  // Two separate hidden inputs so we can restrict the picker to images for
  // the ImageIcon button while the Paperclip button allows any file type.
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Load initial history + mark as read ──────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getWithAuth(`/chat/conversations/${conversationId}/messages?limit=50`)
      .then(data => {
        if (cancelled) return
        setMessages(data.messages || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load messages:', err)
        setLoading(false)
      })

    // Opening a conversation = we're reading it. Tell the backend.
    markRead(conversationId)

    return () => { cancelled = true }
  }, [conversationId, markRead])

  // ─── Load service context (refresh-safe) ─────────────────────
  // GET /chat/conversations/:id returns the populated serviceContext
  // (the WorkerService linked at conversation create time). Used to
  // render the persistent "asking about <service>" banner above the
  // thread regardless of whether ?service= is present in the URL.
  useEffect(() => {
    let cancelled = false
    api.getWithAuth(`/chat/conversations/${conversationId}`)
      .then(data => {
        if (cancelled) return
        setServiceContext(data?.conversation?.serviceContext || null)
      })
      .catch(() => { /* non-fatal — banner just stays hidden */ })
    return () => { cancelled = true }
  }, [conversationId])

  // ─── Service-context auto-seed ─────────────────────────────
  // When the user arrived via the "اسأل" button (URL ends with ?service=<id>
  // on a /messages/* path), fetch the service and auto-send a two-part
  // introduction on the customer's behalf:
  //   1. An image message with the service showcase image (if any)
  //   2. A friendly formatted text message with the service name, price, and
  //      a deep link back to the service row on the worker's profile
  //
  // After seeding, the URL param is stripped so a refresh doesn't re-fire.
  // The composer is left empty and focused — this is the customer's space to
  // ask their actual question ("هل الخدمة متاحة يوم الخميس؟" etc.).
  //
  // Scoped with a ref guard so React strict-mode double-invocation doesn't
  // double-send. Guarded on pathname so the widget on unrelated pages with
  // a stray ?service= param doesn't trigger.
  const seededServiceRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pathname || !pathname.startsWith('/messages/')) return
    const serviceId = searchParams?.get('service')
    if (!serviceId) return
    if (seededServiceRef.current === `${conversationId}:${serviceId}`) return
    seededServiceRef.current = `${conversationId}:${serviceId}`

    let cancelled = false
    const run = async () => {
      try {
        const data = await api.get(`/workers/service/${serviceId}`)
        if (cancelled || !data?.service) return

        const service = data.service as WorkerService & {
          workerID?: { _id?: string }
        }
        const workerProfileId = service.workerID?._id
        const firstImage = service.images?.[0]

        // Show the persistent service banner immediately while the seed
        // messages are still being sent — keeps the UI responsive even on
        // slow connections.
        setServiceContext(service as WorkerService & {
          workerID?: { _id?: string; userId?: string }
        })

        // 1) Image (if the service has a showcase image). Optimistic append so
        //    the customer sees it immediately; the broadcast will de-dupe.
        if (firstImage) {
          const sent = await sendMessage(
            conversationId,
            firstImage,
            'image',
            { fileName: `${service.name}.jpg`, fileSize: 0 },
          )
          if (sent && !cancelled) {
            setMessages(prev => prev.some(m => m._id === sent._id) ? prev : [...prev, sent])
          }
        }

        // 2) Friendly formatted introduction text
        const text = buildServiceInquiryText(service, workerProfileId)
        const sentText = await sendMessage(conversationId, text, 'text')
        if (sentText && !cancelled) {
          setMessages(prev => prev.some(m => m._id === sentText._id) ? prev : [...prev, sentText])
        }

        // Strip the ?service= param ONLY after both messages are dispatched.
        // Doing this earlier (the previous bug) caused a race: when the URL
        // changed mid-send, MessageThread re-rendered, the seed messages
        // never landed, and the customer saw an empty thread with no
        // service context.
        if (!cancelled) router.replace(pathname)

        // Focus composer so the customer can continue with their real question.
        requestAnimationFrame(() => { composerRef.current?.focus() })
      } catch (err) {
        console.error('Failed to auto-seed service inquiry:', err)
      }
    }
    run()

    return () => { cancelled = true }
    // Intentionally scoped — re-running on searchParams change after replace()
    // would cause a second fetch; the ref guard also protects against it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // ─── Subscribe to live updates scoped to THIS conversation ─
  useEffect(() => {
    // New message handler
    const unsubMsg = onMessage((msg) => {
      if (msg.conversationId !== conversationId) return
      setMessages(prev => {
        // De-dupe by _id in case both the ack response and the broadcast arrive.
        if (prev.some(m => m._id === msg._id)) return prev
        return [...prev, msg]
      })
      // If the OTHER side sent it and we're open, mark read immediately.
      if (String(msg.senderId) !== String(user?.id)) {
        markRead(conversationId)
      }
    })

    // Read receipt handler: mark my outgoing messages as read.
    const unsubRead = onRead((data) => {
      if (data.conversationId !== conversationId) return
      setMessages(prev => prev.map(m => ({ ...m, isRead: true })))
    })

    // Typing indicator from the OTHER side.
    const unsubTyping = onTyping((data) => {
      if (data.conversationId !== conversationId) return
      if (String(data.userId) === String(user?.id)) return  // ignore our own
      setTheyAreTyping(data.isTyping)
    })

    return () => {
      unsubMsg()
      unsubRead()
      unsubTyping()
    }
  }, [conversationId, user?.id, onMessage, onRead, onTyping, markRead])

  // ─── Auto-scroll to bottom when messages change ───────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, theyAreTyping])

  // ─── Typing handler (debounced stop) ──────────────────────
  const handleInputChange = (val: string) => {
    setInput(val)
    setTyping(conversationId, true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(conversationId, false)
    }, 2000)
  }

  // ─── Send handler ─────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    // Stop typing signal immediately.
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    setTyping(conversationId, false)
    setInput('')
    const sent = await sendMessage(conversationId, text, 'text')
    // The broadcast will also arrive via onMessage and be de-duped.
    if (sent) {
      setMessages(prev => prev.some(m => m._id === sent._id) ? prev : [...prev, sent])
    }
  }, [input, conversationId, sendMessage, setTyping])

  // Unified upload handler — Cloudinary /auto/upload tells us if the file is
  // an image or a raw file, and we send the right messageType accordingly.
  // Called by both the image button and the paperclip button.
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so the same file can be picked again
    if (!file) return
    try {
      setUploading(true)
      const result = await uploadChatFile(file)
      const sent = await sendMessage(
        conversationId,
        result.url,
        result.kind,  // 'image' or 'file'
        { fileName: result.fileName, fileSize: result.fileSize },
      )
      if (sent) {
        setMessages(prev => prev.some(m => m._id === sent._id) ? prev : [...prev, sent])
      }
    } catch (err: any) {
      console.error('Upload failed:', err)
      // uploadChatFile throws with a friendly Arabic message (see upload.ts).
      alert(err?.message || 'رفع الملف فشل')
    } finally {
      setUploading(false)
    }
  }

  const isOnline = otherUser && onlineUserIds.has(String(otherUser._id))
  const padding = compact ? 'p-3' : 'p-6'
  const isWorkerViewingCustomer =
    user?.role === 'worker' && otherUser?.role === 'customer' && !!otherUser?._id

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header (hidden in compact/widget mode — the widget provides its own) */}
      {!compact && otherUser && (
        <header className="bg-surface-container-lowest border-b border-outline-variant/10 p-4 flex items-center gap-3">
          {(() => {
            const headerInner = (
              <>
                <div className="relative">
                  {otherUser.profileImage ? (
                    <img src={otherUser.profileImage} alt="" className="w-11 h-11 rounded-full object-cover" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                      {otherUser.firstName?.charAt(0) || '?'}
                    </div>
                  )}
                  <span className={`absolute bottom-0 end-0 w-3 h-3 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>
                <div className="text-right flex-1">
                  <h2 className="font-bold text-on-surface">{otherUser.firstName} {otherUser.lastName}</h2>
                  <p className="text-xs text-on-surface-variant">{isOnline ? 'متصل الآن' : 'غير متصل'}</p>
                </div>
              </>
            )
            return isWorkerViewingCustomer ? (
              <Link href={`/customer/${otherUser._id}`} className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity">
                {headerInner}
              </Link>
            ) : (
              <>{headerInner}</>
            )
          })()}
        </header>
      )}

      {/* Persistent "asking about <service>" banner — set when the
          conversation has a serviceContextId on the server. Stays visible
          across refreshes; the X dismisses it for the current view only. */}
      {serviceContext && (
        <div className="bg-primary-container/30 border-b border-primary/10 px-4 py-2.5 flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-1.5 shrink-0">
            <Briefcase className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[11px] text-on-surface-variant leading-tight">يسأل عن الخدمة</p>
            <Link
              href={`/services/${serviceContext._id}`}
              className="font-bold text-sm text-on-surface hover:text-primary truncate block leading-tight"
            >
              {serviceContext.name}
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setServiceContext(null)}
            className="text-on-surface-variant hover:text-on-surface p-1"
            aria-label="إخفاء"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message list */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto ${padding} space-y-3`}>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 rounded-full bg-primary/20 animate-pulse" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant">
            <p className="text-sm">ابدأ المحادثة بإرسال أول رسالة</p>
          </div>
        ) : (
          messages.map(msg => {
            const mine = String(msg.senderId) === String(user?.id)
            const bubbleColor = mine
              ? 'bg-primary text-white rounded-2xl rounded-br-sm'
              : 'bg-surface-container-low text-on-surface rounded-2xl rounded-bl-sm'
            return (
              <div key={msg._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${bubbleColor} px-4 py-2.5 shadow-sm`}>
                  {msg.messageType === 'image' ? (
                    // Images render inline so the conversation feels lively.
                    // Clicking opens the raw image in a new tab.
                    <a href={msg.message} target="_blank" rel="noopener noreferrer">
                      <img src={msg.message} alt={msg.fileName || ''} className="rounded-lg max-h-64 object-contain" />
                    </a>
                  ) : msg.messageType === 'file' ? (() => {
                    // File attachment — render as a clickable "card".
                    // The badge on the left is a color-coded extension tag
                    // (red PDF, blue DOC, green XLS, etc.) so the file type
                    // is readable at a glance instead of just a generic icon.
                    const badge = getFileBadge(msg.fileName)
                    return (
                      <a
                        href={msg.message}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={msg.fileName || undefined}
                        className={`flex items-center gap-3 py-1 -mx-1 rounded-lg transition-colors ${
                          mine ? 'hover:bg-white/10' : 'hover:bg-surface-container-high/40'
                        }`}
                      >
                        {/* Colored badge — file-type pill with the extension label,
                            plus a small FileText icon for a consistent silhouette. */}
                        <div className={`relative shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-center ${badge.bg} ${badge.text} shadow-sm`}>
                          <FileText className="w-4 h-4 opacity-80" />
                          <span className="text-[9px] font-black tracking-wider leading-none mt-0.5">
                            {badge.label}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 text-right">
                          <p className="text-sm font-semibold truncate">{msg.fileName || 'ملف'}</p>
                          {msg.fileSize ? (
                            <p className="text-[11px] opacity-70">{formatBytes(msg.fileSize)}</p>
                          ) : null}
                        </div>
                        <Download className={`w-4 h-4 shrink-0 ${mine ? 'text-white/80' : 'text-on-surface-variant'}`} />
                      </a>
                    )
                  })() : (
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {/* Inline-autolink http/https URLs so service deep-links
                          (e.g. the "اسأل" auto-send) are clickable. Non-URL
                          segments render as plain text. */}
                      {splitByUrls(msg.message).map((seg, i) => (
                        seg.kind === 'link' ? (
                          <a
                            key={i}
                            href={seg.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`underline break-all ${mine ? 'text-white' : 'text-primary'}`}
                          >
                            {seg.value}
                          </a>
                        ) : (
                          <span key={i}>{seg.value}</span>
                        )
                      ))}
                    </p>
                  )}
                  <div className="flex items-center gap-1 justify-end mt-1 opacity-70">
                    <span className="text-[10px]">
                      {new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {mine && (
                      msg.isRead
                        ? <CheckCheck className="w-3.5 h-3.5" />
                        : <Check className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Typing indicator row */}
        {theyAreTyping && (
          <div className="flex justify-start">
            <div className="bg-surface-container-low rounded-2xl px-4 py-2.5 flex gap-1">
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/50 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/50 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-on-surface-variant/50 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="bg-surface-container-lowest border-t border-outline-variant/10 p-3 flex items-center gap-2">
        {/* Hidden file inputs — one scoped to images, one for any file type.
            Each picker button triggers its matching input. Keeping them
            separate lets the OS dialog show a relevant file filter. */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-low rounded-full transition-colors disabled:opacity-50"
          title="إرفاق صورة"
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-low rounded-full transition-colors disabled:opacity-50"
          title="إرفاق ملف (PDF وغيره)"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={composerRef}
          type="text"
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={uploading ? 'جاري الرفع...' : 'اكتب رسالتك...'}
          disabled={uploading}
          className="flex-1 bg-surface-container-low border-none rounded-full px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || uploading}
          className="p-2.5 bg-primary text-white rounded-full hover:bg-primary-container transition-colors disabled:opacity-40"
          title="إرسال"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
