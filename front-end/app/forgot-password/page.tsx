"use client"

// =============================================================================
// /forgot-password — request a password-reset link by email or phone
// =============================================================================
// UI follows design/stitch_authentication_login_register/forgot_password
//   - Floating white card on the soft surface background (Tonal Layering)
//   - Lock-with-rewind icon in a soft primary chip at the top
//   - Single field (email OR Egyptian phone) — schema accepts either
//   - Big primary CTA "إرسال رابط الاستعادة"
//   - "العودة لتسجيل الدخول" tertiary link at the bottom
//
// On submit we hit POST /auth/forgot-password. The backend always replies 200
// (even for unknown accounts) to avoid leaking which addresses are registered;
// we just show a friendly success view either way.
// =============================================================================

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { Mail, ArrowLeft, RotateCcw, AlertCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { api } from "@/lib/api"
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/schemas"

export default function ForgotPasswordPage() {
  const t = useTranslations()
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState("")
  // We surface "channel" to the user only as a soft hint — the backend never
  // confirms which one actually got the message. This is purely cosmetic.
  const [submittedAs, setSubmittedAs] = useState<"email" | "phone">("email")

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: "" },
    mode: "onTouched",
  })
  const { register, handleSubmit, formState } = form
  const { errors, isSubmitting } = formState

  const onSubmit = async (values: ForgotPasswordValues) => {
    setSubmitError("")
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.identifier)
    try {
      await api.post("/auth/forgot-password", {
        ...(looksLikeEmail
          ? { email: values.identifier }
          : { phone: values.identifier }),
      })
      setSubmittedAs(looksLikeEmail ? "email" : "phone")
      setIsSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    }
  }

  // ─── Success view ───────────────────────────────────────────────
  if (isSubmitted) {
    return (
      <main dir="rtl" className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 sm:p-12 text-center shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary-container/30 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-3">
            {t('auth.forgotPassword.successTitle')}
          </h1>
          <p className="text-sm text-on-surface-variant leading-7 mb-8">
            {submittedAs === "email"
              ? t('auth.forgotPassword.successEmail')
              : t('auth.forgotPassword.successPhone')}
          </p>
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 text-primary font-bold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('auth.forgotPassword.back')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 sm:p-12 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
        {/* Header — soft chip + bold heading + breathable subtitle */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 mb-5 rounded-full bg-primary-container/30 flex items-center justify-center">
            <RotateCcw className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-3">
            {t('auth.forgotPassword.title')}
          </h1>
          <p className="text-sm text-on-surface-variant leading-7 max-w-xs">
            {t('auth.forgotPassword.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="identifier"
              className="block text-sm font-semibold text-on-surface text-right"
            >
              {t('auth.forgotPassword.label')}
            </label>
            <div className="relative">
              <input
                id="identifier"
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder={t('auth.forgotPassword.placeholder')}
                aria-invalid={errors.identifier ? "true" : "false"}
                className={`w-full bg-surface-container-low rounded-2xl px-5 py-4 pl-12 text-right outline-none transition-all focus:bg-surface-container-lowest focus:ring-2 ${
                  errors.identifier
                    ? "ring-2 ring-red-300 focus:ring-red-300"
                    : "focus:ring-primary/30"
                }`}
                dir="ltr"
                style={{ textAlign: "right" }}
                {...register("identifier")}
              />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/60 pointer-events-none" />
            </div>
            {errors.identifier && (
              <p role="alert" className="text-xs text-red-700 pr-1">
                {errors.identifier.message}
              </p>
            )}
          </div>

          {submitError && (
            <p
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-linear-to-l from-primary to-primary-container text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              t('common.sending')
            ) : (
              <>
                <span>{t('auth.forgotPassword.submit')}</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Back to sign-in */}
        <div className="mt-8 text-center">
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 text-sm text-primary font-bold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('auth.forgotPassword.back')}
          </Link>
        </div>
      </div>
    </main>
  )
}
