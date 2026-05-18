'use client'

// Small image-picker used by the admin coupon + category forms.
// Wraps the existing Cloudinary unsigned-upload helper (lib/upload.ts) so
// admins can pick a file from their PC instead of pasting a URL. When the
// upload finishes we hand the parent the resulting Cloudinary URL via the
// same `value` / `onChange` shape it was already using for the URL input,
// so the surrounding form state doesn't need to change.

import { useRef, useState } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { uploadChatFile } from '@/lib/upload'

interface Props {
  value: string
  onChange: (url: string) => void
  // Visual height of the preview box. Coupon banners are wide/short;
  // category icons are squarish. Caller picks the tailwind classes.
  previewClassName?: string
  // Optional label shown above the picker. Some forms render their own
  // label, so we keep this optional.
  label?: string
}

export default function ImageUpload({
  value,
  onChange,
  previewClassName = 'w-48 h-32',
  label,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handlePick = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const result = await uploadChatFile(file)
      onChange(result.url)
    } catch (err) {
      // Surface Cloudinary's own message — usually "preset not found",
      // "format not allowed", or "file too large". Helpful for the admin.
      setError(err instanceof Error ? err.message : 'فشل رفع الصورة')
    } finally {
      setUploading(false)
      // Reset the input so picking the same file twice in a row still
      // fires onChange (browsers swallow the second event otherwise).
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-on-surface-variant mb-1">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0])}
      />
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt=""
            className={`${previewClassName} object-cover rounded-lg border border-outline-variant/20`}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.opacity = '0.3'
            }}
          />
          {/* Replace + clear buttons stack on top of the preview. */}
          <div className="absolute top-1 left-1 flex gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-7 h-7 rounded-lg bg-white/90 shadow flex items-center justify-center hover:bg-white disabled:opacity-50"
              title="استبدال"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={uploading}
              className="w-7 h-7 rounded-lg bg-white/90 shadow flex items-center justify-center text-red-500 hover:bg-white disabled:opacity-50"
              title="إزالة"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${previewClassName} flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant text-xs hover:border-primary hover:text-primary transition-colors disabled:opacity-50`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>جارٍ الرفع…</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              <span>اختر صورة من جهازك</span>
            </>
          )}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
