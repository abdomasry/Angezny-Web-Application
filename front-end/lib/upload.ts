// Cloudinary unsigned upload helper — handles both images AND arbitrary files
// (PDFs, Word docs, etc.) via the /auto/upload endpoint which detects the
// resource type from the file itself.
//
// Why client → Cloudinary directly (not via our backend):
//   - Our backend doesn't have a file upload pipeline.
//   - Backend hosts typically have ephemeral filesystems — files would
//     disappear on redeploy.
//   - Cloudinary serves from a CDN (fast), and their free tier is generous.
//
// Setup required (one-time):
//   1. Create a free Cloudinary account (cloudinary.com)
//   2. Settings → Upload → Add unsigned upload preset:
//      - Folder: `chat` (optional, but tidier)
//      - Max file size: 10485760 (10 MB)
//      - Allowed formats: leave empty (or: jpg, png, webp, pdf, doc, docx)
//      - Resource type: Auto
//   3. Create front-end/.env.local:
//      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
//      NEXT_PUBLIC_CLOUDINARY_PRESET=your_preset_name
//   4. Restart the Next dev server so the env vars are picked up
//
// The /auto/upload endpoint returns { secure_url, resource_type, ... }.
// resource_type is 'image' for images and 'raw' for everything else.

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET

// Hard cap matches the preset's max_file_size. Kept in sync by convention.
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export interface UploadResult {
  url: string
  kind: 'image' | 'file'
  fileName: string
  fileSize: number
}

/**
 * Uploads any file (image or document) to Cloudinary using the unsigned preset.
 * Returns metadata on success; throws on error so the caller can show a
 * specific message.
 */
export async function uploadChatFile(file: File): Promise<UploadResult> {
  if (!CLOUD_NAME || !PRESET) {
    throw new Error(
      'Cloudinary غير مُعدّ. أضف NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME و NEXT_PUBLIC_CLOUDINARY_PRESET في front-end/.env.local ثم أعد تشغيل الخادم.'
    )
  }

  if (file.size > MAX_BYTES) {
    throw new Error(`الملف كبير جداً (أقصى حجم 10 ميجابايت)`)
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', PRESET)

  // /auto/upload lets Cloudinary figure out the resource type (image vs raw).
  // Previously we used /image/upload which refused PDFs with a 400 error.
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`
  const res = await fetch(url, { method: 'POST', body: formData })

  if (!res.ok) {
    // Surface Cloudinary's own error text so the user can diagnose
    // preset misconfiguration (e.g. "Upload preset not found", "Invalid
    // signature", "Format not allowed").
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error?.message || ''
    } catch { /* body wasn't JSON */ }
    throw new Error(detail || `رفع الملف فشل (HTTP ${res.status})`)
  }

  const data = await res.json()
  // Cloudinary returns `resource_type` of 'image' for images and 'raw' for
  // PDFs/docs/etc. We normalize to our own 'image' | 'file' distinction.
  const kind: 'image' | 'file' = data.resource_type === 'image' ? 'image' : 'file'

  return {
    url: data.secure_url,
    kind,
    fileName: file.name,
    fileSize: file.size,
  }
}

/**
 * Backward-compatible wrapper — older code (/ChatWidget MessageThread earlier
 * version) imported uploadChatImage. Kept as a thin alias so nothing breaks.
 */
export async function uploadChatImage(file: File): Promise<string | null> {
  try {
    const result = await uploadChatFile(file)
    return result.url
  } catch (err) {
    console.error(err)
    return null
  }
}
