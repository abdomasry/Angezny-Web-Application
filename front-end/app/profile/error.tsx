'use client'

import SectionError from '@/components/SectionError'

interface Props {
  error: Error & { digest?: string }
  reset?: () => void
  unstable_retry?: () => void
}

export default function ProfileError(props: Props) {
  return (
    <SectionError
      {...props}
      title="تعذّر تحميل الملف الشخصي"
      description="لم نتمكن من جلب بياناتك. حاول مرة أخرى."
    />
  )
}
