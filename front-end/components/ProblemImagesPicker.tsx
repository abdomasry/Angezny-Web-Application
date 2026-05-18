'use client'

// Customer-side picker for problem photos attached to a new order.
// Uploads each selected file to Cloudinary using the existing unsigned
// preset (lib/upload.ts), then surfaces the resulting secure_urls to
// the parent via onChange. Parent owns the array; this component is
// fully controlled.

import { useRef, useState } from 'react'
import { Camera, Loader2, X, AlertCircle } from 'lucide-react'
import { uploadChatFile } from '@/lib/upload'

const MAX_IMAGES = 5

interface ProblemImagesPickerProps {
  value: string[]
  onChange: (next: string[]) => void
  // Lifted up so the parent can disable the submit button while any
  // upload is in flight (otherwise a fast submit drops half-uploaded files).
  onUploadingChange?: (isUploading: boolean) => void
}

export default function ProblemImagesPicker({
  value,
  onChange,
  onUploadingChange,
}: ProblemImagesPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState('')

  const remaining = MAX_IMAGES - value.length
  const disabled = remaining <= 0

  const setBusy = (delta: number) => {
    setPendingCount((c) => {
      const next = Math.max(0, c + delta)
      onUploadingChange?.(next > 0)
      return next
    })
  }

  const handleFiles = async (files: FileList | null) => {
    setError('')
    if (!files || files.length === 0) return

    // Trim to whatever budget is left so we never upload images we'd then
    // discard. If the customer picked 3 but only 1 slot remains, take 1.
    const arr = Array.from(files).slice(0, remaining)
    if (arr.length < files.length) {
      setError(`يمكنك إضافة ${remaining} صور فقط — تم تجاهل الباقي`)
    }

    // Upload in parallel — order isn't load-bearing for problem photos.
    setBusy(arr.length)
    const results = await Promise.allSettled(arr.map((f) => uploadChatFile(f)))
    setBusy(-arr.length)

    const added: string[] = []
    const errors: string[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.kind === 'image') {
        added.push(r.value.url)
      } else if (r.status === 'fulfilled') {
        errors.push('يجب أن تكون الملفات صوراً فقط')
      } else {
        errors.push(r.reason instanceof Error ? r.reason.message : 'فشل الرفع')
      }
    }
    if (added.length) onChange([...value, ...added])
    if (errors.length) setError(errors[0]) // surface the first; keep UI calm
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">
          أرفق حتى {MAX_IMAGES} صور توضح المشكلة — تساعد الحرفي على فهم العمل قبل القبول.
        </p>
        <span className="text-xs text-on-surface-variant shrink-0">
          {value.length} / {MAX_IMAGES}
        </span>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {value.map((url, idx) => (
            <div
              key={url}
              className="relative aspect-square rounded-xl overflow-hidden bg-surface-container-low"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`صورة المشكلة ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
                aria-label="إزالة الصورة"
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          // Reset so picking the same file twice still triggers onChange.
          if (inputRef.current) inputRef.current.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || pendingCount > 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-outline-variant/40 text-on-surface-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pendingCount > 0 ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري رفع {pendingCount}...
          </>
        ) : disabled ? (
          <>وصلت إلى الحد الأقصى ({MAX_IMAGES} صور)</>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            إضافة صور
          </>
        )}
      </button>

      {error && (
        <p className="text-sm text-error flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  )
}
