'use client'

import SectionError from '@/components/SectionError'

interface Props {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
}

export default function ServicesError(props: Props) {
  return (
    <SectionError
      {...props}
      title="تعذّر تحميل الخدمات"
      description="لم نتمكن من جلب قائمة الخدمات. حاول مرة أخرى بعد قليل."
    />
  )
}
