'use client'

import SectionError from '@/components/SectionError'

interface Props {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
}

export default function WorkerError(props: Props) {
  return (
    <SectionError
      {...props}
      title="تعذّر تحميل الملف"
      description="لم نتمكن من جلب بيانات الحرفي. حاول مرة أخرى."
    />
  )
}
