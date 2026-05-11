'use client'

// TicketThread — the shared renderer for a support ticket's conversation.
// Used by both the user side (/support/[id]) and the admin panel detail view.
//
// Props:
//   ticket      — the full populated SupportTicket from GET /support/tickets/:id
//   onUpdate    — called with the updated ticket after a reply posts OR the
//                 admin changes status; parent uses this to refresh state.
//   adminMode   — true on the admin side. Enables the status dropdown and
//                 styles admin bubbles on the right (their side).
//
// Why a shared component: the bubble styling, attachment grid, composer, and
// status pill are identical on both sides. Keeping them in one place means
// any visual tweak only ships once.

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  Paperclip, Image as ImageIcon, Send, Loader2, AlertCircle,
  FileText, Download, X as XIcon, CheckCircle2, Clock, Lock, MessageCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { uploadChatFile } from '@/lib/upload'
import type { SupportTicket, TicketAttachment, TicketReply } from '@/lib/types'

interface Props {
  ticket: SupportTicket
  currentUserId?: string
  onUpdate: (ticket: SupportTicket) => void
  adminMode?: boolean
}

// Matches the same colour mapping used by MessageThread's getFileBadge, so
// PDFs stay red, Word docs stay blue, etc. Duplicated (not imported) to keep
// this component self-contained.
function getFileBadge(fileName: string | undefined) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || ''
  const map: Record<string, { label: string; bg: string }> = {
    pdf: { label: 'PDF', bg: 'bg-red-500' },
    doc: { label: 'DOC', bg: 'bg-blue-500' },
    docx: { label: 'DOC', bg: 'bg-blue-500' },
    xls: { label: 'XLS', bg: 'bg-green-600' },
    xlsx: { label: 'XLS', bg: 'bg-green-600' },
    ppt: { label: 'PPT', bg: 'bg-orange-500' },
    pptx: { label: 'PPT', bg: 'bg-orange-500' },
    txt: { label: 'TXT', bg: 'bg-gray-500' },
    zip: { label: 'ZIP', bg: 'bg-amber-600' },
    rar: { label: 'RAR', bg: 'bg-amber-600' },
    csv: { label: 'CSV', bg: 'bg-emerald-600' },
  }
  return map[ext] || { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', bg: 'bg-primary' }
}

function formatBytes(bytes: number | undefined) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const TYPE_LABELS: Record<SupportTicket['type'], string> = {
  service_issue: 'مشكلة في خدمة',
  user_report: 'بلاغ عن مستخدم',
  technical: 'مشكلة تقنية',
  payment_issue: 'مشكلة في الدفع',
  other: 'أخرى',
}

const STATUS_META: Record<
  SupportTicket['status'],
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  open: { label: 'مفتوح', bg: 'bg-blue-50', text: 'text-blue-700', icon: MessageCircle },
  in_progress: { label: 'قيد المعالجة', bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock },
  resolved: { label: 'محلولة', bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle2 },
  closed: { label: 'مغلق', bg: 'bg-gray-100', text: 'text-gray-600', icon: Lock },
}

// Renders a single attachment. Images inline so the reader sees proof of the
// issue at a glance; files get the coloured badge card (same as chat).
function AttachmentItem({ a, darkBubble }: { a: TicketAttachment; darkBubble?: boolean }) {
  if (a.kind === 'image') {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer">
        <img src={a.url} alt={a.fileName} className="rounded-lg max-h-48 object-contain" />
      </a>
    )
  }
  const badge = getFileBadge(a.fileName)
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      download={a.fileName || undefined}
      className={`flex items-center gap-3 py-1 px-1 rounded-lg transition-colors ${
        darkBubble ? 'hover:bg-white/10' : 'hover:bg-surface-container-high/40'
      }`}
    >
      <div className={`relative shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center ${badge.bg} text-white shadow-sm`}>
        <FileText className="w-4 h-4 opacity-80" />
        <span className="text-[9px] font-black tracking-wider leading-none mt-0.5">
          {badge.label}
        </span>
      </div>
      <div className="min-w-0 flex-1 text-right">
        <p className="text-sm font-semibold truncate">{a.fileName || 'ملف'}</p>
        {a.fileSize ? <p className="text-[11px] opacity-70">{formatBytes(a.fileSize)}</p> : null}
      </div>
      <Download className={`w-4 h-4 shrink-0 ${darkBubble ? 'text-white/80' : 'text-on-surface-variant'}`} />
    </a>
  )
}

