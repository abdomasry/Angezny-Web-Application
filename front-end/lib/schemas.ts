// =============================================================================
// SHARED ZOD SCHEMAS — single source of truth for client-side form validation
// =============================================================================
// Each form across the app reuses these primitives so:
//   1. The Egyptian phone regex / password rules live in ONE place — change
//      them here and every form updates.
//   2. Arabic error messages stay consistent.
//   3. Backend validators can mirror these shapes if we ever port to TS+zod
//      on the server.
//
// Usage in a form:
//   const form = useForm<z.infer<typeof signinSchema>>({
//     resolver: zodResolver(signinSchema),
//     defaultValues: { identifier: '', password: '' },
//   })
// =============================================================================

import { z } from 'zod'

// ─── Reusable field validators ─────────────────────────────────────

// Egyptian mobile, with or without the +20 country code.
//   01[0125]<8 digits>   → 010 / 011 / 012 / 015 prefixes
//   +20<10 digits>       → international form
const EG_PHONE_REGEX = /^(01[0125][0-9]{8}|\+20\d{10})$/

// "identifier" = email OR Egyptian phone. signin/signup/forgot-password all
// accept either, so this lives once.
export const identifierField = z
  .string({ message: 'هذا الحقل مطلوب' })
  .trim()
  .min(1, 'هذا الحقل مطلوب')
  .refine(
    (value) => z.string().email().safeParse(value).success || EG_PHONE_REGEX.test(value),
    { message: 'يرجى إدخال بريد إلكتروني أو رقم هاتف صحيح' },
  )

export const emailField = z
  .string({ message: 'البريد الإلكتروني مطلوب' })
  .trim()
  .min(1, 'البريد الإلكتروني مطلوب')
  .email('بريد إلكتروني غير صحيح')

export const phoneField = z
  .string({ message: 'رقم الهاتف مطلوب' })
  .trim()
  .min(1, 'رقم الهاتف مطلوب')
  .regex(EG_PHONE_REGEX, 'رقم هاتف مصري غير صحيح')

// Password must be at least 6 chars — matches the existing backend rule.
// Tighten here (and on the server) once the team is ready to roll passwords.
export const passwordField = z
  .string({ message: 'كلمة المرور مطلوبة' })
  .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')

// 6-digit code used for email verification + password reset.
export const codeField = z
  .string({ message: 'الكود مطلوب' })
  .trim()
  .regex(/^\d{6}$/, 'الكود يجب أن يكون 6 أرقام')

// Required Arabic name (firstName, lastName).
export const nameField = z
  .string({ message: 'الاسم مطلوب' })
  .trim()
  .min(2, 'الاسم قصير جداً')
  .max(40, 'الاسم طويل جداً')

// Optional bio / description — capped to keep payloads sane.
export const bioField = z
  .string()
  .trim()
  .max(500, 'النص طويل جداً (الحد الأقصى 500 حرف)')
  .optional()
  .or(z.literal(''))

// Positive money amount stored as a number.
export const priceField = z
  .number({ message: 'يرجى إدخال السعر' })
  .positive('السعر يجب أن يكون أكبر من صفر')

// Optional URL (Cloudinary uploads or pasted links).
export const urlField = z
  .string()
  .trim()
  .url('رابط غير صحيح')

// MongoDB ObjectId-shaped string. Used when a form references a category id.
export const objectIdField = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'معرّف غير صحيح')

// ─── Composite schemas, one per form ───────────────────────────────

// /signin — accept email OR phone + password.
export const signinSchema = z.object({
  identifier: identifierField,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

// /signup — full registration. role default is "customer"; the form toggles it.
// No agreeToTerms checkbox in the current UI; add the field here AND a checkbox
// in the form together when the team decides to require it.
export const signupSchema = z
  .object({
    firstName: nameField,
    lastName: nameField,
    identifier: identifierField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'يرجى إعادة إدخال كلمة المرور'),
    role: z.enum(['customer', 'worker'], { message: 'اختر نوع الحساب' }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  })

// /verify-email — entered after signup
export const verifyEmailSchema = z.object({
  code: codeField,
})

// /forgot-password — only one field
export const forgotPasswordSchema = z.object({
  identifier: identifierField,
})

// /reset-password — sets a new password using the JWT from the email link.
// confirmPassword must match; the token comes from the URL not from the form.
export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'يرجى إعادة إدخال كلمة المرور'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  })

