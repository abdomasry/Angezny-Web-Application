'use client'

// =============================================================================
// QueryProvider — wraps the app with TanStack Query's <QueryClientProvider>
// =============================================================================
// In Next.js App Router, the root layout is a Server Component, so the
// QueryClient (which holds React state) has to live inside a 'use client'
// boundary. This component is that boundary.
//
// We intentionally create the client inside useState so it's stable across
// re-renders without sharing it across requests on the server (when SSR'd).
// Pattern recommended by the TanStack Query docs for Next.js App Router.
// =============================================================================

import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { makeQueryClient } from '@/lib/query-client'

export default function QueryProvider({ children }: { children: ReactNode }) {
  // useState ensures the client survives re-renders without being recreated.
  // The lazy initializer runs exactly once per provider mount.
  const [client] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* Devtools mount only in dev — they auto-detect NODE_ENV.
          Bottom-right corner button toggles the panel. */}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  )
}
