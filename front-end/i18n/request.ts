// =============================================================================
// next-intl request config — single source of truth for the active locale
// =============================================================================
// Runs on the server for every request and returns the messages bundle that
// will be exposed via `useTranslations`. We don't use URL-based routing
// (no `/ar/...` vs `/en/...` prefixes) — too invasive a change for the
// existing app. Locale is stored in a `NEXT_LOCALE` cookie set by the
// language switcher.
//
// Add a new locale:
//   1. Add it to `LOCALES` below
//   2. Drop a `messages/<locale>.json` file with the same shape as ar.json
// =============================================================================

import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const LOCALES = ['ar', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'ar'

// RTL languages — used to set `<html dir>` and to switch UI direction.
export const RTL_LOCALES: readonly Locale[] = ['ar']
export const isRtl = (l: Locale) => RTL_LOCALES.includes(l)

export default getRequestConfig(async () => {
  // cookies() is async in Next.js 15+ App Router.
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value

  const locale: Locale =
    LOCALES.includes(cookieLocale as Locale) ? (cookieLocale as Locale) : DEFAULT_LOCALE

  return {
    locale,
    // Dynamic import so each locale's messages live in its own bundle.
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