// /checkout — order placement form
export const checkoutSchema = z.object({
  scheduledDate: z.string().min(1, 'يرجى اختيار التاريخ'),
  address: z.string().trim().min(5, 'العنوان قصير جداً'),
  notes: z.string().trim().max(500, 'الملاحظات طويلة جداً').optional().or(z.literal('')),
  paymentMode: z.enum(['cash_on_delivery', 'card']),
  couponCode: z.string().trim().optional().or(z.literal('')),
  // Optional pin chosen via the map picker. Both must be present together
  // — set when the customer used the "تحديد على الخريطة" button. Workers
  // see this on the order card so they can navigate to the spot.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

// /profile/edit — customer profile editor.
// Phone, email, city, area, and bio are all optional — the user can save
// with any subset filled.
export const profileEditSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  // Email is only writable for phone-only users (those who haven't bound an
  // email yet). The form disables the input otherwise; we still validate the
  // shape if a value was somehow submitted.
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(v => !v || z.string().email().safeParse(v).success, {
      message: 'بريد إلكتروني غير صحيح',
    }),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(v => !v || EG_PHONE_REGEX.test(v), {
      message: 'رقم هاتف مصري غير صحيح',
    }),
  city: z.string().trim().max(60, 'النص طويل جداً').optional().or(z.literal('')),
  area: z.string().trim().max(60, 'النص طويل جداً').optional().or(z.literal('')),
  bio: bioField,
})

// /support — new ticket form. We DON'T put `type` in the schema because the
// type picker is a custom card UI (not a regular input) and starts unselected.
// The form keeps `type` in plain state and checks it before calling
// handleSubmit; everything else routes through RHF + zod here.
export const supportTicketSchema = z.object({
  title: z.string().trim().min(3, 'العنوان قصير جداً').max(150, 'العنوان طويل جداً'),
  message: z.string().trim().min(10, 'وصف المشكلة قصير جداً').max(2000, 'الوصف طويل جداً'),
  targetUserId: z.string().trim().optional().or(z.literal('')),
  targetServiceId: z.string().trim().optional().or(z.literal('')),
  targetOrderId: z.string().trim().optional().or(z.literal('')),
})

// Worker dashboard service form — handles fixed/hourly/range price modes.
// We use a discriminated union so the validator only requires the relevant
// price field for the chosen mode. (`refine` would also work but the union
// keeps the error message attached to the right path.)
export const serviceFormSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم الخدمة قصير جداً').max(100, 'الاسم طويل جداً'),
    description: z.string().trim().max(1000, 'الوصف طويل جداً').optional().or(z.literal('')),
    categoryId: objectIdField,
    typeofService: z.enum(['fixed', 'hourly', 'range']),
    price: z.number().nonnegative().optional(),
    priceRange: z
      .object({
        min: z.number().nonnegative(),
        max: z.number().nonnegative(),
      })
      .optional(),
    images: z.array(z.string().url()).max(6, 'الحد الأقصى 6 صور'),
  })
  .superRefine((data, ctx) => {
    if (data.typeofService === 'range') {
      if (!data.priceRange?.min || data.priceRange.min <= 0) {
        ctx.addIssue({ code: 'custom', message: 'حدّد أقل سعر للنطاق', path: ['priceRange', 'min'] })
      }
      if (!data.priceRange?.max || data.priceRange.max <= 0) {
        ctx.addIssue({ code: 'custom', message: 'حدّد أعلى سعر للنطاق', path: ['priceRange', 'max'] })
      }
      if (
        data.priceRange?.min &&
        data.priceRange?.max &&
        data.priceRange.min > data.priceRange.max
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'أعلى سعر يجب أن يكون أكبر من أقل سعر',
          path: ['priceRange', 'max'],
        })
      }
    } else {
      if (!data.price || data.price <= 0) {
        ctx.addIssue({ code: 'custom', message: 'حدّد سعر الخدمة', path: ['price'] })
      }
    }
  })

// LicensesEditor inline form — minimal; admin re-validates on submit.
export const licenseFormSchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم الرخصة'),
  number: z.string().trim().max(80).optional().or(z.literal('')),
  issuedBy: z.string().trim().max(120).optional().or(z.literal('')),
  fileUrl: z.string().url('ارفع ملف الرخصة (PDF أو صورة)'),
})

// Inferred TypeScript types — use `z.infer<typeof signupSchema>` in components
// to get a fully typed form value object.
export type SigninValues = z.infer<typeof signinSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type VerifyEmailValues = z.infer<typeof verifyEmailSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
export type CheckoutValues = z.infer<typeof checkoutSchema>
export type ProfileEditValues = z.infer<typeof profileEditSchema>
export type SupportTicketValues = z.infer<typeof supportTicketSchema>
export type ServiceFormValues = z.infer<typeof serviceFormSchema>
export type LicenseFormValues = z.infer<typeof licenseFormSchema>
