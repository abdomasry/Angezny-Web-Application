'use client'

import SectionError from '@/components/SectionError'

interface Props {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
}

export default function DashboardError(props: Props) {
  return (
    <SectionError
      {...props}
      title="تعذّر تحميل لوحة التحكم"
      description="لم نتمكن من جلب بيانات لوحتك. حاول مرة أخرى."
    />
  )
}
