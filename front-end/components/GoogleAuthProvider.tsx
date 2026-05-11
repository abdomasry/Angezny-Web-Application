'use client'

// Client-side wrapper around @react-oauth/google's GoogleOAuthProvider.
// The root layout is a Server Component (it does i18n on the server), so it
// can't import this provider directly — we expose a thin "use client"
// boundary here and mount it from the layout.
//
// If NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't set we render children unwrapped.
// That way the rest of the app keeps working in dev before the OAuth app
// is created — the Google button just falls back to a disabled state.

import { GoogleOAuthProvider } from '@react-oauth/google'

export default function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    return <>{children}</>
  }
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
}
