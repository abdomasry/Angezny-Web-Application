'use client'

import SectionError from '@/components/SectionError'

interface Props {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
}

export default function NotificationsError(props: Props) {
  return (
    <SectionError
      {...props}
      title="تعذّر تحميل الإشعارات"
      description="لم نتمكن من جلب إشعاراتك. حاول مرة أخرى."
    />
  )
}
