'use client'

import SectionError from '@/components/SectionError'

interface Props {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
}

export default function AdminError(props: Props) {
  return (
    <SectionError
      {...props}
      title="تعذّر تحميل لوحة الإدارة"
      description="لم نتمكن من جلب بيانات الإدارة. حاول مرة أخرى."
    />
  )
}
