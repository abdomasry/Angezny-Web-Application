// =============================================================================
// React Query client config
// =============================================================================
// Centralized so every component (and any future SSR pre-fetch helper) shares
// the same defaults. The actual instance lives in components/QueryProvider so
// we can hand it to <QueryClientProvider>.
//
// Defaults chosen for this app:
//   staleTime: 60s    — data is considered "fresh" for a minute, so quick
//                       navigation between pages doesn't refetch the same
//                       worker list / categories. The marketplace data
//                       doesn't change second-to-second.
//   gcTime: 5min      — keep cached data 5 minutes after the last component
//                       unsubscribes. Hitting the same page again pulls
//                       instantly from cache.
//   retry: 1          — one retry on failure (network blip), then surface
//                       the error to the user. Not infinite loops.
//   refetchOnWindowFocus: false — most of our data isn't time-sensitive
//                       enough to justify a refetch every time the user
//                       Alt-Tabs back. Live data goes via Socket.IO anyway.
// =============================================================================

import { QueryClient } from '@tanstack/react-query'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}
