'use client'

// Google + Facebook sign-in buttons. Used by /signin and /signup so the
// styling and the post-success behavior stay identical between the two
// pages. On success, both providers POST a token to our backend, which
// returns the same { token, user } shape /auth/signin returns; we hand
// that off to the auth context's `socialLogin` to update state and
// localStorage.
//
// Why not use Google's pre-styled button widget?
// We want the same visual rhythm as the rest of the auth form (matching
// height, border, Arabic text). useGoogleLogin gives us the OAuth flow
// without forcing Google's widget styling.
//
// Facebook flow uses the official JS SDK loaded on demand — a tiny script
// loader rather than a wrapper package, so we don't pin to a stale npm
// dependency that might lag behind FB API changes.

import { useEffect, useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const FB_SDK_VERSION = 'v19.0'

// Lazy-load the Facebook JS SDK exactly once. Subsequent calls return the
// already-resolved Promise so multiple buttons can await the same load.
let fbSdkPromise: Promise<any> | null = null
function loadFacebookSdk(appId: string): Promise<any> {
  if (fbSdkPromise) return fbSdkPromise
  fbSdkPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'))
    // Already loaded in this tab? Just resolve.
    if ((window as any).FB) {
      resolve((window as any).FB)
      return
    }
    // FB asks us to define this global before injecting the script.
    ;(window as any).fbAsyncInit = function () {
      ;(window as any).FB.init({
        appId,
        cookie: false,
        xfbml: false,
        version: FB_SDK_VERSION,
      })
      resolve((window as any).FB)
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => reject(new Error('Failed to load Facebook SDK'))
    document.body.appendChild(script)
  })
  return fbSdkPromise
}

interface Props {
  // Where to redirect after a successful sign-in. Same default as the
  // existing email/password forms.
  redirectTo?: string
  onError?: (msg: string) => void
}

export default function SocialAuthButtons({ redirectTo = '/', onError }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { socialLogin } = useAuth()

  const [busy, setBusy] = useState<'google' | 'facebook' | null>(null)
  const fbAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID

  // ─── Google ───────────────────────────────────────────────────
  // useGoogleLogin returns a function that triggers Google's OAuth popup.
  // We use the implicit `flow: 'auth-code'` would require a backend
  // exchange; instead we use the default which gives us an `access_token`,
  // but for ID-token-based verification we use `flow: 'implicit'` and ask
  // for openid + email + profile, then call /tokeninfo? Actually the
  // simplest path is `useGoogleLogin` with default settings which calls
  // our onSuccess with an `access_token`. We send that to a tokeninfo
  // request to the People API… too complex.
  //
  // Better: use the GoogleLogin widget OR call the lower-level GIS popup
  // ourselves. Here we use useGoogleLogin with `flow: 'implicit'` and
  // forward the `credential` field — wait, that's only on the widget.
  //
  // Cleanest in practice: call window.google.accounts.id.prompt() via
  // the widget. We render a hidden GoogleLogin and click it programmatically
  // — but that breaks our custom styling. So we use useGoogleLogin's
  // `onSuccess` with `tokenResponse.access_token` and POST it to a backend
  // endpoint that calls Google's userinfo API to get the user. We keep
  // ID-token verification too via the alt path.
  //
  // To keep the contract simple and the security strong: we'll request an
  // ID token by using `useGoogleLogin({ flow: 'auth-code' })` is wrong;
  // the right call is the credentials-flow widget. To match our custom
  // button, we use `useGoogleLogin({ scope: 'openid email profile' })`
  // and send the access_token to the backend, which calls Google's
  // tokeninfo endpoint. That's a small backend tweak — but we already
  // wrote the backend to accept an idToken. So we adapt: ask Google for
  // an id token via the `credential` callback through the lower-level
  // GIS SDK.
  //
  // Implementation choice: use `useGoogleLogin` to open the popup and
  // get the access_token, then POST { accessToken } to the backend.
  // We'll add a small change there too.
  const startGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setBusy('google')
        // We send the access token to our backend, which calls Google's
        // tokeninfo / userinfo to verify it and read the user's profile.
        await socialLogin('google', { accessToken: tokenResponse.access_token })
        router.push(redirectTo)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google sign-in failed'
        onError?.(msg)
      } finally {
        setBusy(null)
      }
    },
    onError: () => onError?.('تعذّر تسجيل الدخول بحساب Google'),
    // We ask for openid+email+profile so the backend's userinfo call
    // returns the email and the email_verified flag.
    scope: 'openid email profile',
  })

  // ─── Facebook ─────────────────────────────────────────────────
  const handleFacebook = async () => {
    if (!fbAppId) {
      onError?.('Facebook sign-in is not configured (NEXT_PUBLIC_FACEBOOK_APP_ID)')
      return
    }
    setBusy('facebook')
    try {
      const FB = await loadFacebookSdk(fbAppId)
      // FB.login pops a window asking for permission. We request `email`
      // explicitly because the default scope is just `public_profile`.
      const response: any = await new Promise((resolve) =>
        FB.login(resolve, { scope: 'public_profile,email' })
      )
      if (response?.authResponse?.accessToken) {
        await socialLogin('facebook', {
          accessToken: response.authResponse.accessToken,
        })
        router.push(redirectTo)
      } else {
        onError?.('تم إلغاء تسجيل الدخول بحساب Facebook')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Facebook sign-in failed'
      onError?.(msg)
    } finally {
      setBusy(null)
    }
  }

  // Pre-load FB SDK so the first click doesn't have to wait for the script.
  // No-op if not configured.
  useEffect(() => {
    if (fbAppId) loadFacebookSdk(fbAppId).catch(() => { /* ignore */ })
  }, [fbAppId])

  const baseBtn =
    'flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" disabled={busy !== null} onClick={() => startGoogle()} className={baseBtn}>
        {busy === 'google' ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
        )}
        <span>{t('auth.signin.google')}</span>
      </button>

      <button type="button" disabled={busy !== null} onClick={handleFacebook} className={baseBtn}>
        {busy === 'facebook' ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073C0 18.063 4.388 23.027 10.125 23.927v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953h-1.513c-1.491 0-1.956.925-1.956 1.875v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.063 24 12.073" />
          </svg>
        )}
        <span>{t('auth.signin.facebook')}</span>
      </button>
    </div>
  )
}
