'use server'

// =============================================================================
// setLocale — server action that writes the NEXT_LOCALE cookie
// =============================================================================
// next-intl resolves the active locale on each request from this cookie
// (see i18n/request.ts). The language switcher in the Navbar invokes this
// action when the user picks a language; we then call router.refresh() on
// the client so the next render picks up the new messages bundle.
// =============================================================================

import { cookies } from 'next/headers'
import { LOCALES, type Locale } from '@/i18n/request'

export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return

  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, {
    // One year — language preference is stable, no need to expire often.
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    httpOnly: false, // needs to be readable by the client switcher's UX state
  })
}
