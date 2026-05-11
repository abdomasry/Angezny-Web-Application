// Socket.IO client singleton.
//
// Why a singleton and not per-component state:
// - Next.js Fast Refresh re-runs module code on every save. If we instantiate
//   io() at module top-level without a guard, every edit creates a new
//   WebSocket connection, leaking sockets and causing weird "I received the
//   same message 3 times" bugs.
// - We attach the Socket to globalThis.__socket so it survives HMR re-imports.
//
// Usage:
//   const socket = getSocket()       // connects lazily on first call
//   socket.emit('chat:send', ...)
//   socket.on('chat:message', ...)
//   disconnectSocket()                // on logout

import { io, Socket } from 'socket.io-client'

// Extend globalThis with our custom slot. Prefixed with __ to make intent
// obvious; prefixed with _APP to namespace away from anything else.
declare global {
  var __APP_SOCKET__: Socket | null | undefined
}

// Socket.IO needs to connect to the backend ORIGIN (no /api suffix), while
// the REST helper at lib/api.ts uses the full /api base. We derive the
// origin from NEXT_PUBLIC_API_URL by stripping a trailing /api so the same
// env var serves both — set it once on Vercel:
//   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api
//
// Falls back to localhost:5000 in dev when the env var isn't set.
//
// Bug history: this used to be hardcoded to http://localhost:5000, which
// silently broke chat in production — the browser tried to open a WebSocket
// to the user's own machine, the connection failed, and sendMessage emits
// were dropped on the floor.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
const BASE_URL = API_URL.replace(/\/api\/?$/, '')

// Read the latest token from localStorage every time we (re)connect, so
// logging out and back in picks up the new token automatically.
const getToken = () => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

/**
 * Lazily returns the shared socket. Returns null during SSR or before login.
 * Safe to call from React render — won't cause infinite loops because the
 * same instance is returned after first connection.
 */
export function getSocket(): Socket | null {
  // SSR guard: Next still runs an initial server render on client pages.
  if (typeof window === 'undefined') return null

  // Already have a connected (or connecting) socket? Reuse it.
  if (globalThis.__APP_SOCKET__?.connected || globalThis.__APP_SOCKET__?.active) {
    return globalThis.__APP_SOCKET__
  }

  const token = getToken()
  if (!token) return null

  // Clean up any stale socket before creating a new one (e.g. after HMR
  // invalidated the old connection or after a logout/login cycle).
  if (globalThis.__APP_SOCKET__) {
    globalThis.__APP_SOCKET__.disconnect()
    globalThis.__APP_SOCKET__ = null
  }

  const socket = io(BASE_URL, {
    // auth goes in the handshake payload, NOT the URL query string, so the
    // token doesn't end up in access logs.
    auth: { token },
    // Prefer WebSocket but allow long-polling fallback. Some production hosts
    // (Cloudflare-fronted, certain free tiers) block raw WS upgrades; without
    // 'polling' here the connection silently fails and chat looks broken.
    transports: ['websocket', 'polling'],
    // Mild backoff on disconnect so we don't hammer the server on network blips.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  globalThis.__APP_SOCKET__ = socket
  return socket
}

/**
 * Explicitly disconnect and forget the socket. Call from logout handler.
 */
export function disconnectSocket() {
  if (globalThis.__APP_SOCKET__) {
    globalThis.__APP_SOCKET__.disconnect()
    globalThis.__APP_SOCKET__ = null
  }
}