export default function TicketThread({ ticket, currentUserId, onUpdate, adminMode = false }: Props) {
  const [replyText, setReplyText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<TicketAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const StatusIcon = STATUS_META[ticket.status].icon
  const statusMeta = STATUS_META[ticket.status]
  const isClosed = ticket.status === 'closed'

  // Pick a side for each bubble. On the user side: own (user) replies sit
  // right-aligned in teal; admin replies sit left-aligned in amber.
  // On admin side: own (admin) replies sit right-aligned; user replies left.
  const isMine = (reply: TicketReply) => {
    const authorId = typeof reply.authorId === 'string' ? reply.authorId : reply.authorId?._id
    if (currentUserId && authorId === currentUserId) return true
    if (adminMode) return reply.authorRole === 'admin'
    return reply.authorRole !== 'admin'
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    // Allow up to 4 attachments per reply — keeps the thread readable.
    const room = 4 - pendingAttachments.length
    if (room <= 0) {
      setError('حد الإرفاق 4 ملفات لكل رد')
      return
    }
    const toUpload = files.slice(0, room)
    setUploading(true)
    setError('')
    try {
      const results = await Promise.all(
        toUpload.map(f =>
          uploadChatFile(f)
            .then(r => ({
              url: r.url,
              kind: r.kind,
              fileName: r.fileName,
              fileSize: r.fileSize,
            }))
            .catch(err => {
              console.error('Upload failed:', err)
              return null
            }),
        ),
      )
      const ok = results.filter((r): r is TicketAttachment => !!r)
      if (ok.length < toUpload.length) {
        setError('تعذّر رفع بعض الملفات — حاول مرة أخرى')
      }
      setPendingAttachments(prev => [...prev, ...ok])
    } finally {
      setUploading(false)
    }
  }

  const removePendingAttachment = (idx: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSendReply = async () => {
    const text = replyText.trim()
    if (!text && pendingAttachments.length === 0) return
    setSending(true)
    setError('')
    try {
      const data = await api.postWithAuth(`/support/tickets/${ticket._id}/reply`, {
        message: text || '—',
        attachments: pendingAttachments,
      })
      if (data.ticket) onUpdate(data.ticket)
      setReplyText('')
      setPendingAttachments([])
    } catch (err: any) {
      setError(err?.message || 'تعذّر إرسال الرد')
    } finally {
      setSending(false)
    }
  }

  // Admin-only: change the ticket status via PUT /api/admin/tickets/:id/status.
  // Normal (customer/worker) users can't hit this endpoint — adminOnly middleware
  // would 403 them.
  const handleStatusChange = async (next: SupportTicket['status']) => {
    if (!adminMode || next === ticket.status) return
    setStatusUpdating(true)
    try {
      const data = await api.putWithAuth(`/admin/tickets/${ticket._id}/status`, { status: next })
      if (data.ticket) onUpdate(data.ticket)
    } catch (err: any) {
      setError(err?.message || 'تعذّر تحديث الحالة')
    } finally {
      setStatusUpdating(false)
    }
  }

  // Header target block — shows a quick link to whatever the ticket is about.
  // Each entry is optional (a ticket can be about a user AND reference an order).
  const renderTargetLinks = () => {
    const chunks: React.ReactNode[] = []
    const tUser = typeof ticket.targetUserId === 'object' ? ticket.targetUserId : null
    const tService = typeof ticket.targetServiceId === 'object' ? ticket.targetServiceId : null
    const tOrder = typeof ticket.targetOrderId === 'object' ? ticket.targetOrderId : null

    if (tUser) {
      chunks.push(
        <span key="user" className="inline-flex items-center gap-1 text-xs bg-surface-container-low rounded-full px-3 py-1">
          مستخدم: <span className="font-bold">{tUser.firstName} {tUser.lastName}</span>
        </span>,
      )
    }
    if (tService) {
      chunks.push(
        <span key="service" className="inline-flex items-center gap-1 text-xs bg-surface-container-low rounded-full px-3 py-1">
          خدمة: <span className="font-bold">{tService.name}</span>
        </span>,
      )
    }
    if (tOrder) {
      chunks.push(
        <span key="order" className="inline-flex items-center gap-1 text-xs bg-surface-container-low rounded-full px-3 py-1">
          طلب: <span className="font-mono text-[10px]">{tOrder._id.slice(-8)}</span>
        </span>,
      )
    }
    return chunks
  }

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest rounded-2xl shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-outline-variant/10">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-primary/10 text-primary rounded-full px-3 py-1">
                {TYPE_LABELS[ticket.type]}
              </span>
              {adminMode && typeof ticket.userId === 'object' && (
                <span className="text-xs text-on-surface-variant">
                  من: <span className="font-bold text-on-surface">
                    {ticket.userId.firstName} {ticket.userId.lastName}
                  </span>
                  {ticket.userId.role && (
                    <span className="ms-1 opacity-70">
                      ({ticket.userId.role === 'worker' ? 'حرفي' : 'عميل'})
                    </span>
                  )}
                </span>
              )}
            </div>
            <h1 className="text-xl font-black text-on-surface">{ticket.title}</h1>
            <p className="text-xs text-on-surface-variant mt-1">
              {formatDateTime(ticket.createdAt)}
            </p>
          </div>

          {/* Status — dropdown in admin mode, static pill for users */}
          {adminMode ? (
            <div className="shrink-0">
              <label className="block text-xs text-on-surface-variant mb-1">الحالة</label>
              <select
                value={ticket.status}
                onChange={e => handleStatusChange(e.target.value as SupportTicket['status'])}
                disabled={statusUpdating}
                className={`text-sm font-bold rounded-full px-4 py-1.5 border-none focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer ${statusMeta.bg} ${statusMeta.text} disabled:opacity-60`}
              >
                <option value="open">مفتوح</option>
                <option value="in_progress">قيد المعالجة</option>
                <option value="resolved">محلولة</option>
                <option value="closed">مغلق</option>
              </select>
            </div>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold rounded-full px-3 py-1.5 ${statusMeta.bg} ${statusMeta.text}`}>
              <StatusIcon className="w-4 h-4" />
              {statusMeta.label}
            </span>
          )}
        </div>

        {/* Target context chips */}
        {renderTargetLinks().length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {renderTargetLinks()}
            {adminMode && typeof ticket.targetUserId === 'object' && (
              <Link
                href={`/admin/users/${ticket.targetUserId._id}`}
                className="text-xs text-primary hover:underline"
              >
                عرض ملف المستخدم ←
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {ticket.replies.length === 0 ? (
          <div className="text-center text-on-surface-variant py-10">
            لا توجد ردود بعد.
          </div>
        ) : (
          ticket.replies.map((reply, i) => {
            const mine = isMine(reply)
            const authorObj = typeof reply.authorId === 'object' ? reply.authorId : null
            const bubbleClass = mine
              ? 'bg-primary text-white rounded-2xl rounded-br-sm'
              : reply.authorRole === 'admin'
                ? 'bg-amber-100 text-amber-900 rounded-2xl rounded-bl-sm border border-amber-200'
                : 'bg-surface-container-low text-on-surface rounded-2xl rounded-bl-sm'

            return (
              <div key={reply._id || i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] space-y-1">
                  {/* Author name (above bubble) — helps in admin view where
                      multiple admins might reply on the same ticket. */}
                  <p className={`text-xs font-semibold ${mine ? 'text-end' : 'text-start'} text-on-surface-variant`}>
                    {authorObj
                      ? `${authorObj.firstName} ${authorObj.lastName}${reply.authorRole === 'admin' ? ' (الدعم)' : ''}`
                      : reply.authorRole === 'admin' ? 'الدعم' : 'المستخدم'}
                  </p>
                  <div className={`${bubbleClass} px-4 py-3 shadow-sm`}>
                    {reply.message && reply.message !== '—' && (
                      <p className="text-sm whitespace-pre-wrap break-words mb-2 last:mb-0">
                        {reply.message}
                      </p>
                    )}
                    {reply.attachments && reply.attachments.length > 0 && (
                      <div className="space-y-2">
                        {reply.attachments.map((a, idx) => (
                          <AttachmentItem key={idx} a={a} darkBubble={mine} />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className={`text-[10px] opacity-70 ${mine ? 'text-end' : 'text-start'}`}>
                    {formatDateTime(reply.createdAt)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer — disabled on closed tickets */}
      <div className="border-t border-outline-variant/10 p-4 bg-surface-container-low/30">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-on-surface-variant">
            <Lock className="w-4 h-4" />
            تم إغلاق هذا البلاغ
          </div>
        ) : (
          <>
            {/* Pending attachment thumbnails */}
            {pendingAttachments.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {pendingAttachments.map((a, idx) => (
                  <div key={idx} className="relative bg-surface-container-low rounded-lg p-2 pe-7 text-xs flex items-center gap-2">
                    {a.kind === 'image' ? (
                      <img src={a.url} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-primary" />
                    )}
                    <span className="max-w-[120px] truncate">{a.fileName}</span>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(idx)}
                      className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/40 text-white flex items-center justify-center"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-xs text-error mb-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading || sending}
                className="p-2 text-on-surface-variant hover:text-primary rounded-full disabled:opacity-50"
                title="إرفاق صورة"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
                className="p-2 text-on-surface-variant hover:text-primary rounded-full disabled:opacity-50"
                title="إرفاق ملف"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={uploading ? 'جاري رفع الملفات...' : 'اكتب ردك...'}
                rows={2}
                disabled={uploading || sending}
                className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
              />
              <button
                type="button"
                onClick={handleSendReply}
                disabled={sending || uploading || (!replyText.trim() && pendingAttachments.length === 0)}
                className="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                إرسال
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
