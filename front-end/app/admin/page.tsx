'use client'
// ^^^ Admin dashboard uses hooks (useState, useEffect) and event handlers,
// so it MUST be a Client Component in Next.js App Router.

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import Navbar from '@/components/Navbar'
import TicketThread from '@/components/TicketThread'
import LicensesReviewQueue from '@/components/LicensesReviewQueue'
import ProviderApplicationsQueue from '@/components/ProviderApplicationsQueue'
import type {
  AdminStats,
  AdminUser,
  VerificationRequest,
  AdminReport,
  Category,
  PaginationInfo,
  SupportTicket,
} from '@/lib/types'

// --- Lucide Icons ---
import {
  Users,
  Wrench,
  AlertTriangle,
  DollarSign,
  LayoutDashboard,
  Receipt,
  CalendarDays,
  Settings,
  Plus,
  LogOut,
  Search,
  Bell,
  MoreVertical,
  Check,
  X,
  Shield,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Ticket,
  TrendingUp,
  Copy,
  Pause,
  Play,
  LifeBuoy,
  MessageCircle,
  Clock,
  CheckCircle2,
  Lock,
  HelpCircle,
  Briefcase,
  UserX,
  CreditCard,
} from 'lucide-react'

// =============================================================================
// ORDER STATUS CONFIG — Maps each order status to an Arabic label + color classes
// =============================================================================
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'قيد الانتظار', bg: 'bg-amber-50', text: 'text-amber-600' },
  accepted: { label: 'مقبول', bg: 'bg-blue-50', text: 'text-blue-600' },
  in_progress: { label: 'قيد التنفيذ', bg: 'bg-primary/10', text: 'text-primary' },
  completed: { label: 'مكتمل', bg: 'bg-green-50', text: 'text-green-600' },
  rejected: { label: 'مرفوض', bg: 'bg-red-50', text: 'text-red-600' },
  cancelled: { label: 'ملغي', bg: 'bg-gray-100', text: 'text-gray-500' },
}

// =============================================================================
// ADMIN DASHBOARD PAGE
// =============================================================================

