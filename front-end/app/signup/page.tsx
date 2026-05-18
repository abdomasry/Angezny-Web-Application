"use client";

// =============================================================================
// /signup — full registration form
// =============================================================================
// Migrated to react-hook-form + zod. Behavior preserved 1:1 from the previous
// useState version: same field set, same backend call, same redirect logic
// (email signups go to /verify-email, phone signups go straight to /).
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Smartphone, Eye, EyeOff, Wallet, User } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { signupSchema, type SignupValues } from "@/lib/schemas";
import SocialAuthButtons from "@/components/SocialAuthButtons";

export default function SignUpPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const t = useTranslations()

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Tab + role are pure UI state — they don't go through validation.
  const [activeTab, setActiveTab] = useState<"mobile" | "email">("email");
  const [submitError, setSubmitError] = useState("");

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      identifier: "",
      password: "",
      confirmPassword: "",
      role: "customer",
    },
    mode: "onTouched",
  });

  const { register, handleSubmit, watch, setValue, formState } = form;
  const { errors, isSubmitting } = formState;
  const role = watch("role");

  const onSubmit = async (values: SignupValues) => {
    setSubmitError("");
    try {
      // identifier is either an email or an Egyptian phone — choose by shape,
      // not by which tab is active (the tab is just a UX hint).
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.identifier);

      const result = await signup({
        firstName: values.firstName,
        lastName: values.lastName,
        ...(looksLikeEmail
          ? { email: values.identifier }
          : { phone: values.identifier }),
        password: values.password,
        confirmPassword: values.confirmPassword,
        role: values.role,
      });

      // Email signups need to verify; phone signups are immediately usable.
      if (result?.requireVerification) {
        router.push("/verify-email");
      } else {
        router.push("/");
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء الحساب",
      );
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden" dir="rtl">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-container/5 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-surface-container-high/40 rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-0 bg-surface-container-lowest rounded-xl overflow-hidden shadow-[24px_0_24px_-12px_rgba(18,28,42,0.06)] border border-outline-variant/15">

        {/* Left Side: Visual Content (Desktop Only) */}
        <div className="hidden md:flex flex-col justify-between p-12 bg-linear-to-br from-primary to-primary-container text-on-primary relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12">
              <Wallet className="w-10 h-10" />
              <h1 className="text-2xl font-bold tracking-tight">{t('brand.longName')}</h1>
            </div>
            <div className="space-y-6 max-w-md">
              <h2 className="text-4xl font-bold leading-tight">{t('auth.signup.marketing.heading')}</h2>
              <p className="text-on-primary-container text-lg leading-relaxed opacity-90">
                {t('auth.signup.marketing.body')}
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
              <span className="text-2xl font-bold block">{t('auth.signin.marketing.users')}</span>
              <span className="text-sm opacity-80">{t('auth.signin.marketing.usersLabel')}</span>
            </div>
            <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
              <span className="text-2xl font-bold block">{t('auth.signin.marketing.providers')}</span>
              <span className="text-sm opacity-80">{t('auth.signin.marketing.providersLabel')}</span>
            </div>
          </div>

          <div className="absolute top-1/2 right-[-20%] w-full h-full bg-white/5 rounded-full blur-2xl transform -translate-y-1/2" />
        </div>

        {/* Right Side: Auth Form */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-surface-container-lowest">
          <div className="mb-8 text-center md:text-right">
            <h3 className="text-3xl font-bold text-on-surface mb-2">{t('auth.signup.title')}</h3>
            <p className="text-on-surface-variant">{t('auth.signup.subtitle')}</p>
          </div>

          {/* Email/Mobile tab — purely cosmetic; the schema accepts either. */}
          <div className="flex p-1 bg-surface-container-low rounded-full mb-6 max-w-xs mx-auto md:mr-0 md:ml-auto">
            <button
              type="button"
              onClick={() => setActiveTab("email")}
              className={`flex-1 py-2 px-6 rounded-full text-sm font-semibold transition-all cursor-pointer ${activeTab === "email" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {t('auth.signin.tabEmail')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mobile")}
              className={`flex-1 py-2 px-6 rounded-full text-sm font-semibold transition-all cursor-pointer ${activeTab === "mobile" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {t('auth.signin.tabPhone')}
            </button>
          </div>

          {/* Role selector — bound to the form's `role` field via setValue. */}
          <div className="flex p-1 bg-surface-container-low rounded-full mb-6 max-w-xs mx-auto md:mr-0 md:ml-auto">
            <button
              type="button"
              onClick={() => setValue("role", "customer", { shouldDirty: true })}
              className={`flex-1 py-2 px-6 rounded-full text-sm font-semibold transition-all cursor-pointer ${role === "customer" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {t('auth.signup.roleCustomer')}
            </button>
            <button
              type="button"
              onClick={() => setValue("role", "worker", { shouldDirty: true })}
              className={`flex-1 py-2 px-6 rounded-full text-sm font-semibold transition-all cursor-pointer ${role === "worker" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {t('auth.signup.roleWorker')}
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-on-surface-variant pr-1" htmlFor="firstName">{t('auth.signup.labelFirstName')}</label>
                <div className="relative">
                  <input
                    id="firstName"
                    className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3.5 focus:ring-2 focus:bg-white transition-all text-right outline-none ${errors.firstName ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"}`}
                    placeholder="الاسم الأول"
                    type="text"
                    autoComplete="given-name"
                    aria-invalid={errors.firstName ? "true" : "false"}
                    {...register("firstName")}
                  />
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 w-5 h-5" />
                </div>
                {errors.firstName && (
                  <p role="alert" className="text-xs text-red-700 pr-1">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-on-surface-variant pr-1" htmlFor="lastName">{t('auth.signup.labelLastName')}</label>
                <div className="relative">
                  <input
                    id="lastName"
                    className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3.5 focus:ring-2 focus:bg-white transition-all text-right outline-none ${errors.lastName ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"}`}
                    placeholder="الاسم الأخير"
                    type="text"
                    autoComplete="family-name"
                    aria-invalid={errors.lastName ? "true" : "false"}
                    {...register("lastName")}
                  />
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 w-5 h-5" />
                </div>
                {errors.lastName && (
                  <p role="alert" className="text-xs text-red-700 pr-1">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* Email/Phone Field — single `identifier` validated for either shape */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-on-surface-variant pr-1" htmlFor="identifier">
                {activeTab === "email" ? t('auth.signin.labelEmail') : t('auth.signin.labelPhone')}
              </label>
              <div className="relative">
                <input
                  id="identifier"
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3.5 focus:ring-2 focus:bg-white transition-all text-right outline-none ${errors.identifier ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"}`}
                  placeholder={activeTab === "email" ? "example@domain.com" : "01xxxxxxxxx"}
                  type={activeTab === "email" ? "email" : "tel"}
                  inputMode={activeTab === "email" ? "email" : "tel"}
                  autoComplete={activeTab === "email" ? "email" : "tel"}
                  dir="ltr"
                  aria-invalid={errors.identifier ? "true" : "false"}
                  {...register("identifier")}
                />
                {activeTab === "email" ? (
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 w-5 h-5" />
                ) : (
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 w-5 h-5" />
                )}
              </div>
              {errors.identifier && (
                <p role="alert" className="text-xs text-red-700 pr-1">{errors.identifier.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-on-surface-variant pr-1" htmlFor="password">{t('auth.signin.labelPassword')}</label>
              <div className="relative">
                <input
                  id="password"
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3.5 focus:ring-2 focus:bg-white transition-all text-right outline-none ${errors.password ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"}`}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  aria-invalid={errors.password ? "true" : "false"}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors cursor-pointer"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="text-xs text-red-700 pr-1">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-on-surface-variant pr-1" htmlFor="confirmPassword">{t('auth.signup.labelConfirmPassword')}</label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  className={`w-full bg-surface-container-low border-none rounded-xl px-5 py-3.5 focus:ring-2 focus:bg-white transition-all text-right outline-none ${errors.confirmPassword ? "ring-2 ring-red-300 focus:ring-red-300" : "focus:ring-primary/20"}`}
                  placeholder="••••••••"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  aria-invalid={errors.confirmPassword ? "true" : "false"}
                  {...register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p role="alert" className="text-xs text-red-700 pr-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            {submitError && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-on-primary py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:bg-primary-container active:scale-[0.98] transition-all mt-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? t('auth.signup.submitting') : t('auth.signup.submit')}
            </button>
          </form>

          {/* Social Logins */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant/30"></div></div>
            <div className="relative flex justify-center text-sm"><span className="px-4 bg-surface-container-lowest text-on-surface-variant">{t('auth.signup.or')}</span></div>
          </div>

          <SocialAuthButtons redirectTo="/" onError={setSubmitError}  />

          <div className="mt-8 text-center">
            <p className="text-on-surface-variant">{t('auth.signup.haveAccount')}
              <Link className="text-primary font-bold hover:underline mr-1" href="/signin">{t('auth.signup.signin')}</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
