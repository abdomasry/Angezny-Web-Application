"use client"

// =============================================================================
// /reset-password?token=<JWT> — set a new password from the email link
// =============================================================================
// Lands here from the link inside the email sent by /auth/forgot-password.
// The token comes in via ?token= and goes straight to the backend; the user
// only types the new password twice. UI mirrors /forgot-password's card.
// =============================================================================

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Lock, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { api } from "@/lib/api"
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas"

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const t = useTranslations()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [done, setDone] = useState(false)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onTouched",
  })
  const { register, handleSubmit, formState } = form
  const { errors, isSubmitting } = formState

  // No token in the URL → useless page. Show a friendly state with a way back.
  if (!token) {
    return (
      <main dir="rtl" className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 sm:p-12 text-center shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-2">{t('auth.resetPassword.invalidTokenTitle')}</h1>
          <p className="text-sm text-on-surface-variant mb-6 leading-7">
            {t('auth.resetPassword.invalidTokenBody')}
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 bg-primary text-on-primary font-bold px-5 py-2.5 rounded-2xl hover:opacity-95 transition-opacity"
          >
            {t('auth.resetPassword.requestNew')}
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </main>
    )
  }

  const onSubmit = async (values: ResetPasswordValues) => {
    setSubmitError("")
    try {
      await api.post("/auth/reset-password", {
        token,
        password: values.password,
        confirmPassword: values.confirmPassword,
      })
      setDone(true)
      // Send the user straight to /signin after a beat so they can log in
      // with the new password.
      setTimeout(() => router.replace("/signin"), 1500)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    }
  }

  // ─── Success view (brief, then redirect) ──────────────────────────
  if (done) {
    return (
      <main dir="rtl" className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 sm:p-12 text-center shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-3">{t('auth.resetPassword.successTitle')}</h1>
          <p className="text-sm text-on-surface-variant mb-2">
            {t('auth.resetPassword.successBody')}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl p-8 sm:p-12 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 mb-5 rounded-full bg-primary-container/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-on-surface mb-3">
            {t('auth.resetPassword.title')}
          </h1>
          <p className="text-sm text-on-surface-variant leading-7 max-w-xs">
            {t('auth.resetPassword.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* New password */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-on-surface text-right">
              {t('auth.resetPassword.labelNew')}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={errors.password ? "true" : "false"}
                className={`w-full bg-surface-container-low rounded-2xl px-5 py-4 pl-12 text-right outline-none transition-all focus:bg-surface-container-lowest focus:ring-2 ${
                  errors.password
                    ? "ring-2 ring-red-300 focus:ring-red-300"
                    : "focus:ring-primary/30"
                }`}
                dir="ltr"
                style={{ textAlign: "right" }}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p role="alert" className="text-xs text-red-700 pr-1">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-on-surface text-right">
              {t('auth.resetPassword.labelConfirm')}
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? "true" : "false"}
                className={`w-full bg-surface-container-low rounded-2xl px-5 py-4 pl-12 text-right outline-none transition-all focus:bg-surface-container-lowest focus:ring-2 ${
                  errors.confirmPassword
                    ? "ring-2 ring-red-300 focus:ring-red-300"
                    : "focus:ring-primary/30"
                }`}
                dir="ltr"
                style={{ textAlign: "right" }}
                {...register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                aria-label={showConfirm ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-primary transition-colors"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p role="alert" className="text-xs text-red-700 pr-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-linear-to-l from-primary to-primary-container text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {isSubmitting ? t('common.saving') : t('auth.resetPassword.submit')}
          </button>
        </form>

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

// useSearchParams must be wrapped in Suspense per the Next 16 docs.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/30 animate-pulse" />
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
