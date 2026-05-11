'use client'
// Client Component because we use hooks (useAuth) and event handlers (onClick)

import {
  Search, Bell, Globe, Home, Grid3x3, Receipt, LogIn,
  LogOut, UserCircle, LayoutDashboard, BellRing, Check, Briefcase, Tag,
  MessageSquare, LifeBuoy, Heart,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/chat-context'
import { api } from '@/lib/api'
import { usePathname, useRouter } from 'next/navigation'
import { DropdownMenu } from 'radix-ui'
import { setLocale } from '@/app/actions/set-locale'
import type { Locale } from '@/i18n/request'

// Shape of one item in the autocomplete dropdown.
// Two kinds: an individual service (search by name) or a category (filter).
type SearchSuggestion =
  | { kind: 'service'; _id: string; name: string; categoryName: string | null }
  | { kind: 'category'; _id: string; name: string }
// ^^^ Radix UI DropdownMenu — gives us accessible dropdown menus for free.
// We import from the monolithic 'radix-ui' package (same pattern as button.tsx uses for Slot).
// Then we use it as: DropdownMenu.Root, DropdownMenu.Trigger, DropdownMenu.Content, etc.

// Shared styles for dropdown content and items — extracted here to avoid repetition.
// Think of these as "CSS class presets" we reuse across all 3 dropdowns.
const dropdownContentStyles =
  'bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/15 min-w-[240px] p-2 z-[100] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
// ^^^ Let's break this down:
// - bg-surface-container-lowest: white background from your design system
// - rounded-xl shadow-lg: rounded corners + drop shadow
// - border border-outline-variant/15: subtle border
// - min-w-[240px]: minimum width so it doesn't look too narrow
// - z-[100]: appears above the navbar (which is z-50)
// - data-[state=open/closed]: Radix adds these attributes automatically.
//   We use them to animate the dropdown opening and closing.

const dropdownItemStyles =
  'rounded-lg px-3 py-2.5 flex items-center gap-3 flex-row cursor-pointer outline-none text-sm text-on-surface transition-colors data-[highlighted]:bg-surface-container-high'
// ^^^ data-[highlighted] is Radix's way of styling the currently focused/hovered item.
// It replaces hover: and focus: — Radix manages the highlight state for us,
// including keyboard navigation (arrow keys move the highlight).

export default function Navbar() {
  const { user, isLoggedIn, isLoading, logout } = useAuth()

  const pathname = usePathname();
  const router = useRouter();
  // i18n: t() looks up keys from the active locale's messages bundle.
  // We pull the namespaces we need on this page once at the top.
  const t = useTranslations()
  const activeLocale = useLocale() as Locale

  // Locale switcher — writes the cookie via a server action, then refreshes
  // the route so the next render reads the new messages bundle.
  const handleLocaleChange = async (next: Locale) => {
    if (next === activeLocale) return
    await setLocale(next)
    router.refresh()
  }
  const supportHref = user?.role === 'admin' ? '/admin?section=support' : '/support'
  const isSupportPath = pathname?.startsWith('/support')

  const getInitial = () => user?.firstName?.charAt(0) || '?'

  // ===== SEARCH AUTOCOMPLETE STATE =====
  // searchQuery: what the user is typing
  // suggestions: items returned from /api/search/suggest
  // showSuggestions: controls dropdown visibility (hidden on outside click)
  // searchRef: used to detect clicks outside the search box so we can close the dropdown
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Debounced autocomplete fetch.
  // We wait 250ms after the last keystroke before hitting the API — keeps the
  // server from drowning while the user is mid-word. Cleanup on re-run cancels
  // the pending timer (React effect cleanup pattern).
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(() => {
      api.get(`/search/suggest?q=${encodeURIComponent(q)}`)
        .then((data: { services: any[]; categories: any[] }) => {
          const combined: SearchSuggestion[] = [
            ...data.services.map(s => ({
              kind: 'service' as const,
              _id: s._id,
              name: s.name,
              categoryName: s.categoryName,
            })),
            ...data.categories.map(c => ({
              kind: 'category' as const,
              _id: c._id,
              name: c.name,
            })),
          ]
          setSuggestions(combined)
        })
        .catch(err => console.error('Search suggest failed:', err))
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Close the dropdown when the user clicks anywhere outside the search box.
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Fire-and-forget search logger. Feeds the "الأكثر بحثاً" chips on the
  // home page. We don't await this or surface errors — the user shouldn't
  // wait on analytics before their search navigates.
  const logSearch = (query: string, kind: 'service' | 'category' | 'text') => {
    api.post('/search/log', { query, kind }).catch(() => { /* ignore */ })
  }

  // Click handler for a suggestion: route to /services with the right query param.
  // - service → ?q=<name> (filters to services with that name)
  // - category → ?category=<id> (filters to that category)
  const handleSelectSuggestion = (s: SearchSuggestion) => {
    setShowSuggestions(false)
    setSearchQuery('')
    logSearch(s.name, s.kind)
    if (s.kind === 'service') {
      router.push(`/services?q=${encodeURIComponent(s.name)}`)
    } else {
      router.push(`/services?category=${s._id}`)
    }
  }

  // Enter submits the raw text as a service-name search, even if no suggestion was picked.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setShowSuggestions(false)
    setSearchQuery('')
    logSearch(q, 'text')
    router.push(`/services?q=${encodeURIComponent(q)}`)
  }

  // ===== NOTIFICATIONS + CHAT =====
  // Both come from ChatContext now. This replaces the old local fetch because
  // the context subscribes to the 'notification:new' socket event, which means
  // bell badge updates live instead of only on page load.
  const {
    notifications,
    unreadNotificationCount: unreadCount,
    markNotificationsRead,
    totalUnread: totalChatUnread,
  } = useChat()

  const handleMarkAllRead = markNotificationsRead

  return (
    <>
      {/* ===== TOP NAVIGATION BAR ===== */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-nav border-b border-border/10">
        <div className="flex flex-row justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">

          {/* --- Left side: Logo + Desktop Navigation Links --- */}
          <div className="flex items-center gap-8 flex-row">
            <Link href="/" className="text-2xl font-bold text-primary">
              {t('brand.name')}
            </Link>
            <div className="hidden md:flex flex-row gap-6">
              <Link href="/" className={pathname === '/' ? "text-primary font-bold border-b-2 border-primary pb-1" : "text-on-surface hover:text-primary transition-colors"}>
                {t('common.home')}
              </Link>
              <Link href="/services" className={pathname === '/services' ? "text-primary font-bold border-b-2 border-primary pb-1" : "text-on-surface hover:text-primary transition-colors"}>
                {t('common.services')}
              </Link>
              <Link href="/providers" className={pathname === '/providers' ? "text-primary font-bold border-b-2 border-primary pb-1" : "text-on-surface hover:text-primary transition-colors"}>
                {t('common.providers')}
              </Link>
              <Link href={supportHref} className={isSupportPath ? "text-primary font-bold border-b-2 border-primary pb-1" : "text-on-surface hover:text-primary transition-colors"}>
                {t('common.support')}
              </Link>
            </div>
          </div>

          {/* --- Right side: Search + Auth-dependent area --- */}
          <div className="flex items-center gap-4 flex-row">
            {/* Search bar with autocomplete — always visible on sm+ */}
            <div ref={searchRef} className="relative hidden sm:block">
              <form onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  placeholder={t('common.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  className="bg-surface-container-low border-none rounded-full py-2 pr-10 pl-4 w-64 focus:ring-2 focus:ring-primary/20 text-right outline-none"
                />
                <Search className="absolute right-3 top-2 w-5 h-5 text-on-surface-variant pointer-events-none" />
              </form>

              {/* Autocomplete dropdown — only renders when there's input AND suggestions AND user hasn't clicked away */}
              {showSuggestions && searchQuery.trim() && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/15 z-[100] overflow-hidden">
                  {suggestions.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm text-on-surface-variant">{t('services.noResults')}</p>
                    </div>
                  ) : (
                    <div className="max-h-[320px] overflow-y-auto py-1">
                      {/* Services group */}
                      {suggestions.some(s => s.kind === 'service') && (
                        <>
                          <p className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">الخدمات</p>
                          {suggestions.filter(s => s.kind === 'service').map(s => (
                            <button
                              key={`svc-${s._id}`}
                              type="button"
                              onClick={() => handleSelectSuggestion(s)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-container-high transition-colors text-right"
                            >
                              <Briefcase className="w-4 h-4 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-on-surface truncate">{s.name}</p>
                                {s.kind === 'service' && s.categoryName && (
                                  <p className="text-xs text-on-surface-variant truncate">{s.categoryName}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </>
                      )}

                      {/* Categories group */}
                      {suggestions.some(s => s.kind === 'category') && (
                        <>
                          <p className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wide border-t border-outline-variant/10 mt-1">الفئات</p>
                          {suggestions.filter(s => s.kind === 'category').map(s => (
                            <button
                              key={`cat-${s._id}`}
                              type="button"
                              onClick={() => handleSelectSuggestion(s)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-container-high transition-colors text-right"
                            >
                              <Tag className="w-4 h-4 text-primary shrink-0" />
                              <p className="flex-1 text-sm text-on-surface truncate">{s.name}</p>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* === AUTH-DEPENDENT SECTION === */}
            {isLoading ? (
              <div className="w-10 h-10 rounded-full bg-primary/30 animate-pulse" />
            ) : isLoggedIn ? (
              // STATE: LOGGED IN — Messages + Bell dropdown + Language dropdown + Avatar dropdown
              <>
                <div className="flex gap-2">

                  {/* ========== MESSAGES LINK ========== */}
                  {/* Direct link to /messages (the inbox). Shows a red badge
                      with the unread-messages count. Live-updated via ChatContext
                      — when a new message arrives, this number bumps without refresh. */}
                  <Link
                    href="/messages"
                    className="relative p-2 rounded-full hover:bg-surface-container-high transition-colors"
                    title="الرسائل"
                  >
                    <MessageSquare className="w-5 h-5 text-primary" />
                    {totalChatUnread > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {totalChatUnread > 9 ? '9+' : totalChatUnread}
                      </span>
                    )}
                  </Link>

                  {/* ========== NOTIFICATION BELL DROPDOWN ========== */}
                  {/* DropdownMenu.Root manages the open/close state internally.
                      No useState needed! Radix handles everything. */}
                  <DropdownMenu.Root>
                    {/* Trigger: the element you click to open the dropdown.
                        asChild means "don't create a new element, use my child as the trigger."
                        This keeps our existing <button> as-is, just adds click-to-open behavior. */}
                    <DropdownMenu.Trigger asChild>
                      {/* We wrap in a relative div so we can position the badge absolutely
                          on top of the bell icon. The badge only shows when unreadCount > 0. */}
                      <button className="relative p-2 rounded-full hover:bg-surface-container-high transition-colors cursor-pointer">
                        <Bell className="w-5 h-5 text-primary" />
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {/* Show "9+" if more than 9, otherwise show the exact number */}
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </button>
                    </DropdownMenu.Trigger>

                    {/* Portal: renders the dropdown at the document root (outside the navbar DOM).
                        This prevents clipping issues if a parent has overflow:hidden. */}
                    <DropdownMenu.Portal>
                      {/* Content: the actual dropdown panel */}
                      <DropdownMenu.Content
                        className={dropdownContentStyles}
                        align="end"    // Aligns to the end (left in RTL) of the trigger
                        sideOffset={8} // 8px gap between trigger and dropdown
                      >
                        {/* ===== NOTIFICATION HEADER =====
                            Shows the title "الإشعارات" on the left (visually right in RTL)
                            and a "Mark all as read" button when there are unread notifications. */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/15">
                          <span className="text-sm font-bold text-on-surface">الإشعارات</span>
                          {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline">
                              تعيين الكل كمقروء
                            </button>
                          )}
                        </div>

                        {/* ===== NOTIFICATION LIST or EMPTY STATE =====
                            Conditional rendering: if array is empty → show empty state,
                            otherwise → map over notifications and render each one. */}
                        {notifications.length === 0 ? (
                          // Empty state — same style as before, just inside the conditional.
                          // We still expose a "view full page" link so the layout stays
                          // discoverable; the page itself shows the same empty hint.
                          <>
                            <div className="py-8 text-center">
                              <BellRing className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-2" />
                              <p className="text-sm text-on-surface-variant">لا توجد إشعارات جديدة</p>
                            </div>
                            <Link
                              href="/notifications"
                              className="block text-center text-xs font-semibold text-primary hover:underline border-t border-outline-variant/15 px-3 py-2.5"
                            >
                              عرض كل الإشعارات
                            </Link>
                          </>
                        ) : (
                          // Scrollable list — max 300px height, shows up to 10 notifications.
                          // overflow-y-auto adds a scrollbar if the content overflows.
                          // Footer below this block adds a "see all" link to /notifications.
                          <div className="max-h-[300px] overflow-y-auto">
                            {notifications.slice(0, 10).map((notif: any) => {
                              // Only wrap in a Link if the notification has a link.
                              // Otherwise render a plain div so nothing happens on click.
                              const body = (
                                <div className="flex items-start gap-2 overflow-hidden max-w-100">
                                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${notif.type === 'success' ? 'bg-green-500' :
                                      notif.type === 'error' ? 'bg-red-500' :
                                        notif.type === 'warning' ? 'bg-amber-500' :
                                          'bg-blue-500'
                                    }`} />
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-on-surface">{notif.title}</p>
                                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{notif.message}</p>
                                    <p className="text-[10px] text-on-surface-variant/60 mt-1">
                                      {new Date(notif.createdAt).toLocaleDateString('ar-EG', {
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                      })}
                                    </p>
                                  </div>
                                </div>
                              )
                              const classes = `px-3 py-3 border-b border-outline-variant/10 last:border-0 block ${!notif.isRead ? 'bg-primary/5' : ''
                                } ${notif.link ? 'hover:bg-surface-container-high cursor-pointer' : ''}`
                              return notif.link ? (
                                <Link key={notif._id} href={notif.link} className={classes}>
                                  {body}
                                </Link>
                              ) : (
                                <div key={notif._id} className={classes}>{body}</div>
                              )
                            })}
                          </div>
                        )}

                        {/* "See all" footer — only when there are notifications.
                            Empty-state branch above renders its own footer link. */}
                        {notifications.length > 0 && (
                          <Link
                            href="/notifications"
                            className="block text-center text-xs font-semibold text-primary hover:underline border-t border-outline-variant/15 px-3 py-2.5"
                          >
                            عرض كل الإشعارات
                          </Link>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>

                  {/* ========== LANGUAGE GLOBE DROPDOWN ==========
                      Real switcher now: clicking an option calls the
                      setLocale server action (writes the NEXT_LOCALE cookie),
                      then router.refresh() pulls the new messages bundle. */}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className="p-2 rounded-full hover:bg-surface-container-high transition-colors cursor-pointer">
                        <Globe className="w-5 h-5 text-primary" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className={dropdownContentStyles}
                        align="end"
                        sideOffset={8}
                      >
                        <DropdownMenu.Label className="px-3 py-2 text-sm font-bold text-on-surface">
                          {t('common.language')}
                        </DropdownMenu.Label>
                        <DropdownMenu.Separator className="h-px bg-outline-variant/20 my-1" />

                        <DropdownMenu.Item
                          onSelect={() => handleLocaleChange('ar')}
                          className={`${dropdownItemStyles} ${activeLocale === 'ar' ? 'font-semibold text-primary' : ''}`}
                        >
                          {activeLocale === 'ar' ? <Check className="w-4 h-4" /> : <span className="w-4" />}
                          <span className="flex-1 text-right">{t('common.arabic')}</span>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                          onSelect={() => handleLocaleChange('en')}
                          className={`${dropdownItemStyles} ${activeLocale === 'en' ? 'font-semibold text-primary' : ''}`}
                        >
                          {activeLocale === 'en' ? <Check className="w-4 h-4" /> : <span className="w-4" />}
                          <span className="flex-1 text-right">{t('common.english')}</span>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                {/* ========== PROFILE AVATAR DROPDOWN ========== */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    {/* We wrap the avatar in a <button> so it's clickable and accessible.
                        The cursor-pointer + focus ring give visual feedback on hover/focus. */}
                    <button className="rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all hover:opacity-80">
                      {user?.profileImage ? (
                        <img
                          alt={user.firstName}
                          src={user.profileImage}
                          className="w-10 h-10 rounded-full object-cover border-2 border-primary-container/20"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg border-2 border-primary-container/20">
                          {getInitial()}
                        </div>
                      )}
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className={dropdownContentStyles}
                      align="end"
                      sideOffset={8}
                    >
                      {/* User info header — shows name and email/phone */}
                      <DropdownMenu.Label className="px-3 py-2">
                        <p className="text-sm font-bold text-on-surface">
                          {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {user?.email || user?.phone}
                        </p>
                      </DropdownMenu.Label>

                      <DropdownMenu.Separator className="h-px bg-outline-variant/20 my-1" />

                      {/* Profile link — navigates to the customer profile page */}
                      <DropdownMenu.Item className={dropdownItemStyles} asChild>
                        <Link href="/profile">
                          <UserCircle className="w-4 h-4 text-on-surface-variant" />
                          <span className="flex-1 text-right">الملف الشخصي</span>
                        </Link>
                      </DropdownMenu.Item>

                      {/* Dashboard link — admin → /admin, worker → /dashboard, customer → /profile */}
                      <DropdownMenu.Item className={dropdownItemStyles} asChild>
                        <Link href={user?.role === 'admin' ? '/admin' : user?.role === 'worker' ? '/dashboard' : '/profile'}>
                          <LayoutDashboard className="w-4 h-4 text-on-surface-variant" />
                          <span className="flex-1 text-right">لوحة التحكم</span>
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item className={dropdownItemStyles} asChild>
                        <Link href="/favorites">
                          <Heart className="w-4 h-4 text-on-surface-variant" />
                          <span className="flex-1 text-right">المفضلة</span>
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item className={dropdownItemStyles} asChild>
                        <Link href={supportHref}>
                          <LifeBuoy className="w-4 h-4 text-on-surface-variant" />
                          <span className="flex-1 text-right">الدعم والمساعدة</span>
                        </Link>
                      </DropdownMenu.Item>

                      <DropdownMenu.Separator className="h-px bg-outline-variant/20 my-1" />

                      {/* Logout — styled red to indicate a destructive action.
                          onSelect is Radix's version of onClick for menu items.
                          It fires when the user clicks OR presses Enter on a focused item. */}
                      <DropdownMenu.Item
                        className={`${dropdownItemStyles} text-red-600 data-highlighted:bg-red-50`}
                        onSelect={logout}
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="flex-1 text-right">تسجيل الخروج</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>

            ) : (
              // STATE: GUEST — Show sign in and sign up buttons
              <div className="flex gap-3 items-center">
                <Link
                  href="/signin"
                  className="text-primary font-semibold text-sm hover:underline px-4 py-2"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href="/signup"
                  className="bg-primary text-white px-5 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  إنشاء حساب
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ===== MOBILE BOTTOM NAVIGATION ===== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-[0_-8px_24px_-12px_rgba(18,28,42,0.1)] px-6 py-3 flex justify-between items-center z-50">
        <Link href="/" className="flex flex-col items-center gap-1 text-primary">
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-bold">الرئيسية</span>
        </Link>
        <button className="flex flex-col items-center gap-1 text-on-surface-variant">
          <Grid3x3 className="w-5 h-5" />
          <span className="text-[10px]">الفئات</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-on-surface-variant">
          <Receipt className="w-5 h-5" />
          <span className="text-[10px]">طلباتي</span>
        </button>
        {isLoggedIn ? (
          <Link href={user?.role === 'admin' ? '/admin' : user?.role === 'worker' ? '/dashboard' : '/profile'} className="flex flex-col items-center gap-1 text-on-surface-variant">
            <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[8px] font-bold">
              {getInitial()}
            </div>
            <span className="text-[10px]">حسابي</span>
          </Link>
        ) : (
          <Link href="/signin" className="flex flex-col items-center gap-1 text-on-surface-variant">
            <LogIn className="w-5 h-5" />
            <span className="text-[10px]">دخول</span>
          </Link>
        )}
      </div>
    </>
  )
}
