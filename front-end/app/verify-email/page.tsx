"use client"

// =============================================================================
// /verify-email — 6-digit code entry
// =============================================================================
// Migrated to react-hook-form + zod. The 6-box UX is preserved (each digit is
// its own input with auto-advance + backspace navigation), but the actual
// form state is a single `code` string — the boxes write into a tiny local
// `digits` array that we project into the form value with setValue().
//
// Why the dual representation:
//   - RHF + zod validate one string field cleanly (codeField regex).
//   - Users still get the digit-by-digit cursor experience of the original.
// =============================================================================

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { verifyEmailSchema, type VerifyEmailValues } from "@/lib/schemas"

export default function VerifyEmailPage() {
  const router = useRouter()
  const t = useTranslations()
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  // Local "boxes" state — purely visual. The authoritative value is `code`
  // in the RHF form below.
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [submitError, setSubmitError] = useState("")
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  const form = useForm<VerifyEmailValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { code: "" },
    mode: "onTouched",
  })
  const { handleSubmit, setValue, formState, trigger } = form
  const { errors, isSubmitting } = formState

  // When a user types a digit, write it into both the visual boxes and the
  // form value. Trigger validation so the inline error clears when the code
  // becomes complete.
  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...digits]
    next[index] = value.slice(-1)
    setDigits(next)
    setValue("code", next.join(""), { shouldValidate: true, shouldDirty: true })
    if (value && index < 5) {
      inputs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  // Allow pasting the whole code into any box. We strip non-digits so users
  // can paste "123 456" or "123-456" from a verification email and still get
  // the right value. Up to 6 digits fill the boxes from `index` onward; the
  // cursor lands on the next empty box (or the last filled one).
  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "")
    if (!pasted) return
    e.preventDefault()
    const next = [...digits]
    for (let i = 0; i < pasted.length && index + i < 6; i++) {
      next[index + i] = pasted[i]
    }
    setDigits(next)
    setValue("code", next.join(""), { shouldValidate: true, shouldDirty: true })
    const nextFocus = Math.min(index + pasted.length, 5)
    inputs.current[nextFocus]?.focus()
  }

  const onSubmit = async (values: VerifyEmailValues) => {
    setSubmitError("")
    try {
      await api.postWithAuth("/auth/verify-email", { code: values.code })
      router.push("/")
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "كود غير صحيح")
    }
  }

  const handleResend = async () => {
    setResendLoading(true)
    setResendSuccess(false)
    setSubmitError("")
    try {
      await api.postWithAuth("/auth/resend-verification-code", {})
      setResendSuccess(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-background flex flex-col items-center justify-center px-4"
    >
      <div className="w-full max-w-md text-center">

        {/* Icon */}
        <div className="w-20 h-20 light-green rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-2">{t('auth.verifyEmail.title')}</h1>
        <p className="text-muted-foreground mb-8">
          {t('auth.verifyEmail.subtitle')}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* 6 digit inputs — visual layer; the actual form value lives
              in the hidden `code` registered field below. */}
          <div className="flex justify-center gap-3 mb-3" dir="ltr">
            {digits.map((digit, index) => (
              <Input
                key={index}
                ref={(el) => { inputs.current[index] = el }}
                type="text"
                inputMode="numeric"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={(e) => handlePaste(index, e)}
                onBlur={() => trigger("code")}
                className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl ${
                  errors.code ? "ring-2 ring-red-300 border-red-300" : ""
                }`}
                maxLength={1}
                aria-invalid={errors.code ? "true" : "false"}
              />
            ))}
          </div>

          {errors.code && (
            <p role="alert" className="text-sm text-red-700 mb-3">
              {errors.code.message}
            </p>
          )}

          {submitError && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
              {submitError}
            </p>
          )}

          {resendSuccess && (
            <p className="text-sm text-green-600 mb-4">{t('auth.verifyEmail.resent')}</p>
          )}

          <Button
            type="submit"
            className="w-full h-14 light-green text-primary-foreground text-lg rounded-xl"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('auth.verifyEmail.submitting') : t('auth.verifyEmail.submit')}
          </Button>
        </form>

        {/* Resend code */}
        <button
          type="button"
          onClick={handleResend}
          disabled={resendLoading}
          className="mt-4 text-sm hover:underline"
          style={{ color: "#148F77" }}
        >
          {resendLoading ? t('auth.verifyEmail.resending') : t('auth.verifyEmail.resend')}
        </button>

      </div>
    </main>
  )
}