export default function AdminDashboardPage() {
  const router = useRouter()
  const { user, isLoggedIn, isLoading: authLoading, logout } = useAuth()


  const [stats, setStats] = useState<AdminStats | null>(null)
  // ^^^ Platform-wide statistics (total users, active workers, etc.)

  const [users, setUsers] = useState<AdminUser[]>([])
  // ^^^ The list of users displayed in the management table

  const [usersPagination, setUsersPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1,
  })
  // ^^^ Pagination info for the users table (which page we're on, total pages, etc.)

  const [userFilter, setUserFilter] = useState('all')
  // ^^^ Filter: 'all', 'worker', or 'customer' — controls which users appear in the table

  const [usersPage, setUsersPage] = useState(1)
  // ^^^ Current page number for the users table

  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([])
  const [verificationPagination, setVerificationPagination] = useState<PaginationInfo>({ page: 1, limit: 5, total: 0, pages: 0 })
  const [verificationPage, setVerificationPage] = useState(1)

  const [reports, setReports] = useState<AdminReport[]>([])
  const [reportsPagination, setReportsPagination] = useState<PaginationInfo>({ page: 1, limit: 5, total: 0, pages: 0 })
  const [reportsPage, setReportsPage] = useState(1)
  const [reportsFilter, setReportsFilter] = useState('all')

  const [categories, setCategories] = useState<Category[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', image: '', isActive: true })

  const [activeSection, setActiveSection] = useState('dashboard')

  // --- Support Tickets State ---
  // List view for the "بلاغات الدعم" admin section. The selectedTicketId
  // drives the detail panel next to the list — clicking a row sets it and
  // fetches the full ticket (with replies) into selectedTicket.
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([])
  const [supportPagination, setSupportPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 0 })
  const [supportPage, setSupportPage] = useState(1)
  const [supportStatusFilter, setSupportStatusFilter] = useState('all')
  const [supportTypeFilter, setSupportTypeFilter] = useState('all')
  const [supportSearch, setSupportSearch] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [selectedTicketLoading, setSelectedTicketLoading] = useState(false)

  // --- Orders State ---
  // These mirror the same pattern used for users/reports:
  // a data array, pagination info, current page, and a filter.
  const [adminOrders, setAdminOrders] = useState<any[]>([])
  // ^^^ The list of orders fetched from the admin API

  const [adminOrdersPagination, setAdminOrdersPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 0 })
  // ^^^ Pagination metadata (total count, number of pages, etc.)

  const [adminOrdersPage, setAdminOrdersPage] = useState(1)
  // ^^^ Which page of orders we're currently viewing

  const [adminOrdersFilter, setAdminOrdersFilter] = useState('all')
  // ^^^ Status filter: 'all', 'pending', 'in_progress', 'completed', etc.

  // --- Pending Services State ---
  // These track services submitted by workers that need admin approval before
  // they appear on the platform. Same pattern as orders/reports above.
  const [pendingServices, setPendingServices] = useState<any[]>([])
  // ^^^ Array of service objects waiting for admin review

  const [pendingServicesPagination, setPendingServicesPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 0 })
  // ^^^ Pagination metadata from the API (total count, number of pages, etc.)

  const [pendingServicesPage, setPendingServicesPage] = useState(1)
  // ^^^ Which page of pending services the admin is currently viewing

  const [rejectReason, setRejectReason] = useState('')
  // ^^^ Text input for the rejection reason (shown when admin clicks "reject")

  const [rejectingServiceId, setRejectingServiceId] = useState<string | null>(null)
  // ^^^ Tracks which service's reject form is currently open (null = none)

  // --- Coupons State (discount codes) ---
  // The admin coupons page has a list, 4 KPI stats, status tabs, a search box,
  // and an inline create/edit form. All state for that screen lives here.
  const [coupons, setCoupons] = useState<any[]>([])
  const [couponStats, setCouponStats] = useState<{ activeCount: number; totalUses: number; totalRevenue: number; avgDiscount: number }>({ activeCount: 0, totalUses: 0, totalRevenue: 0, avgDiscount: 0 })
  const [couponStatusFilter, setCouponStatusFilter] = useState<'all' | 'active' | 'paused' | 'expired'>('all')
  const [couponSearch, setCouponSearch] = useState('')
  const [couponSort, setCouponSort] = useState<'newest' | 'oldest' | 'mostUsed'>('newest')
  const [showCouponForm, setShowCouponForm] = useState(false)
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null)
  const [couponForm, setCouponForm] = useState({
    code: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 0,
    applicableCategories: [] as string[],
    minOrderAmount: 0,
    maxUses: 0,
    expiresAt: '',
    status: 'active' as 'active' | 'paused',
    showOnHomePage: false,
    bannerImage: '',
    bannerTitle: '',
    bannerSubtitle: '',
    bannerCtaLabel: 'استفد من العرض',
  })

  const [loading, setLoading] = useState(true)

  // ===========================================================================
  // EFFECT 1: Auth Guard — Redirect non-admins
  // ===========================================================================
  // This runs whenever auth state changes. If the user isn't an admin,
  // kick them back to the home page.
  useEffect(() => {
    if (!authLoading && (!isLoggedIn || user?.role !== 'admin')) {
      router.push('/')
    }
  }, [authLoading, isLoggedIn, user, router])

  // ===========================================================================
  // EFFECT 2: Initial Data Fetch — Load everything in parallel
  // ===========================================================================
  // Promise.all() fires ALL requests at the same time (parallel), not one-by-one.
  // This is much faster than sequential fetching (await one, then await next, etc.)
  // If ANY request fails, the .catch() handles it gracefully.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return

    Promise.all([
      api.getWithAuth('/admin/stats'),
      api.getWithAuth('/admin/users?page=1&limit=10'),
      api.getWithAuth('/admin/verification-requests?page=1&limit=5'),
      api.getWithAuth('/admin/reports?status=all&page=1&limit=5'),
      api.get('/categories'),
      api.getWithAuth('/admin/pending-services?page=1&limit=10'),
      // ^^^ Fetch pending services alongside everything else for faster load
    ])
      .then(([statsData, usersData, verData, reportsData, catData, pendingData]) => {
        setStats(statsData.stats)
        setUsers(usersData.users)
        setUsersPagination(usersData.pagination)
        setVerificationRequests(verData.requests)
        setVerificationPagination(verData.pagination)
        setReports(reportsData.reports)
        setReportsPagination(reportsData.pagination)
        setCategories(catData.categories)
        setPendingServices(pendingData.services)
        setPendingServicesPagination(pendingData.pagination)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
    // ^^^ .finally() runs whether the promise resolved or rejected.
    // We ALWAYS want to stop the loading spinner, even if there was an error.
  }, [isLoggedIn, user])

  // ===========================================================================
  // EFFECT 3: Re-fetch users when filter or page changes
  // ===========================================================================
  // When the admin clicks a filter tab (all/workers/customers) or changes page,
  // we fetch the updated list. The dependency array [userFilter, usersPage]
  // means this effect re-runs whenever either value changes.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return

    api
      .getWithAuth(`/admin/users?role=${userFilter}&page=${usersPage}&limit=10`)
      .then((data) => {
        setUsers(data.users)
        setUsersPagination(data.pagination)
      })
      .catch(console.error)
  }, [userFilter, usersPage, isLoggedIn, user])

  // ===========================================================================
  // EFFECT 4: Re-fetch verification requests when page changes
  // ===========================================================================
  // Same pattern as the users effect above — whenever the admin clicks
  // "next page" or "previous page" on the verification panel, this fires
  // a new API call with the updated page number.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return
    api.getWithAuth(`/admin/verification-requests?page=${verificationPage}&limit=5`)
      .then(data => {
        setVerificationRequests(data.requests)
        setVerificationPagination(data.pagination)
      })
      .catch(console.error)
  }, [verificationPage, isLoggedIn, user])

  // ===========================================================================
  // EFFECT 5: Re-fetch reports when page or filter changes
  // ===========================================================================
  // Reports have BOTH pagination AND a status filter (all/pending/reviewed/resolved).
  // Whenever either changes, we re-fetch. Notice that both reportsPage and
  // reportsFilter are in the dependency array — changing either triggers a re-fetch.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return
    api.getWithAuth(`/admin/reports?status=${reportsFilter}&page=${reportsPage}&limit=5`)
      .then(data => {
        setReports(data.reports)
        setReportsPagination(data.pagination)
      })
      .catch(console.error)
  }, [reportsPage, reportsFilter, isLoggedIn, user])

  // ===========================================================================
  // EFFECT 6: Fetch orders when orders section is active
  // ===========================================================================
  // This only fires when activeSection === 'orders'. It also re-fires when
  // the filter or page changes — same pattern as Effects 3-5.
  // KEY: We DON'T fetch orders on initial load (unlike users/stats), because
  // the admin starts on the dashboard. We only fetch when they navigate to orders.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin' || activeSection !== 'orders') return
    api.getWithAuth(`/admin/orders?status=${adminOrdersFilter}&page=${adminOrdersPage}&limit=10`)
      .then(data => {
        setAdminOrders(data.orders)
        setAdminOrdersPagination(data.pagination)
      })
      .catch(console.error)
  }, [activeSection, adminOrdersPage, adminOrdersFilter, isLoggedIn, user])

  // ===========================================================================
  // EFFECT (coupons): (re)load coupons + stats whenever the admin is on the
  // coupons tab and any filter changes. Stats are also pulled so the KPI
  // cards reflect the current state without needing a manual refresh.
  // ===========================================================================
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return
    if (activeSection !== 'coupons') return

    const params = new URLSearchParams({
      status: couponStatusFilter,
      sort: couponSort,
    })
    if (couponSearch.trim()) params.append('search', couponSearch.trim())

    Promise.all([
      api.getWithAuth(`/coupons?${params.toString()}`),
      api.getWithAuth('/coupons/stats'),
    ])
      .then(([listRes, statsRes]) => {
        setCoupons(listRes.coupons)
        setCouponStats(statsRes)
      })
      .catch(console.error)
  }, [activeSection, couponStatusFilter, couponSearch, couponSort, isLoggedIn, user])

  // ===========================================================================
  // EFFECT (support tickets): list admin tickets when the support section is
  // active, or when any filter/page changes. Mirrors the reports/orders
  // fetch patterns above.
  // ===========================================================================
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return
    if (activeSection !== 'support') return

    const params = new URLSearchParams({
      status: supportStatusFilter,
      type: supportTypeFilter,
      page: String(supportPage),
      limit: '10',
    })
    if (supportSearch.trim()) params.append('search', supportSearch.trim())

    api.getWithAuth(`/admin/tickets?${params.toString()}`)
      .then(data => {
        setSupportTickets(data.tickets)
        setSupportPagination(data.pagination)
      })
      .catch(console.error)
  }, [activeSection, supportStatusFilter, supportTypeFilter, supportPage, supportSearch, isLoggedIn, user])

  // When the admin selects a ticket (click on a row OR deep-link from bell
  // notification), fetch its full thread via the user-side GET — admins are
  // allowed by the backend's "owner or admin" access check.
  useEffect(() => {
    if (!selectedTicketId) {
      setSelectedTicket(null)
      return
    }
    setSelectedTicketLoading(true)
    api.getWithAuth(`/support/tickets/${selectedTicketId}`)
      .then(data => setSelectedTicket(data.ticket))
      .catch(err => {
        console.error(err)
        setSelectedTicket(null)
      })
      .finally(() => setSelectedTicketLoading(false))
  }, [selectedTicketId])

  // Deep-link handling: when a bell notification says
  // /admin?section=support&ticket=<id>, jump straight there.
  const searchParams = useSearchParams()
  useEffect(() => {
    const section = searchParams?.get('section')
    const ticket = searchParams?.get('ticket')
    if (section === 'support') setActiveSection('support')
    if (ticket) setSelectedTicketId(ticket)
    // Only run on initial mount + param change. activeSection intentionally
    // omitted from deps so clicking the sidebar elsewhere doesn't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ===========================================================================
  // HANDLERS: coupon CRUD. Each one hits the backend then updates local state
  // so the UI is snappy without needing a full refetch.
  // ===========================================================================
  const resetCouponForm = () => {
    setCouponForm({
      code: '', description: '',
      discountType: 'percentage', discountValue: 0,
      applicableCategories: [],
      minOrderAmount: 0, maxUses: 0,
      expiresAt: '', status: 'active',
      showOnHomePage: false,
      bannerImage: '', bannerTitle: '', bannerSubtitle: '',
      bannerCtaLabel: 'استفد من العرض',
    })
    setEditingCouponId(null)
    setShowCouponForm(false)
  }

  const handleCouponSubmit = async () => {
    if (!couponForm.code.trim()) { alert('الكود مطلوب'); return }
    if (!couponForm.expiresAt) { alert('تاريخ الانتهاء مطلوب'); return }
    try {
      if (editingCouponId) {
        const { coupon } = await api.putWithAuth(`/coupons/${editingCouponId}`, couponForm)
        setCoupons(prev => prev.map(c => c._id === editingCouponId ? { ...coupon, effectiveStatus: c.effectiveStatus } : c))
      } else {
        const { coupon } = await api.postWithAuth('/coupons', couponForm)
        setCoupons(prev => [{ ...coupon, effectiveStatus: coupon.status }, ...prev])
      }
      // Refresh stats so the KPIs reflect the add/edit
      api.getWithAuth('/coupons/stats').then(setCouponStats).catch(console.error)
      resetCouponForm()
    } catch (err: any) {
      alert(err.message || 'حدث خطأ')
    }
  }

  const handleEditCoupon = (coupon: any) => {
    setCouponForm({
      code: coupon.code || '',
      description: coupon.description || '',
      discountType: coupon.discountType || 'percentage',
      discountValue: coupon.discountValue || 0,
      applicableCategories: (coupon.applicableCategories || []).map((c: any) => c._id || c),
      minOrderAmount: coupon.minOrderAmount || 0,
      maxUses: coupon.maxUses || 0,
      // date input needs yyyy-MM-dd format
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : '',
      status: coupon.status || 'active',
      showOnHomePage: !!coupon.showOnHomePage,
      bannerImage: coupon.bannerImage || '',
      bannerTitle: coupon.bannerTitle || '',
      bannerSubtitle: coupon.bannerSubtitle || '',
      bannerCtaLabel: coupon.bannerCtaLabel || 'استفد من العرض',
    })
    setEditingCouponId(coupon._id)
    setShowCouponForm(true)
  }

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return
    try {
      await api.deleteWithAuth(`/coupons/${id}`)
      setCoupons(prev => prev.filter(c => c._id !== id))
      api.getWithAuth('/coupons/stats').then(setCouponStats).catch(console.error)
    } catch (err: any) {
      alert(err.message || 'فشل الحذف')
    }
  }

  const handleToggleCouponStatus = async (coupon: any) => {
    const next = coupon.status === 'active' ? 'paused' : 'active'
    try {
      const { coupon: updated } = await api.putWithAuth(`/coupons/${coupon._id}`, { status: next })
      setCoupons(prev => prev.map(c => c._id === coupon._id ? { ...updated, effectiveStatus: updated.status } : c))
      api.getWithAuth('/coupons/stats').then(setCouponStats).catch(console.error)
    } catch (err: any) {
      alert(err.message || 'حدث خطأ')
    }
  }

  // ===========================================================================
  // EFFECT 7: Re-fetch pending services when page changes
  // ===========================================================================
  // Same pagination pattern used for users, reports, etc.
  // When the admin clicks "next page" or "previous page" on the pending
  // services panel, this effect fires a new API call with the updated page.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'admin') return
    api.getWithAuth(`/admin/pending-services?page=${pendingServicesPage}&limit=10`)
      .then(data => {
        setPendingServices(data.services)
        setPendingServicesPagination(data.pagination)
      })
      .catch(console.error)
  }, [pendingServicesPage, isLoggedIn, user])

  // ===========================================================================
  // HANDLER: Suspend / Ban / Activate a user
  // ===========================================================================
  // Called when admin clicks the status action buttons in the user table.
  // We send a PUT request to update the user's status, then update local state
  // so the UI reflects the change immediately (no need to re-fetch).
  const handleUserStatus = async (
    userId: string,
    status: 'active' | 'suspended' | 'banned'
  ) => {
    try {
      await api.putWithAuth(`/admin/users/${userId}/status`, { status })
      // Update the user in our local array without re-fetching
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, status } : u))
      )
    } catch (err) {
      console.error(err)
    }
  }

  // ===========================================================================
  // HANDLER: Approve / Reject worker verification
  // ===========================================================================
  // Workers submit documents to prove their identity/skills.
  // Admin can approve or reject. On success, we remove the request from the list.
  const handleVerification = async (
    profileId: string,
    action: 'approved' | 'rejected'
  ) => {
    try {
      await api.putWithAuth(`/admin/verification/${profileId}`, { action })
      // Remove from the local list (it's no longer pending)
      setVerificationRequests((prev) =>
        prev.filter((r) => r._id !== profileId)
      )
    } catch (err) {
      console.error(err)
    }
  }

  // ===========================================================================
  // HANDLER: Update report status
  // ===========================================================================
  // Admin marks a report as "reviewed" or "resolved".
  // We update the status in the local array.
  const handleReportStatus = async (
    reportId: string,
    status: 'reviewed' | 'resolved'
  ) => {
    try {
      await api.putWithAuth(`/admin/reports/${reportId}`, { status })
      setReports((prev) =>
        prev.map((r) => (r._id === reportId ? { ...r, status } : r))
      )
    } catch (err) {
      console.error(err)
    }
  }

  // ===========================================================================
  // HANDLER: Update order status (e.g., cancel an order)
  // ===========================================================================
  // Similar to handleUserStatus — sends a PUT to the API, then updates local
  // state so the UI reflects the change instantly without a full re-fetch.
  // The API returns the updated order object, so we replace it in the array.
  const handleOrderStatus = async (orderId: string, status: string) => {
    try {
      const data = await api.putWithAuth(`/admin/orders/${orderId}/status`, { status })
      // Replace the old order with the updated one from the API response
      setAdminOrders(prev => prev.map(o => o._id === orderId ? data.order : o))
    } catch (err) {
      console.error(err)
    }
  }

  // ===========================================================================
  // HANDLER: Approve a pending service
  // ===========================================================================
  // When admin clicks "قبول" (approve), we send a PUT request to the API.
  // On success, we REMOVE the service from the local array (it's no longer pending)
  // and decrement the total count in pagination metadata.
  // This gives instant UI feedback without waiting for a full re-fetch.
  const handleApproveService = async (serviceId: string) => {
    try {
      await api.putWithAuth(`/admin/services/${serviceId}/approve`, {})
      // Remove approved service from the pending list
      setPendingServices(prev => prev.filter(s => s._id !== serviceId))
      // Update the total count so the "X خدمة معلقة" counter stays accurate
      setPendingServicesPagination(prev => ({ ...prev, total: prev.total - 1 }))
    } catch (err) { console.error(err) }
  }

  // ===========================================================================
  // HANDLER: Reject a pending service
  // ===========================================================================
  // Similar to approve, but also sends the rejection reason in the request body.
  // After rejecting, we clear the reject form state (rejectingServiceId + rejectReason).
  const handleRejectService = async (serviceId: string) => {
    try {
      await api.putWithAuth(`/admin/services/${serviceId}/reject`, { reason: rejectReason })
      setPendingServices(prev => prev.filter(s => s._id !== serviceId))
      setPendingServicesPagination(prev => ({ ...prev, total: prev.total - 1 }))
      // Reset the rejection form
      setRejectingServiceId(null)
      setRejectReason('')
    } catch (err) { console.error(err) }
  }

  // ===========================================================================
  // CATEGORY CRUD HANDLERS
  // ===========================================================================
  const resetCategoryForm = () => {
    setCategoryForm({ name: '', description: '', image: '', isActive: true })
    setEditingCategoryId(null)
    setShowCategoryForm(false)
  }

  const handleAddCategory = async () => {
    if (!categoryForm.name.trim()) return
    try {
      const data = await api.postWithAuth('/categories', categoryForm)
      setCategories(prev => [...prev, data.category])
      resetCategoryForm()
    } catch (err) { console.error('Failed to add category:', err) }
  }

  const handleSaveEditCategory = async () => {
    if (!editingCategoryId || !categoryForm.name.trim()) return
    try {
      const data = await api.putWithAuth(`/categories/${editingCategoryId}`, categoryForm)
      setCategories(prev => prev.map(c => c._id === editingCategoryId ? data.category : c))
      resetCategoryForm()
    } catch (err) { console.error('Failed to edit category:', err) }
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      await api.deleteWithAuth(`/categories/${id}`)
      setCategories(prev => prev.filter(c => c._id !== id))
    } catch (err) { console.error('Failed to delete category:', err) }
  }

  const handleToggleCategoryActive = async (cat: Category) => {
    try {
      const data = await api.putWithAuth(`/categories/${cat._id}`, { isActive: !cat.isActive })
      setCategories(prev => prev.map(c => c._id === cat._id ? data.category : c))
    } catch (err) { console.error('Failed to toggle category:', err) }
  }

  const startEditCategory = (cat: Category) => {
    setCategoryForm({ name: cat.name, description: cat.description || '', image: cat.image || '', isActive: cat.isActive })
    setEditingCategoryId(cat._id)
    setShowCategoryForm(true)
  }

  // ===========================================================================
  // HELPER: Format date in Arabic
  // ===========================================================================
  // toLocaleDateString with 'ar-EG' locale formats dates in Arabic numerals
  // and month names (e.g., "٢٣ مارس ٢٠٢٦")
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // ===========================================================================
  // HELPER: Role label in Arabic
  // ===========================================================================
  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      customer: 'عميل',
      worker: 'مزود خدمة',
      admin: 'مسؤول',
    }
    return labels[role] || role
  }

  // ===========================================================================
  // HELPER: Status badge styling
  // ===========================================================================
  // Returns CSS classes for each status. Green = active, Amber = suspended, Red = banned.
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-50 text-green-600'
      case 'suspended':
        return 'bg-amber-50 text-amber-600'
      case 'banned':
        return 'bg-red-50 text-red-600'
      default:
        return 'bg-gray-50 text-gray-600'
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: 'نشط',
      suspended: 'معلق',
      banned: 'محظور',
    }
    return labels[status] || status
  }

  const syncAdminUrl = (section: string, ticketId?: string | null) => {
    if (section === 'support') {
      const params = new URLSearchParams({ section: 'support' })
      if (ticketId) params.set('ticket', ticketId)
      router.replace(`/admin?${params.toString()}`, { scroll: false })
      return
    }
    router.replace('/admin', { scroll: false })
  }

  const handleSectionChange = (section: string) => {
    // The analytics section lives on its own route (/admin/analytics) — not
    // inline like the others — so we navigate instead of toggling state.
    if (section === 'analytics') {
      router.push('/admin/analytics')
      return
    }
    setActiveSection(section)
    syncAdminUrl(section, section === 'support' ? selectedTicketId : null)
  }

  const handleSupportTicketSelect = (ticketId: string) => {
    setActiveSection('support')
    setSelectedTicketId(ticketId)
    syncAdminUrl('support', ticketId)
  }

  // ===========================================================================
  // SIDEBAR NAV ITEMS
  // ===========================================================================
  // Each item has an icon, label, and key. The key is compared with activeSection
  // to determine which item is highlighted.
  const sidebarLinks = [
    { key: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { key: 'analytics', label: 'التحليلات', icon: TrendingUp },
    { key: 'orders', label: 'الطلبات', icon: Receipt },
    { key: 'pending-services', label: 'خدمات معلقة', icon: Shield },
    { key: 'pending-licenses', label: 'مراجعة الرخص', icon: Shield },
    { key: 'provider-applications', label: 'طلبات الانضمام', icon: Briefcase },
    { key: 'support', label: 'بلاغات الدعم', icon: LifeBuoy },
    { key: 'coupons', label: 'أكواد الخصم', icon: Ticket },
    { key: 'schedule', label: 'الجدول الزمني', icon: CalendarDays },
    { key: 'users', label: 'إدارة المستخدمين', icon: Users },
    { key: 'settings', label: 'الإعدادات', icon: Settings },
  ]

  // ===========================================================================
  // LOADING STATE — Skeleton UI
  // ===========================================================================
  // While auth is checking or data is loading, show animated placeholder blocks.
  // animate-pulse is a Tailwind utility that fades elements in and out,
  // giving the user a visual hint that content is loading.
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex">
        {/* Skeleton Sidebar */}
        <aside className="h-screen w-64 fixed right-0 bg-white border-l border-outline-variant/15 p-6">
          <div className="h-10 bg-gray-200 rounded-lg animate-pulse mb-8" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </aside>

        {/* Skeleton Main */}
        <main className="mr-64 p-8 flex-1">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 bg-gray-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-8 h-64 bg-gray-100 rounded-xl animate-pulse" />
            <div className="col-span-4 h-64 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </main>
      </div>
    )
  }

  // ===========================================================================
  // MAIN RENDER
  // ===========================================================================
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar at the top of every page */}
      <Navbar />

      {/* ===================================================================
          FIXED SIDEBAR — Right side (RTL)
          ===================================================================
          This sidebar is position: fixed, meaning it stays in place even when
          the user scrolls the main content. It's pinned to the right edge
          (right-0) because our app is RTL.

          The border-l (left border) acts as a visual separator between
          sidebar and main content (since content is to the left in RTL). */}
      <aside className="h-[calc(100vh-4rem)] w-64 border-l border-outline-variant/15 right-0 fixed top-16 bg-white shadow-[24px_0_24px_-12px_rgba(18,28,42,0.06)] z-40 flex flex-col">
        {/* --- Logo / Brand --- */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3">
            {/* Brand icon circle */}
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-on-primary" />
            </div>
            <div>
              <h2 className="font-bold text-on-surface">بوابة الشركاء</h2>
              <p className="text-xs text-on-surface-variant">
                إدارة الخدمات الحرفية خاص
              </p>
            </div>
          </div>
        </div>

        {/* --- Navigation Links ---
            Each link checks if it's the active section.
            Active = primary background + primary text
            Inactive = transparent + muted text */}
        <nav className="flex-1 px-4 space-y-1">
          {sidebarLinks.map((link) => {
            const Icon = link.icon
            // ^^^ In React, component names must start with uppercase.
            // We assign link.icon to Icon so we can use it as <Icon />.
            const isActive = activeSection === link.key

            return (
              <button
                key={link.key}
                onClick={() => handleSectionChange(link.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{link.label}</span>
              </button>
            )
          })}
        </nav>

        {/* --- Bottom Section: Add Service + Logout --- */}
        <div className="p-4 space-y-2 border-t border-outline-variant/15">
          {/* Add new service button */}
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-on-primary font-medium text-sm hover:bg-primary-container transition-colors">
            <Plus className="w-5 h-5" />
            <span>إضافة خدمة جديدة</span>
          </button>

          {/* Logout button */}
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-on-surface-variant hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <main className="mr-64 p-8 pt-24 min-h-screen">

        {activeSection !== 'dashboard' && activeSection !== 'orders' && activeSection !== 'pending-services' && activeSection !== 'pending-licenses' && activeSection !== 'provider-applications' && activeSection !== 'support' && activeSection !== 'coupons' ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-on-surface mb-2">
                قريبا
              </h2>
              <p className="text-on-surface-variant">
                هذا القسم قيد التطوير وسيكون متاحا قريبا
              </p>
            </div>
          </div>
        ) : activeSection === 'pending-licenses' ? (
          /* ============= LICENSES REVIEW SECTION =============
             Self-contained component — owns its own data fetching, pagination,
             and approve/reject actions against /api/admin/licenses. */
          <LicensesReviewQueue />
        ) : activeSection === 'provider-applications' ? (
          /* ============= PROVIDER APPLICATIONS SECTION =============
             Customer → worker upgrade applications. Approve flips role
             and creates the WorkerProfile + initial services. */
          <ProviderApplicationsQueue />
        ) : activeSection === 'pending-services' ? (
          /* ============= PENDING SERVICES APPROVAL SECTION ============= */
          <div>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-on-surface">خدمات بانتظار الموافقة</h2>
              <span className="text-sm text-on-surface-variant">{pendingServicesPagination.total} خدمة معلقة</span>
            </div>

            {pendingServices.length === 0 ? (
              <div className="text-center py-16 bg-surface-container-lowest rounded-xl">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-on-surface-variant text-lg">لا توجد خدمات معلقة</p>
                <p className="text-on-surface-variant text-sm">جميع الخدمات تمت مراجعتها</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingServices.map((service: any) => (
                  <div key={service._id} className="bg-surface-container-lowest rounded-xl p-6 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]">
                    {/* Worker header: avatar + name + category + pending badge */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {service.workerID?.userId?.profileImage ? (
                          <img src={service.workerID.userId.profileImage} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                            {service.workerID?.userId?.firstName?.charAt(0) || '?'}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-on-surface">{service.workerID?.userId?.firstName} {service.workerID?.userId?.lastName}</p>
                          <p className="text-xs text-on-surface-variant">{service.categoryId?.name || 'بدون فئة'}</p>
                        </div>
                      </div>
                      <span className="bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-xs font-bold">قيد المراجعة</span>
                    </div>

                    {/* Service details block — shows ALL submitted fields so the admin can decide. */}
                    <div className="bg-surface-container-low rounded-xl p-4 mb-4 space-y-3">
                      {/* Service name (headline) */}
                      {service.name && (
                        <div>
                          <p className="text-xs text-on-surface-variant mb-1">اسم الخدمة</p>
                          <p className="font-bold text-on-surface text-base">{service.name}</p>
                        </div>
                      )}

                      {/* Description */}
                      <div>
                        <p className="text-xs text-on-surface-variant mb-1">الوصف</p>
                        <p className="text-sm text-on-surface whitespace-pre-wrap">{service.description || 'بدون وصف'}</p>
                      </div>

                      {/* Category + payment type + price — inline row */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-on-surface-variant mb-1">الفئة</p>
                          <p className="text-on-surface font-medium">{service.categoryId?.name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-on-surface-variant mb-1">نوع الدفع</p>
                          <p className="text-on-surface font-medium">
                            {service.typeofService === 'hourly' ? 'بالساعة' : service.typeofService === 'range' ? 'نطاق سعر' : 'سعر ثابت'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-on-surface-variant mb-1">السعر</p>
                          <p className="font-bold text-primary">
                            {service.typeofService === 'range'
                              ? `${service.priceRange?.min ?? 0} - ${service.priceRange?.max ?? 0} ج.م`
                              : `${service.price ?? 0} ج.م`}
                          </p>
                        </div>
                      </div>

                      {/* Images gallery — if the worker uploaded any images. */}
                      {Array.isArray(service.images) && service.images.length > 0 && (
                        <div>
                          <p className="text-xs text-on-surface-variant mb-2">الصور ({service.images.length})</p>
                          <div className="grid grid-cols-4 gap-2">
                            {service.images.map((url: string, idx: number) => (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-20 object-cover rounded-lg bg-surface-container-high hover:opacity-80 transition-opacity"
                                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Submission date — helps admin prioritize older submissions */}
                      {service.createdAt && (
                        <p className="text-xs text-on-surface-variant pt-2 border-t border-outline-variant/10">
                          تاريخ التقديم: {new Date(service.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      )}
                    </div>

                    {rejectingServiceId === service._id ? (
                      <div className="mb-4 space-y-2">
                        <input
                          type="text"
                          placeholder="سبب الرفض (اختياري)"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          className="w-full bg-surface-container-low border-none rounded-lg px-4 py-2 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleRejectService(service._id)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">تأكيد الرفض</button>
                          <button onClick={() => { setRejectingServiceId(null); setRejectReason('') }} className="px-4 py-2 bg-surface-container-high text-on-surface-variant rounded-lg text-sm font-bold">إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => handleApproveService(service._id)} className="flex-1 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors">قبول</button>
                        <button onClick={() => setRejectingServiceId(service._id)} className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors">رفض</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pendingServicesPagination.pages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button onClick={() => setPendingServicesPage(p => Math.max(1, p - 1))} disabled={pendingServicesPage === 1} className="px-4 py-2 rounded-xl text-sm bg-surface-container-low text-on-surface-variant disabled:opacity-30">السابق</button>
                <span className="text-sm text-on-surface-variant">صفحة {pendingServicesPage} من {pendingServicesPagination.pages}</span>
                <button onClick={() => setPendingServicesPage(p => Math.min(pendingServicesPagination.pages, p + 1))} disabled={pendingServicesPage === pendingServicesPagination.pages} className="px-4 py-2 rounded-xl text-sm bg-surface-container-low text-on-surface-variant disabled:opacity-30">التالي</button>
              </div>
            )}
          </div>
        ) : activeSection === 'support' ? (
          /* ============= SUPPORT TICKETS SECTION ============= */
          <div>
            <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
              <div>
                <nav className="text-sm text-on-surface-variant mb-2">
                  <span>الإدارة</span>
                  <span className="mx-2">/</span>
                  <span className="text-on-surface">بلاغات الدعم</span>
                </nav>
                <h1 className="text-3xl font-black text-on-surface tracking-tight">بلاغات الدعم</h1>
                <p className="text-on-surface-variant text-sm mt-1">
                  <span className="font-bold text-on-surface">{supportPagination.total}</span> بلاغ
                </p>
              </div>
            </div>

            {/* Toolbar — filter tabs + type dropdown + search */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              {/* Status tabs */}
              <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
                {([
                  { value: 'all', label: 'الكل' },
                  { value: 'open', label: 'مفتوح' },
                  { value: 'in_progress', label: 'قيد المعالجة' },
                  { value: 'resolved', label: 'محلولة' },
                  { value: 'closed', label: 'مغلق' },
                ] as const).map(f => (
                  <button
                    key={f.value}
                    onClick={() => { setSupportStatusFilter(f.value); setSupportPage(1) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      supportStatusFilter === f.value
                        ? 'bg-primary text-on-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Type dropdown */}
              <select
                value={supportTypeFilter}
                onChange={e => { setSupportTypeFilter(e.target.value); setSupportPage(1) }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="all">كل الأنواع</option>
                <option value="service_issue">مشكلة في خدمة</option>
                <option value="user_report">بلاغ عن مستخدم</option>
                <option value="technical">مشكلة تقنية</option>
                <option value="payment_issue">مشكلة في الدفع</option>
                <option value="other">أخرى</option>
              </select>

              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  type="text"
                  value={supportSearch}
                  onChange={e => { setSupportSearch(e.target.value); setSupportPage(1) }}
                  placeholder="بحث في العنوان أو المحتوى..."
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl ps-10 pe-4 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            {/* Two-pane layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* List pane */}
              <div className="lg:col-span-5 space-y-2">
                {supportTickets.length === 0 ? (
                  <div className="bg-surface-container-lowest rounded-xl p-10 text-center text-on-surface-variant">
                    <LifeBuoy className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>لا توجد بلاغات.</p>
                  </div>
                ) : (
                  supportTickets.map(t => {
                    const selected = selectedTicketId === t._id
                    const typeIcons: Record<string, React.ElementType> = {
                      service_issue: Briefcase,
                      user_report: UserX,
                      technical: Wrench,
                      payment_issue: CreditCard,
                      other: HelpCircle,
                    }
                    const TypeIcon = typeIcons[t.type] || HelpCircle
                    const statusIcons = {
                      open: MessageCircle,
                      in_progress: Clock,
                      resolved: CheckCircle2,
                      closed: Lock,
                    } as const
                    const statusLabels = {
                      open: 'مفتوح', in_progress: 'قيد المعالجة', resolved: 'محلولة', closed: 'مغلق',
                    } as const
                    const statusColors = {
                      open: 'bg-blue-50 text-blue-700',
                      in_progress: 'bg-amber-50 text-amber-700',
                      resolved: 'bg-green-50 text-green-700',
                      closed: 'bg-gray-100 text-gray-600',
                    } as const
                    const StatusIcon = statusIcons[t.status]
                    const userObj = typeof t.userId === 'object' ? t.userId : null
                    return (
                      <button
                        key={t._id}
                        type="button"
                        onClick={() => handleSupportTicketSelect(t._id)}
                        className={`w-full text-right p-4 rounded-xl transition-all border ${
                          selected
                            ? 'bg-primary/5 border-primary'
                            : 'bg-surface-container-lowest border-transparent hover:border-primary/20 hover:shadow'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-bold text-on-surface text-sm truncate">{t.title}</h4>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${statusColors[t.status]}`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusLabels[t.status]}
                              </span>
                            </div>
                            {userObj && (
                              <p className="text-xs text-on-surface-variant mb-0.5">
                                {userObj.firstName} {userObj.lastName}
                                {userObj.role && (
                                  <span className="opacity-70"> • {userObj.role === 'worker' ? 'حرفي' : 'عميل'}</span>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-on-surface-variant">
                              {new Date(t.lastActivityAt).toLocaleDateString('ar-EG', {
                                year: 'numeric', month: 'short', day: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}

                {/* Pagination */}
                {supportPagination.pages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                      onClick={() => setSupportPage(p => Math.max(1, p - 1))}
                      disabled={supportPage === 1}
                      className="px-3 py-1.5 rounded-lg text-xs bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                    >
                      السابق
                    </button>
                    <span className="text-xs text-on-surface-variant">
                      {supportPage} / {supportPagination.pages}
                    </span>
                    <button
                      onClick={() => setSupportPage(p => Math.min(supportPagination.pages, p + 1))}
                      disabled={supportPage === supportPagination.pages}
                      className="px-3 py-1.5 rounded-lg text-xs bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                    >
                      التالي
                    </button>
                  </div>
                )}
              </div>

              {/* Detail pane */}
              <div className="lg:col-span-7">
                {!selectedTicketId ? (
                  <div className="bg-surface-container-lowest rounded-2xl p-16 text-center text-on-surface-variant">
                    <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">اختر بلاغاً من القائمة لعرض التفاصيل والرد عليه.</p>
                  </div>
                ) : selectedTicketLoading || !selectedTicket ? (
                  <div className="bg-surface-container-lowest rounded-2xl h-96 animate-pulse" />
                ) : (
                  <div className="h-[calc(100vh-280px)] min-h-[500px]">
                    <TicketThread
                      ticket={selectedTicket}
                      currentUserId={user?.id}
                      onUpdate={(updated) => {
                        setSelectedTicket(updated)
                        // Keep the sidebar list snapshot in sync — status and
                        // lastActivityAt may have changed.
                        setSupportTickets(prev => prev.map(t =>
                          t._id === updated._id
                            ? { ...t, status: updated.status, lastActivityAt: updated.lastActivityAt }
                            : t
                        ))
                      }}
                      adminMode
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeSection === 'coupons' ? (
          /* ============= COUPONS (DISCOUNT CODES) SECTION ============= */
          <div>
            {/* Header: breadcrumb + title + action buttons */}
            <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
              <div>
                <nav className="text-sm text-on-surface-variant mb-2">
                  <span>الإدارة</span>
                  <span className="mx-2">/</span>
                  <span className="text-on-surface">أكواد الخصم</span>
                </nav>
                <h2 className="text-2xl font-bold text-on-surface">أكواد الخصم والعروض</h2>
              </div>
              <button
                onClick={() => { resetCouponForm(); setShowCouponForm(true) }}
                className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold hover:bg-primary-container transition-colors flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                كود جديد
              </button>
            </div>

            {/* KPI cards — 4 stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'أكواد نشطة',     value: couponStats.activeCount.toLocaleString('ar-EG'), icon: Ticket,       tint: 'bg-primary/10 text-primary' },
                { label: 'مرّات الاستخدام', value: couponStats.totalUses.toLocaleString('ar-EG'),  icon: TrendingUp,   tint: 'bg-amber-50 text-amber-600' },
                { label: 'إيرادات الأكواد', value: `${(couponStats.totalRevenue / 1000).toFixed(1)}K ج.م`, icon: DollarSign, tint: 'bg-green-50 text-green-600' },
                { label: 'متوسط الخصم',    value: `${couponStats.avgDiscount}%`,                  icon: AlertTriangle, tint: 'bg-red-50 text-red-600' },
              ].map(stat => (
                <div key={stat.label} className="bg-surface-container-lowest rounded-2xl p-5 shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)]">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-sm text-on-surface-variant">{stat.label}</span>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.tint}`}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-on-surface">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Toolbar: sort + tabs + search */}
            <div className="bg-surface-container-lowest rounded-2xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
              <select
                value={couponSort}
                onChange={e => setCouponSort(e.target.value as any)}
                className="bg-surface-container-low border-none rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <option value="newest">ترتيب: الأحدث</option>
                <option value="oldest">ترتيب: الأقدم</option>
                <option value="mostUsed">ترتيب: الأكثر استخداماً</option>
              </select>

              <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
                {([
                  { key: 'all',     label: `الكل (${coupons.length})` },
                  { key: 'active',  label: `نشط (${coupons.filter(c => c.effectiveStatus === 'active').length})` },
                  { key: 'paused',  label: `موقوف (${coupons.filter(c => c.effectiveStatus === 'paused').length})` },
                  { key: 'expired', label: `منتهي (${coupons.filter(c => c.effectiveStatus === 'expired').length})` },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setCouponStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      couponStatusFilter === tab.key
                        ? 'bg-surface-container-lowest text-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[240px] max-w-sm">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="ابحث عن كود أو وصف..."
                  value={couponSearch}
                  onChange={e => setCouponSearch(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-xl pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none text-right"
                />
              </div>
            </div>

            {/* Inline create/edit form */}
            {showCouponForm && (
              <div className="bg-surface-container-lowest rounded-2xl p-6 mb-4 shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)]">
                <h3 className="font-bold text-on-surface mb-4">
                  {editingCouponId ? 'تعديل الكود' : 'إضافة كود جديد'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">الكود *</label>
                    <input
                      type="text" value={couponForm.code}
                      onChange={e => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                      placeholder="SANA3A30"
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">الوصف</label>
                    <input
                      type="text" value={couponForm.description}
                      onChange={e => setCouponForm({ ...couponForm, description: e.target.value })}
                      placeholder="عقد صيانة دورية"
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">نوع الخصم</label>
                    <select
                      value={couponForm.discountType}
                      onChange={e => setCouponForm({ ...couponForm, discountType: e.target.value as any })}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="percentage">نسبة مئوية (%)</option>
                      <option value="fixed">مبلغ ثابت (ج.م)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">قيمة الخصم</label>
                    <input
                      type="number" value={couponForm.discountValue}
                      onChange={e => setCouponForm({ ...couponForm, discountValue: Number(e.target.value) })}
                      min={0}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">حد أدنى للطلب (ج.م)</label>
                    <input
                      type="number" value={couponForm.minOrderAmount}
                      onChange={e => setCouponForm({ ...couponForm, minOrderAmount: Number(e.target.value) })}
                      min={0}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">الحد الأقصى للاستخدام (0 = غير محدود)</label>
                    <input
                      type="number" value={couponForm.maxUses}
                      onChange={e => setCouponForm({ ...couponForm, maxUses: Number(e.target.value) })}
                      min={0}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">تاريخ الانتهاء *</label>
                    <input
                      type="date" value={couponForm.expiresAt}
                      onChange={e => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1">الفئات المشمولة</label>
                    <select
                      multiple
                      value={couponForm.applicableCategories}
                      onChange={e => setCouponForm({
                        ...couponForm,
                        applicableCategories: Array.from(e.target.selectedOptions, o => o.value),
                      })}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none h-24"
                    >
                      {categories.map(cat => (
                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-on-surface-variant mt-1">اتركه فارغاً لتطبيق الكود على جميع الخدمات</p>
                  </div>
                </div>

                {/* Banner / home page section */}
                <div className="mt-6 pt-6 border-t border-outline-variant/15">
                  <label className="flex items-center gap-2 cursor-pointer mb-4">
                    <input
                      type="checkbox" checked={couponForm.showOnHomePage}
                      onChange={e => setCouponForm({ ...couponForm, showOnHomePage: e.target.checked })}
                      className="w-4 h-4 text-primary rounded focus:ring-primary/20"
                    />
                    <span className="font-bold text-on-surface">عرض هذا الكود في قسم العرض الخاص بالصفحة الرئيسية</span>
                  </label>

                  {couponForm.showOnHomePage && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-container-low rounded-xl p-4">
                      <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">عنوان البانر</label>
                        <input
                          type="text" value={couponForm.bannerTitle}
                          onChange={e => setCouponForm({ ...couponForm, bannerTitle: e.target.value })}
                          placeholder="وفر ٣٠٪ على أول خدمة تنظيف لك"
                          className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">نص نداء الزر</label>
                        <input
                          type="text" value={couponForm.bannerCtaLabel}
                          onChange={e => setCouponForm({ ...couponForm, bannerCtaLabel: e.target.value })}
                          className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">رابط صورة البانر</label>
                        <input
                          type="url" value={couponForm.bannerImage}
                          onChange={e => setCouponForm({ ...couponForm, bannerImage: e.target.value })}
                          placeholder="https://..."
                          className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        {couponForm.bannerImage && (
                          <img src={couponForm.bannerImage} alt="" className="mt-2 w-48 h-32 object-cover rounded-lg" onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">نص فرعي (اختياري)</label>
                        <input
                          type="text" value={couponForm.bannerSubtitle}
                          onChange={e => setCouponForm({ ...couponForm, bannerSubtitle: e.target.value })}
                          className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-2.5 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={handleCouponSubmit} className="flex-1 bg-primary text-white py-2.5 rounded-xl font-bold hover:bg-primary-container transition-colors">
                    {editingCouponId ? 'حفظ التعديلات' : 'إنشاء الكود'}
                  </button>
                  <button onClick={resetCouponForm} className="flex-1 bg-surface-container-high text-on-surface-variant py-2.5 rounded-xl font-bold hover:opacity-80 transition-opacity">
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {/* Coupons table */}
            <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)]">
              {coupons.length === 0 ? (
                <div className="py-20 text-center">
                  <Ticket className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
                  <p className="text-on-surface-variant text-lg">لا توجد أكواد حالياً</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface-container-low text-xs text-on-surface-variant">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold">الكود</th>
                      <th className="px-4 py-3 text-right font-semibold">الخصم</th>
                      <th className="px-4 py-3 text-right font-semibold">النطاق</th>
                      <th className="px-4 py-3 text-right font-semibold">الاستخدام</th>
                      <th className="px-4 py-3 text-right font-semibold">الإيراد</th>
                      <th className="px-4 py-3 text-right font-semibold">ينتهي</th>
                      <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map(c => {
                      const usagePct = c.maxUses > 0 ? Math.min(100, (c.currentUses / c.maxUses) * 100) : 0
                      const barColor = c.effectiveStatus === 'expired' ? 'bg-red-500'
                        : usagePct > 80 ? 'bg-amber-500' : 'bg-green-500'
                      const scopeLabel = (c.applicableCategories && c.applicableCategories.length > 0)
                        ? c.applicableCategories.map((cat: any) => cat.name).join('، ')
                        : 'جميع الخدمات'
                      return (
                        <tr key={c._id} className="border-t border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-primary/5 border border-dashed border-primary/30 rounded-lg font-mono font-bold text-primary text-sm">
                                {c.code}
                              </span>
                              <button
                                onClick={() => { navigator.clipboard.writeText(c.code) }}
                                className="text-on-surface-variant hover:text-primary transition-colors"
                                title="نسخ"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {c.description && <p className="text-xs text-on-surface-variant mt-1">{c.description}</p>}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <p className="font-bold text-on-surface">
                              {c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue} ج.م`}
                            </p>
                            {c.minOrderAmount > 0 && (
                              <p className="text-xs text-on-surface-variant">حد أدنى {c.minOrderAmount.toLocaleString('ar-EG')} ج.م</p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-on-surface truncate max-w-[160px]" title={scopeLabel}>{scopeLabel}</td>
                          <td className="px-4 py-4 min-w-[140px]">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-on-surface-variant">{c.maxUses > 0 ? c.maxUses : '∞'}</span>
                              <span className="font-bold text-on-surface">{c.currentUses}</span>
                            </div>
                            <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden">
                              <div className={`h-full ${barColor} transition-all`} style={{ width: `${usagePct}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-on-surface">
                            {c.revenueGenerated ? `${(c.revenueGenerated / 1000).toFixed(1)}K ج.م` : '—'}
                          </td>
                          <td className="px-4 py-4 text-sm text-on-surface-variant">
                            {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                              c.effectiveStatus === 'active' ? 'bg-green-50 text-green-600'
                              : c.effectiveStatus === 'paused' ? 'bg-amber-50 text-amber-600'
                              : 'bg-red-50 text-red-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                c.effectiveStatus === 'active' ? 'bg-green-500'
                                : c.effectiveStatus === 'paused' ? 'bg-amber-500'
                                : 'bg-red-500'
                              }`} />
                              {c.effectiveStatus === 'active' ? 'نشط' : c.effectiveStatus === 'paused' ? 'موقوف' : 'منتهي'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1">
                              {c.effectiveStatus !== 'expired' && (
                                <button
                                  onClick={() => handleToggleCouponStatus(c)}
                                  className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-low rounded-lg transition-colors"
                                  title={c.status === 'active' ? 'إيقاف' : 'تفعيل'}
                                >
                                  {c.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </button>
                              )}
                              <button onClick={() => handleEditCoupon(c)} className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-low rounded-lg transition-colors" title="تعديل">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteCoupon(c._id)} className="p-2 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="حذف">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : activeSection === 'orders' ? (
          /* ============= ORDERS SECTION =============
             This entire block renders when the admin clicks "الطلبات" in the sidebar.
             It has 4 parts: header, filter tabs, data table, and pagination. */
          <div>
            {/* --- Header: Title + Total Count --- */}
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-on-surface">إدارة الطلبات</h2>
              <span className="text-sm text-on-surface-variant">
                إجمالي {adminOrdersPagination.total} طلب
              </span>
            </div>

            {/* --- Filter Tabs ---
                Each tab is a button that sets the filter state.
                When clicked, we also reset to page 1 (so you don't end up
                on page 5 of a filter that only has 2 pages).
                The active tab gets primary styling; inactive tabs are muted. */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {[
                { value: 'all', label: 'الكل' },
                { value: 'in_progress', label: 'قيد التنفيذ' },
                { value: 'history', label: 'المكتملة والملغية' },
                { value: 'pending', label: 'قيد الانتظار' },
                { value: 'accepted', label: 'مقبولة' },
                { value: 'completed', label: 'مكتملة' },
                { value: 'cancelled', label: 'ملغية' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => { setAdminOrdersFilter(f.value); setAdminOrdersPage(1) }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    adminOrdersFilter === f.value
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* --- Orders Table ---
                Uses a standard HTML <table> inside a card container.
                overflow-x-auto allows horizontal scrolling on small screens.
                The empty state shows a receipt icon + message when no orders match. */}
            <div className="bg-surface-container-lowest rounded-xl shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)] overflow-hidden">
              {adminOrders.length === 0 ? (
                <div className="text-center py-16">
                  <Receipt className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
                  <p className="text-on-surface-variant">لا توجد طلبات</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    {/* Table Header */}
                    <thead className="bg-surface-container-low text-on-surface-variant">
                      <tr>
                        <th className="px-6 py-4 font-medium">الطلب</th>
                        <th className="px-6 py-4 font-medium">العميل</th>
                        <th className="px-6 py-4 font-medium">مزود الخدمة</th>
                        <th className="px-6 py-4 font-medium">السعر</th>
                        <th className="px-6 py-4 font-medium">التاريخ</th>
                        <th className="px-6 py-4 font-medium">الحالة</th>
                        <th className="px-6 py-4 font-medium">إجراء</th>
                      </tr>
                    </thead>
                    {/* Table Body — one row per order */}
                    <tbody className="divide-y divide-outline-variant/10">
                      {adminOrders.map((order: any) => {
                        // Look up the status config for this order's status.
                        // If the status isn't in our config (shouldn't happen), fall back to gray.
                        const badge = statusConfig[order.status] || { label: order.status, bg: 'bg-gray-100', text: 'text-gray-500' }
                        return (
                          <tr key={order._id} className="border-b border-outline-variant/10 last:border-0">
                            {/* Column 1: Category name + description preview */}
                            <td className="px-6 py-4">
                              <p className="font-bold text-sm text-on-surface">{order.categoryId?.name || 'خدمة عامة'}</p>
                              {order.description && (
                                <p className="text-xs text-on-surface-variant mt-1 line-clamp-1 max-w-[200px]">{order.description}</p>
                              )}
                            </td>
                            {/* Column 2: Customer info with avatar */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {order.customerId?.profileImage ? (
                                  <img src={order.customerId.profileImage} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                                    {order.customerId?.firstName?.charAt(0) || '?'}
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium">{order.customerId?.firstName} {order.customerId?.lastName}</p>
                                  <p className="text-xs text-on-surface-variant">{order.customerId?.email || order.customerId?.phone || ''}</p>
                                </div>
                              </div>
                            </td>
                            {/* Column 3: Worker (service provider) info */}
                            <td className="px-6 py-4">
                              {order.workerId ? (
                                <div className="flex items-center gap-2">
                                  {order.workerId.profileImage ? (
                                    <img src={order.workerId.profileImage} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
                                      {order.workerId.firstName?.charAt(0) || '?'}
                                    </div>
                                  )}
                                  <p className="text-sm font-medium">{order.workerId.firstName} {order.workerId.lastName}</p>
                                </div>
                              ) : (
                                <span className="text-xs text-on-surface-variant/60">لم يتم التعيين</span>
                              )}
                            </td>
                            {/* Column 4: Price */}
                            <td className="px-6 py-4">
                              <span className="font-bold text-primary">{order.proposedPrice ? `${order.proposedPrice} ج.م` : '—'}</span>
                            </td>
                            {/* Column 5: Creation date (formatted in Arabic) */}
                            <td className="px-6 py-4 text-sm text-on-surface-variant">
                              {formatDate(order.createdAt)}
                            </td>
                            {/* Column 6: Status badge — uses statusConfig for colors */}
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text}`}>
                                {badge.label}
                              </span>
                            </td>
                            {/* Column 7: Action button — only shows cancel for active orders */}
                            <td className="px-6 py-4">
                              {order.status !== 'completed' && order.status !== 'cancelled' && (
                                <button
                                  onClick={() => handleOrderStatus(order._id, 'cancelled')}
                                  className="px-3 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                >
                                  إلغاء
                                </button>
                              )}
                              {order.status === 'cancelled' && (
                                <span className="text-xs text-on-surface-variant/50">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>


            {adminOrdersPagination.pages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button
                  onClick={() => setAdminOrdersPage(p => Math.max(1, p - 1))}
                  disabled={adminOrdersPage === 1}
                  className="px-4 py-2 rounded-xl text-sm bg-surface-container-low text-on-surface-variant disabled:opacity-30 hover:bg-surface-container-high transition-colors"
                >
                  السابق
                </button>
                <span className="text-sm text-on-surface-variant">
                  صفحة {adminOrdersPage} من {adminOrdersPagination.pages}
                </span>
                <button
                  onClick={() => setAdminOrdersPage(p => Math.min(adminOrdersPagination.pages, p + 1))}
                  disabled={adminOrdersPage === adminOrdersPagination.pages}
                  className="px-4 py-2 rounded-xl text-sm bg-surface-container-low text-on-surface-variant disabled:opacity-30 hover:bg-surface-container-high transition-colors"
                >
                  التالي
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* =============================================================
                STAT CARDS ROW — 4 cards showing key platform metrics
                =============================================================*/}
            <div className="grid grid-cols-4 gap-6 mb-8">
              {/* Card 1: Total Users */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] flex items-center justify-between">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <Users className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className="text-on-surface-variant text-sm mb-1">
                    إجمالي المستخدمين
                  </p>
                  <h4 className="text-2xl font-bold text-on-surface">
                    {stats?.totalUsers?.toLocaleString('ar-EG') || '٠'}
                  </h4>
                  {/* ^^^ toLocaleString('ar-EG') converts numbers to Arabic numerals */}
                </div>
              </div>

              {/* Card 2: Active Workers */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] flex items-center justify-between">
                <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600">
                  <Wrench className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className="text-on-surface-variant text-sm mb-1">
                    المزودون النشطون
                  </p>
                  <h4 className="text-2xl font-bold text-on-surface">
                    {stats?.activeWorkers?.toLocaleString('ar-EG') || '٠'}
                  </h4>
                </div>
              </div>

              {/* Card 3: Open Reports */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] flex items-center justify-between">
                <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className="text-on-surface-variant text-sm mb-1">
                    شكاوى مفتوحة
                  </p>
                  <h4 className="text-2xl font-bold text-on-surface">
                    {stats?.openReports?.toLocaleString('ar-EG') || '٠'}
                  </h4>
                </div>
              </div>

              {/* Card 4: Total Sales */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] flex items-center justify-between">
                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-600">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className="text-on-surface-variant text-sm mb-1">
                    إجمالي المبيعات
                  </p>
                  <h4 className="text-2xl font-bold text-on-surface">
                    {stats?.totalSales?.toLocaleString('ar-EG') || '٠'}{' '}
                    <span className="text-sm font-normal text-on-surface-variant">
                      ج.م
                    </span>
                  </h4>
                </div>
              </div>
            </div>

            {/* =============================================================
                BENTO GRID — Main dashboard sections
                =============================================================
 */}
            <div className="grid grid-cols-12 gap-6">
              {/* ===========================================================
                  USER MANAGEMENT TABLE (col-span-8)
                  ===========================================================
 */}
              <div className="col-span-8 bg-surface-container-lowest rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] overflow-hidden">
                {/* Table Header with Filter Tabs */}
                <div className="p-6 pb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-on-surface">
                    إدارة المستخدمين
                  </h3>

                  {/* Filter Tabs: All / Workers / Customers */}
                  <div className="flex gap-2">
                    {[
                      { key: 'all', label: 'كل المستخدمين' },
                      { key: 'worker', label: 'المزودون' },
                      { key: 'customer', label: 'العملاء' },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setUserFilter(tab.key)
                          setUsersPage(1)
                          // ^^^ Reset to page 1 when changing filter
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          userFilter === tab.key
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table */}
                <div className="px-6">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-outline-variant/15">
                        <th className="text-right py-3 text-sm font-medium text-on-surface-variant">
                          المستخدم
                        </th>
                        <th className="text-right py-3 text-sm font-medium text-on-surface-variant">
                          النوع
                        </th>
                        <th className="text-right py-3 text-sm font-medium text-on-surface-variant">
                          التاريخ
                        </th>
                        <th className="text-right py-3 text-sm font-medium text-on-surface-variant">
                          الحالة
                        </th>
                        <th className="text-right py-3 text-sm font-medium text-on-surface-variant">
                          الإجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="text-center py-8 text-on-surface-variant"
                          >
                            لا يوجد مستخدمون
                          </td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr
                            key={u._id}
                            className="border-b border-outline-variant/10 last:border-0 cursor-pointer hover:bg-surface-container-low/50 transition-colors"
                            onClick={() => router.push(`/admin/users/${u._id}`)}
                          >
                            {/* User: Avatar + Name + Email */}
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                                  {u.profileImage ? (
                                    <img
                                      src={u.profileImage}
                                      alt={u.firstName}
                                      className="w-full h-full rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-primary font-bold text-sm">
                                      {u.firstName[0]}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-on-surface text-sm">
                                    {u.firstName} {u.lastName}
                                  </p>
                                  <p className="text-xs text-on-surface-variant">
                                    {u.email || u.phone}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Role Badge */}
                            <td className="py-4">
                              <span className="px-3 py-1 bg-surface-container-low rounded-full text-xs font-medium text-on-surface-variant">
                                {getRoleLabel(u.role)}
                              </span>
                            </td>

                            {/* Join Date */}
                            <td className="py-4 text-sm text-on-surface-variant">
                              {formatDate(u.createdAt)}
                            </td>

                            {/* Status Badge */}
                            <td className="py-4">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(u.status)}`}
                              >
                                {getStatusLabel(u.status)}
                              </span>
                            </td>

                            {/* Action Buttons */}
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                {/* Show different actions based on current status */}
                                {u.status === 'active' && (
                                  <>
                                    <button
                                      onClick={() =>
                                        handleUserStatus(u._id, 'suspended')
                                      }
                                      title="تعليق"
                                      className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 transition-colors"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUserStatus(u._id, 'banned')
                                      }
                                      title="حظر"
                                      className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {u.status === 'suspended' && (
                                  <>
                                    <button
                                      onClick={() =>
                                        handleUserStatus(u._id, 'active')
                                      }
                                      title="تفعيل"
                                      className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUserStatus(u._id, 'banned')
                                      }
                                      title="حظر"
                                      className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {u.status === 'banned' && (
                                  <button
                                    onClick={() =>
                                      handleUserStatus(u._id, 'active')
                                    }
                                    title="إعادة تفعيل"
                                    className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                {/* More options */}
                                <button className="w-8 h-8 rounded-lg bg-surface-container-low text-on-surface-variant flex items-center justify-center hover:bg-surface-container transition-colors">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {usersPagination.pages > 1 && (
                  <div className="p-4 flex items-center justify-center gap-2 border-t border-outline-variant/10">
                    {/* Previous Button */}
                    <button
                      onClick={() =>
                        setUsersPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={usersPage === 1}
                      className="px-3 py-1.5 rounded-lg text-sm bg-surface-container-low text-on-surface-variant disabled:opacity-40 hover:bg-surface-container transition-colors"
                    >
                      السابق
                    </button>

                    {/* Page Numbers */}
                    {Array.from(
                      { length: usersPagination.pages },
                      (_, i) => i + 1
                    ).map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setUsersPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          usersPage === pageNum
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}

                    {/* Next Button */}
                    <button
                      onClick={() =>
                        setUsersPage((prev) =>
                          Math.min(usersPagination.pages, prev + 1)
                        )
                      }
                      disabled={usersPage === usersPagination.pages}
                      className="px-3 py-1.5 rounded-lg text-sm bg-surface-container-low text-on-surface-variant disabled:opacity-40 hover:bg-surface-container transition-colors"
                    >
                      التالي
                    </button>
                  </div>
                )}
              </div>

              {/* ===========================================================
                  VERIFICATION PANEL (col-span-4)
                  ===========================================================
  */}
              <div className="col-span-4 bg-surface-container-lowest rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] overflow-hidden">
                {/* Header with pending count */}
                <div className="p-6 pb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-on-surface">
                    تحقق الهوية
                  </h3>
                  {verificationRequests.length > 0 && (
                    <span className="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                      {verificationRequests.length} طلبات جديدة
                    </span>
                  )}
                </div>

                {/* Verification Request Cards */}
                <div className="px-6 pb-6 space-y-4 max-h-[400px] overflow-y-auto">
                  {verificationRequests.length === 0 ? (
                    // Empty state
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Check className="w-8 h-8 text-green-500" />
                      </div>
                      <p className="text-on-surface-variant text-sm">
                        لا توجد طلبات تحقق معلقة
                      </p>
                    </div>
                  ) : (
                    verificationRequests.map((req) => (
                      <div
                        key={req._id}
                        className="p-4 bg-surface-container-low rounded-xl"
                      >
                        {/* Worker Info */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            {req.userId.profileImage ? (
                              <img
                                src={req.userId.profileImage}
                                alt={req.userId.firstName}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-primary font-bold text-sm">
                                {req.userId.firstName[0]}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-on-surface text-sm">
                              {req.userId.firstName} {req.userId.lastName}
                            </p>
                            <p className="text-xs text-on-surface-variant">
                              {req.Category?.name || req.location?.address || 'مزود خدمة'}
                            </p>
                          </div>
                        </div>

                        {/* Document Thumbnails (if any) */}
                        {req.documents && req.documents.length > 0 && (
                          <div className="flex gap-2 mb-3">
                            {req.documents.slice(0, 3).map((doc, i) => (
                              <div
                                key={i}
                                className="w-16 h-12 bg-surface-container rounded-lg overflow-hidden"
                              >
                                <img
                                  src={doc.fileUrl}
                                  alt={doc.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Accept / Reject Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleVerification(req._id, 'approved')
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            قبول
                          </button>
                          <button
                            onClick={() =>
                              handleVerification(req._id, 'rejected')
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            رفض
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Verification Pagination */}
                  {/* Only show pagination if there are multiple pages.
                      verificationPagination.pages comes from the API response
                      and tells us the total number of pages available. */}
                  {verificationPagination.pages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-4">
                      <button
                        onClick={() => setVerificationPage(p => Math.max(1, p - 1))}
                        disabled={verificationPage === 1}
                        className="px-3 py-1 rounded-lg text-xs bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                      >
                        السابق
                      </button>
                      <span className="text-xs text-on-surface-variant">
                        {verificationPage} / {verificationPagination.pages}
                      </span>
                      <button
                        onClick={() => setVerificationPage(p => Math.min(verificationPagination.pages, p + 1))}
                        disabled={verificationPage === verificationPagination.pages}
                        className="px-3 py-1 rounded-lg text-xs bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                      >
                        التالي
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ===========================================================
                  REPORTS / COMPLAINTS (col-span-6)
                  ===========================================================
 */}
              <div className="col-span-6 bg-surface-container-lowest rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] overflow-hidden">
                <div className="p-6 pb-4">
                  <h3 className="text-lg font-bold text-on-surface mb-4">
                    البلاغات والشكاوى
                  </h3>


                  <div className="flex gap-2">
                    {[
                      { value: 'all', label: 'الكل' },
                      { value: 'pending', label: 'قيد الانتظار' },
                      { value: 'reviewed', label: 'تمت المراجعة' },
                      { value: 'resolved', label: 'تم الحل' },
                    ].map(f => (
                      <button
                        key={f.value}
                        onClick={() => { setReportsFilter(f.value); setReportsPage(1) }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          reportsFilter === f.value
                            ? 'bg-primary text-white'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-6 pb-6 space-y-4">
                  {reports.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Check className="w-8 h-8 text-green-500" />
                      </div>
                      <p className="text-on-surface-variant text-sm">
                        لا توجد بلاغات معلقة
                      </p>
                    </div>
                  ) : (
                    reports.map((report) => (
                      <div
                        key={report._id}
                        className="p-4 bg-surface-container-low rounded-xl"
                      >
                        {/* Report Header: Icon + Reason + Timestamp */}
                        <div className="flex items-start gap-3 mb-2">
                          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-on-surface text-sm">
                                {report.reason}
                              </p>
                              {/* Status badge */}
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  report.status === 'pending'
                                    ? 'bg-amber-50 text-amber-600'
                                    : report.status === 'reviewed'
                                      ? 'bg-blue-50 text-blue-600'
                                      : 'bg-green-50 text-green-600'
                                }`}
                              >
                                {report.status === 'pending'
                                  ? 'معلق'
                                  : report.status === 'reviewed'
                                    ? 'قيد المراجعة'
                                    : 'تم الحل'}
                              </span>
                            </div>
                            <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                              {report.description}
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              <p className="text-xs text-on-surface-variant">
                                بواسطة:{' '}
                                <span className="font-medium">
                                  {report.reportedBy.firstName}{' '}
                                  {report.reportedBy.lastName}
                                </span>
                              </p>
                              <p className="text-xs text-on-surface-variant">
                                {formatDate(report.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        {report.status === 'pending' && (
                          <div className="flex gap-2 mt-3 mr-13">
                            <button
                              onClick={() =>
                                handleReportStatus(report._id, 'reviewed')
                              }
                              className="px-4 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                            >
                              متابعة
                            </button>
                            <button
                              onClick={() =>
                                handleReportStatus(report._id, 'resolved')
                              }
                              className="px-4 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                            >
                              تم الحل
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* Reports Pagination
                      Same pattern as verification pagination above.
                      Only renders when there are 2+ pages of reports. */}
                  {reportsPagination.pages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-4">
                      <button
                        onClick={() => setReportsPage(p => Math.max(1, p - 1))}
                        disabled={reportsPage === 1}
                        className="px-3 py-1 rounded-lg text-xs bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                      >
                        السابق
                      </button>
                      <span className="text-xs text-on-surface-variant">
                        {reportsPage} / {reportsPagination.pages}
                      </span>
                      <button
                        onClick={() => setReportsPage(p => Math.min(reportsPagination.pages, p + 1))}
                        disabled={reportsPage === reportsPagination.pages}
                        className="px-3 py-1 rounded-lg text-xs bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                      >
                        التالي
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ===========================================================
                  CATEGORY MANAGEMENT (col-span-6)
                  ===========================================================
                  Displays all service categories in a 2-column grid.
                  Each card shows the category name and active status.
                  This section uses the categories already fetched from /api/categories. */}
              <div className="col-span-6 bg-surface-container-lowest rounded-xl shadow-[0_2px_12px_-4px_rgba(18,28,42,0.08)] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-on-surface">إدارة التصنيفات</h3>
                  <button
                    onClick={() => { resetCategoryForm(); setShowCategoryForm(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> تصنيف جديد
                  </button>
                </div>

                {/* Add/Edit Category Form */}
                {showCategoryForm && (
                  <div className="bg-surface-container-low rounded-xl p-4 mb-4 space-y-3">
                    <input
                      type="text"
                      placeholder="اسم التصنيف *"
                      value={categoryForm.name}
                      onChange={e => setCategoryForm({...categoryForm, name: e.target.value})}
                      className="w-full bg-white border-none rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="الوصف (اختياري)"
                      value={categoryForm.description}
                      onChange={e => setCategoryForm({...categoryForm, description: e.target.value})}
                      className="w-full bg-white border-none rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="رابط الصورة (اختياري)"
                      value={categoryForm.image}
                      onChange={e => setCategoryForm({...categoryForm, image: e.target.value})}
                      dir="ltr"
                      className="w-full bg-white border-none rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setCategoryForm({...categoryForm, isActive: !categoryForm.isActive})}
                        className={`w-11 h-6 rounded-full transition-colors relative ${categoryForm.isActive ? 'bg-primary' : 'bg-outline-variant/40'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${categoryForm.isActive ? 'right-1' : 'right-6'}`} />
                      </button>
                      <span className="text-sm text-on-surface-variant">{categoryForm.isActive ? 'نشط' : 'غير نشط'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={editingCategoryId ? handleSaveEditCategory : handleAddCategory}
                        className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                      >
                        {editingCategoryId ? 'حفظ التعديل' : 'إضافة'}
                      </button>
                      <button
                        onClick={resetCategoryForm}
                        className="flex-1 bg-surface-container-high text-on-surface-variant py-2 rounded-lg text-sm font-bold hover:opacity-80 transition-opacity"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {/* Category Grid */}
                {categories.length === 0 && !showCategoryForm ? (
                  <p className="text-center text-on-surface-variant text-sm py-8">لا توجد تصنيفات</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {categories.map(cat => (
                      <div key={cat._id} className="bg-surface-container-low p-4 rounded-xl group relative">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                            {cat.image ? (
                              <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                            ) : (
                              <Wrench className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-on-surface truncate">{cat.name}</p>
                            {cat.description && (
                              <p className="text-[10px] text-on-surface-variant truncate">{cat.description}</p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${cat.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            {cat.isActive ? 'نشط' : 'غير نشط'}
                          </span>
                        </div>
                        {/* Hover action buttons */}
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button onClick={() => startEditCategory(cat)} className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" title="تعديل">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleToggleCategoryActive(cat)} className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center text-on-surface-variant hover:text-amber-600 transition-colors" title={cat.isActive ? 'تعطيل' : 'تفعيل'}>
                            {cat.isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button onClick={() => handleDeleteCategory(cat._id)} className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center text-red-400 hover:text-red-600 transition-colors" title="حذف">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
