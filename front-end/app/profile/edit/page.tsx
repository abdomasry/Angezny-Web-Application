'use client'

// =============================================================================
// /profile/edit — customer profile editor
// =============================================================================
// Migrated to react-hook-form + zod (profileEditSchema). The submit logic and
// the "email editable only for phone-only users" rule are preserved 1:1.
// =============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { profileEditSchema, type ProfileEditValues } from '@/lib/schemas'

// Loose shape for updateUser — the auth context's User type doesn't include
// `phone` but the runtime accepts it. Local helper keeps us off `any`.
type UpdatableUserFields = {
  firstName?: string
  lastName?: string
  phone?: string
}

export default function EditProfilePage() {
  const { isLoggedIn, isLoading: authLoading, updateUser } = useAuth()
  const router = useRouter()

  const [pageLoading, setPageLoading] = useState(true)
  const [submitError, setSubmitError] = useState('')
  // Phone-only users can ADD an email (one-way). Anyone with an existing
  // email can't change it from this form — security: requires re-verification.
  const [emailEditable, setEmailEditable] = useState(false)

  const form = useForm<ProfileEditValues>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      city: '',
      area: '',
      bio: '',
    },
    mode: 'onTouched',
  })
  const { register, handleSubmit, reset, formState } = form
  const { errors, isSubmitting } = formState

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.push('/signin')
    }
  }, [authLoading, isLoggedIn, router])

  // Pre-fill the form once the profile loads.
  useEffect(() => {
    if (!isLoggedIn) return
    api.getWithAuth('/customer/profile')
      .then(data => {
        const p = data.profile
        reset({
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          email: p.email || '',
          phone: p.phone || '',
          city: p.location?.city || '',
          area: p.location?.area || '',
          bio: p.bio || '',
        })
        setEmailEditable(!p.email)
      })
      .catch(err => console.error('Failed to load profile:', err))
      .finally(() => setPageLoading(false))
  }, [isLoggedIn, reset])

  const onSubmit = async (values: ProfileEditValues) => {
    setSubmitError('')
    try {
      // Only forward `email` when the field was editable AND non-empty —
      // matches the previous "phone-only user adding an email" rule.
      const payload: Record<string, unknown> = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        bio: values.bio || '',
        location: { city: values.city || '', area: values.area || '' },
      }
      if (emailEditable && values.email) {
        payload.email = values.email
      }

      await api.putWithAuth('/customer/profile', payload)

      const userPatch: UpdatableUserFields = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || undefined,
      }
      updateUser(userPatch as Parameters<typeof updateUser>[0])

      router.push('/profile')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ التغييرات')
    }
  }

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/30 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-2xl mx-auto">
        <div className="bg-surface-container-lowest p-8 rounded-xl shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]">

          <h1 className="text-2xl font-bold text-on-surface mb-8">تعديل الملف الشخصي</h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {/* Name row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-sm font-semibold text-on-surface-variant">الاسم الأول</label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  aria-invalid={errors.firstName ? 'true' : 'false'}
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none focus:ring-2 ${
                    errors.firstName ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                  }`}
                  {...register('firstName')}
                />
                {errors.firstName && (
                  <p role="alert" className="text-xs text-red-700">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-sm font-semibold text-on-surface-variant">الاسم الأخير</label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  aria-invalid={errors.lastName ? 'true' : 'false'}
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none focus:ring-2 ${
                    errors.lastName ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                  }`}
                  {...register('lastName')}
                />
                {errors.lastName && (
                  <p role="alert" className="text-xs text-red-700">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Email (locked once verified) */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-on-surface-variant">البريد الإلكتروني</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                disabled={!emailEditable}
                aria-invalid={errors.email ? 'true' : 'false'}
                className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none ${
                  emailEditable
                    ? errors.email
                      ? 'ring-2 ring-red-300 focus:ring-red-300'
                      : 'focus:ring-2 focus:ring-primary/20'
                    : 'opacity-50 cursor-not-allowed'
                }`}
                {...register('email')}
              />
              <p className="text-xs text-on-surface-variant">
                {emailEditable ? 'أضف بريد إلكتروني لتأمين حسابك' : 'لا يمكن تغيير البريد الإلكتروني بعد التحقق'}
              </p>
              {errors.email && (
                <p role="alert" className="text-xs text-red-700">{errors.email.message}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label htmlFor="phone" className="block text-sm font-semibold text-on-surface-variant">رقم الهاتف</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder="01xxxxxxxxx"
                aria-invalid={errors.phone ? 'true' : 'false'}
                className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none focus:ring-2 ${
                  errors.phone ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                }`}
                {...register('phone')}
              />
              {errors.phone && (
                <p role="alert" className="text-xs text-red-700">{errors.phone.message}</p>
              )}
            </div>

            {/* Location row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="city" className="block text-sm font-semibold text-on-surface-variant">المدينة</label>
                <input
                  id="city"
                  type="text"
                  placeholder="مثال: القاهرة"
                  className="w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none focus:ring-2 focus:ring-primary/20"
                  {...register('city')}
                />
                {errors.city && (
                  <p role="alert" className="text-xs text-red-700">{errors.city.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="area" className="block text-sm font-semibold text-on-surface-variant">المنطقة</label>
                <input
                  id="area"
                  type="text"
                  placeholder="مثال: مدينة نصر"
                  className="w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none focus:ring-2 focus:ring-primary/20"
                  {...register('area')}
                />
                {errors.area && (
                  <p role="alert" className="text-xs text-red-700">{errors.area.message}</p>
                )}
              </div>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <label htmlFor="bio" className="block text-sm font-semibold text-on-surface-variant">نبذة عنك</label>
              <textarea
                id="bio"
                rows={3}
                placeholder="اكتب نبذة مختصرة عنك..."
                className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3 text-right outline-none focus:ring-2 resize-none ${
                  errors.bio ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                }`}
                {...register('bio')}
              />
              {errors.bio && (
                <p role="alert" className="text-xs text-red-700">{errors.bio.message}</p>
              )}
            </div>

            {submitError && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
                {submitError}
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
              <Link
                href="/profile"
                className="flex-1 flex items-center justify-center gap-2 bg-surface-container-low text-on-surface-variant py-3 rounded-xl font-bold hover:bg-surface-container-high transition-colors"
              >
                <X className="w-4 h-4" />
                إلغاء
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
