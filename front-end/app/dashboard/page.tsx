'use client'

/**
 * Worker Dashboard Page — /dashboard
 *
 * This is a PROTECTED page: only logged-in users with role === 'worker' can access it.
 * It follows the same sidebar + main-content layout as the customer /profile page,
 * but tailored for workers: managing services, viewing incoming orders, and tracking earnings.
 *

 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Briefcase, ShoppingBag, DollarSign,
  Clock, ChevronLeft, ChevronRight, Calendar, MapPin,
  Check, X as XIcon, Play, CheckCircle2, Wallet, CreditCard,
  Upload, Loader2, ImageIcon, FileCheck2, ArrowDownCircle,
  TrendingUp, Landmark, AlertTriangle, Camera,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import CompletionReportCard from '@/components/CompletionReportCard'
import RateCustomerModal from '@/components/RateCustomerModal'
import RankBadge from '@/components/RankBadge'
import LicensesEditor from '@/components/LicensesEditor'
import AddressPicker, { type PickedAddress } from '@/components/AddressPicker/AddressPicker'
import LocationViewer from '@/components/AddressPicker/LocationViewer'
import { serviceFormSchema, type ServiceFormValues } from '@/lib/schemas'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { uploadChatFile } from '@/lib/upload'
import type {
  WorkerProfile, WorkerService, WorkerServiceRequest,
  WorkerDashboardStats, PaginationInfo, Category,
  WorkerWalletSummary, WalletTransaction,
} from '@/lib/types'

// ─── Status Badge Config ─────────────────────────────────────────────
// Maps each order status string to its Arabic label + Tailwind color classes.
// We reuse the exact same config from the customer profile page for consistency.
const statusColors: Record<string, { bg: string; text: string; key: string }> = {
  pending:     { bg: 'bg-amber-50',   text: 'text-amber-600', key: 'statusPending' },
  accepted:    { bg: 'bg-blue-50',    text: 'text-blue-600',  key: 'statusAccepted' },
  in_progress: { bg: 'bg-primary/10', text: 'text-primary',   key: 'statusInProgress' },
  completed:   { bg: 'bg-green-50',   text: 'text-green-600', key: 'statusCompleted' },
  rejected:    { bg: 'bg-red-50',     text: 'text-red-600',   key: 'statusRejected' },
  cancelled:   { bg: 'bg-gray-100',   text: 'text-gray-500',  key: 'statusCancelled' },
}

export default function WorkerDashboardPage() {
  // ─── Auth Hook ───────────────────────────────────────────────────
  // useAuth() comes from our AuthContext provider. It gives us:
  //   user       — the logged-in user object (or null)
  //   isLoggedIn — boolean shorthand for !!user
  //   isLoading  — true while the initial auth check is happening
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()
  const t = useTranslations('dashboard')
  const router = useRouter()

  // ─── Page State ──────────────────────────────────────────────────
  // workerProfile: the full worker profile object from the backend
  // stats: aggregated numbers (pending orders, completed, earnings)
  // services: array of the worker's services for the "خدماتي" tab
  // orders: array of orders for the current tab (active or history)
  // pagination: page/limit/total/pages for order pagination
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null)
  const [stats, setStats] = useState<WorkerDashboardStats | null>(null)
  const [services, setServices] = useState<WorkerService[]>([])
  const [orders, setOrders] = useState<WorkerServiceRequest[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 0 })

  // activeTab controls which content section is shown in the main area
  const [activeTab, setActiveTab] = useState<'profile' | 'services' | 'active_orders' | 'history' | 'wallet'>('services')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // ─── Wallet state ────────────────────────────────────────────────
  // Populated on first visit to the "المحفظة" tab and refetched whenever
  // the worker re-enters the tab (so a fresh credit from just-completed
  // orders shows up without a full page reload).
  const [wallet, setWallet] = useState<WorkerWalletSummary | null>(null)
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)

  // ─── Service Form State ──────────────────────────────────────────
  // showAddService: whether the inline add/edit form is visible
  // editingServiceId: if non-null, we're editing an existing service (not creating)
  //
  // The form itself is now driven by react-hook-form + zod (serviceFormSchema).
  // We keep a `serviceForm` const that's a live snapshot via watch() so all the
  // existing `serviceForm.X` reads in this file keep working unchanged. Writes
  // go through serviceFormApi.setValue / .reset.
  const [showAddService, setShowAddService] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)

  const SERVICE_DEFAULTS: ServiceFormValues = {
    name: '',
    description: '',
    price: 0,
    typeofService: 'fixed',
    priceRange: { min: 0, max: 0 },
    paymentTiming: 'before',
    categoryId: '',
    images: [],
  }
  const serviceFormApi = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: SERVICE_DEFAULTS,
    mode: 'onTouched',
  })
  // Watched snapshot — re-renders on every field change. All `serviceForm.X`
  // reads below stay readable; writes flow through serviceFormApi.
  const serviceForm = serviceFormApi.watch()
  // imageInput: temporary holder for the URL typed in the add-image input
  const [imageInput, setImageInput] = useState('')
  const [availableCategories, setAvailableCategories] = useState<Category[]>([])

  // ─── Service CRUD UX state ──────────────────────────────────────
  // serviceSaving: true while add or edit POST/PUT is in flight; disables
  //   the submit button so a second click can't double-create the same row.
  // serviceError: message shown above the form if validation fails OR the
  //   backend rejects (auth/validation/500). Cleared on next submit.
  // deletingServiceId: id of the service we're confirming deletion of.
  //   Inline confirmation strip (matches the existing inline pattern in this
  //   file — no global modal system yet) appears on the card while non-null.
  const [serviceSaving, setServiceSaving] = useState(false)
  const [serviceError, setServiceError] = useState('')
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null)
  const [deletingInFlight, setDeletingInFlight] = useState(false)

  // Service image file picker — hidden input + spinner state. Lets the worker
  // upload images directly from their device (Cloudinary unsigned preset)
  // instead of having to host them somewhere and paste a URL. The URL input
  // stays as a fallback for the rare case someone has a hosted asset.
  const MAX_SERVICE_IMAGES = 6
  const serviceImagesInputRef = useRef<HTMLInputElement>(null)
  const [uploadingServiceImages, setUploadingServiceImages] = useState(false)

  // ─── Profile editor state (ملفي tab) ─────────────────────────────
  // Tracks whether any of the editors is currently saving so all the
  // primary actions can disable in unison.
  const [profileSaving, setProfileSaving] = useState(false)

  // Avatar upload — separate spinner state so the rest of the editor
  // stays interactive during the Cloudinary round-trip.
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Portfolio (Business Gallery) editor: when null, the list view shows.
  // When non-null, the inline form for that draft replaces the list.
  type PortfolioDraft = {
    _editingIndex: number | null
    title: string
    description: string
    images: string[]
    completedAt: string // YYYY-MM-DD
  }
  const [portfolioDraft, setPortfolioDraft] = useState<PortfolioDraft | null>(null)
  const [portfolioImageInput, setPortfolioImageInput] = useState('')

  // Portfolio image file picker — same rationale as the service uploader.
  const MAX_PORTFOLIO_IMAGES = 8
  const portfolioImagesInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPortfolioImages, setUploadingPortfolioImages] = useState(false)

  const openNewPortfolioItem = () => {
    setPortfolioDraft({ _editingIndex: null, title: '', description: '', images: [], completedAt: '' })
    setPortfolioImageInput('')
  }
  const openEditPortfolioItem = (idx: number) => {
    const item = workerProfile?.portfolio?.[idx]
    if (!item) return
    setPortfolioDraft({
      _editingIndex: idx,
      title: item.title || '',
      description: item.description || '',
      images: [...(item.images || [])],
      completedAt: item.completedAt ? new Date(item.completedAt).toISOString().slice(0, 10) : '',
    })
    setPortfolioImageInput('')
  }
  const cancelPortfolioDraft = () => {
    setPortfolioDraft(null)
    setPortfolioImageInput('')
  }
  const addImageToDraft = () => {
    const url = portfolioImageInput.trim()
    if (!url || !portfolioDraft) return
    setPortfolioDraft({ ...portfolioDraft, images: [...portfolioDraft.images, url] })
    setPortfolioImageInput('')
  }
  const removeImageFromDraft = (idx: number) => {
    if (!portfolioDraft) return
    setPortfolioDraft({
      ...portfolioDraft,
      images: portfolioDraft.images.filter((_, i) => i !== idx),
    })
  }

  const savePortfolioDraft = async () => {
    if (!portfolioDraft || !workerProfile) return
    if (!portfolioDraft.title.trim()) return alert(t('alerts.titleRequired'))

    const next = [...(workerProfile.portfolio || [])]
    const cleaned = {
      title: portfolioDraft.title.trim(),
      description: portfolioDraft.description.trim(),
      images: portfolioDraft.images,
      completedAt: portfolioDraft.completedAt || undefined,
    }
    if (portfolioDraft._editingIndex === null) {
      next.push(cleaned)
    } else {
      next[portfolioDraft._editingIndex] = cleaned
    }

    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', { portfolio: next })
      setWorkerProfile(data.profile)
      setPortfolioDraft(null)
    } catch (err: any) {
      alert(err?.message || t('alerts.saveFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  const deletePortfolioItem = async (idx: number) => {
    if (!workerProfile) return
    if (!confirm(t('alerts.deletePortfolioConfirm'))) return
    const next = (workerProfile.portfolio || []).filter((_, i) => i !== idx)
    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', { portfolio: next })
      setWorkerProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || t('alerts.deleteFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  // ─── Packages editor ─────────────────────────────────────────────
  // Same pattern as the portfolio editor: a draft state holds the
  // form for the item being added/edited; saving writes the full
  // packages array via PUT /api/worker/profile.
  type PackageDraft = {
    _editingIndex: number | null
    title: string
    description: string
    price: string // string in the form, parsed to number on save
    features: string // newline- or comma-separated; split on save
  }
  const [packageDraft, setPackageDraft] = useState<PackageDraft | null>(null)

  const openNewPackage = () => {
    setPackageDraft({ _editingIndex: null, title: '', description: '', price: '', features: '' })
  }
  const openEditPackage = (idx: number) => {
    const pkg = workerProfile?.packages?.[idx]
    if (!pkg) return
    setPackageDraft({
      _editingIndex: idx,
      title: pkg.title || '',
      description: pkg.description || '',
      price: pkg.price ? String(pkg.price) : '',
      features: (pkg.features || []).join('\n'),
    })
  }
  const cancelPackageDraft = () => setPackageDraft(null)

  const savePackageDraft = async () => {
    if (!packageDraft || !workerProfile) return
    if (!packageDraft.title.trim()) return alert(t('alerts.packageTitleRequired'))
    const features = packageDraft.features
      .split(/[,،\n]/)
      .map(f => f.trim())
      .filter(Boolean)
    const cleaned = {
      title: packageDraft.title.trim(),
      description: packageDraft.description.trim(),
      price: Number(packageDraft.price) || 0,
      features,
    }
    const next = [...(workerProfile.packages || [])]
    if (packageDraft._editingIndex === null) {
      next.push(cleaned)
    } else {
      next[packageDraft._editingIndex] = cleaned
    }
    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', { packages: next })
      setWorkerProfile(data.profile)
      setPackageDraft(null)
    } catch (err: any) {
      alert(err?.message || t('alerts.saveFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  const deletePackage = async (idx: number) => {
    if (!workerProfile) return
    if (!confirm(t('alerts.deletePackageConfirm'))) return
    const next = (workerProfile.packages || []).filter((_, i) => i !== idx)
    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', { packages: next })
      setWorkerProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || t('alerts.deleteFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  // ─── Working hours editor ────────────────────────────────────────
  // Default-schedule + day-off model: one pair of from/to applies to all
  // working days. The user picks which days are off via chip toggles.
  // On save we expand the simple form into 7 entries (one per day).
  type HoursDraft = {
    defaultFrom: string
    defaultTo: string
    daysOff: string[]
  }
  const DAY_ORDER_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const
  const DAY_LABELS: Record<string, string> = {
    sat: t('days.sat'), sun: t('days.sun'), mon: t('days.mon'), tue: t('days.tue'),
    wed: t('days.wed'), thu: t('days.thu'), fri: t('days.fri'),
  }
  const deriveHoursDraft = (entries: WorkerProfile['workingHours']): HoursDraft => {
    const list = entries || []
    const enabled = list.filter(e => e.enabled)
    const daysOff = DAY_ORDER_KEYS.filter(d => {
      const entry = list.find(e => e.day === d)
      return entry ? !entry.enabled : false
    })
    return {
      defaultFrom: enabled[0]?.from || '09:00',
      defaultTo: enabled[0]?.to || '18:00',
      daysOff,
    }
  }
  const hasMixedSchedule = (entries: WorkerProfile['workingHours']): boolean => {
    const enabled = (entries || []).filter(e => e.enabled)
    if (enabled.length <= 1) return false
    const f = enabled[0].from, t = enabled[0].to
    return enabled.some(e => e.from !== f || e.to !== t)
  }

  const [hoursDraft, setHoursDraft] = useState<HoursDraft>({ defaultFrom: '09:00', defaultTo: '18:00', daysOff: [] })

  useEffect(() => {
    if (workerProfile) {
      setHoursDraft(deriveHoursDraft(workerProfile.workingHours))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerProfile])

  const toggleDayOff = (day: string) => {
    setHoursDraft(prev => ({
      ...prev,
      daysOff: prev.daysOff.includes(day)
        ? prev.daysOff.filter(d => d !== day)
        : [...prev.daysOff, day],
    }))
  }

  const saveWorkingHours = async () => {
    if (!workerProfile) return
    const expanded = DAY_ORDER_KEYS.map(day => {
      const off = hoursDraft.daysOff.includes(day)
      return {
        day,
        from: off ? '' : hoursDraft.defaultFrom,
        to: off ? '' : hoursDraft.defaultTo,
        enabled: !off,
      }
    })
    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', { workingHours: expanded })
      setWorkerProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || t('alerts.saveFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  // ─── Worker type toggle ──────────────────────────────────────────
  const saveWorkerType = async (typeOfWorker: 'individual' | 'company') => {
    if (!workerProfile) return
    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', { typeOfWorker })
      setWorkerProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || t('alerts.saveFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  // ─── Bio + skills + location + tagline editor ────────────────────
  type ProfileTextDraft = {
    bio: string
    location: string
    skills: string // comma- or newline-separated; we split on save
    title: string  // doubles as the tagline/quote on the public profile
  }
  const [profileTextDraft, setProfileTextDraft] = useState<ProfileTextDraft>({ bio: '', location: '', skills: '', title: '' })

  // Map-picker state for the worker's geo location. Coords live separately
  // from `profileTextDraft.location` (which is the human-readable address)
  // because they're saved through a different endpoint —
  // PUT /api/workers/me/location — that writes to the GeoJSON `point` field
  // used by the 2dsphere index. The text address is saved by /worker/profile.
  const [locationPicker, setLocationPicker] = useState(false)
  const [savedCoords, setSavedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [savingCoords, setSavingCoords] = useState(false)

  // Order-pin viewer state. Populated when the worker clicks "عرض على
  // الخريطة" on an order card; the LocationViewer modal lazy-loads the
  // map bundle on first open.
  const [viewingOrderPin, setViewingOrderPin] = useState<{ lat: number; lng: number; address?: string } | null>(null)

  useEffect(() => {
    if (workerProfile) {
      setProfileTextDraft({
        bio: workerProfile.userId?.bio || '',
        location: workerProfile.location?.address || '',
        skills: (workerProfile.skills || []).join(', '),
        title: workerProfile.title || '',
      })
      // Hydrate the coords indicator from the saved profile. GeoJSON
      // coordinates is [lng, lat]; we surface them as {lat, lng}.
      const coords = workerProfile.location?.point?.coordinates
      if (Array.isArray(coords) && coords.length === 2) {
        setSavedCoords({ lat: coords[1], lng: coords[0] })
      } else {
        setSavedCoords(null)
      }
    }
  }, [workerProfile])

  // Called when the worker confirms a pin in the AddressPicker. Persists to
  // the geo-aware endpoint so $geoNear can find this worker on the customer
  // listings. Also folds the reverse-geocoded address into the text draft
  // (and saves it via the normal profile endpoint) so both halves stay in
  // sync — coords for the index, address for display on cards.
  const handleLocationPicked = async (picked: PickedAddress) => {
    setLocationPicker(false)
    try {
      setSavingCoords(true)
      // 1) Save coords to the geo endpoint. The backend assembles the
      //    GeoJSON Point and writes location.point + location.address|city.
      await api.putWithAuth('/workers/me/location', {
        lat: picked.lat,
        lng: picked.lng,
        address: picked.address || profileTextDraft.location,
        city: picked.city || '',
      })
      setSavedCoords({ lat: picked.lat, lng: picked.lng })
      // 2) Mirror the address into the visible text input so the worker
      //    can still tweak it manually before clicking "حفظ المعلومات".
      if (picked.address) {
        setProfileTextDraft(prev => ({ ...prev, location: picked.address! }))
      }
    } catch (err: any) {
      alert(err?.message || t('alerts.saveLocationFailed'))
    } finally {
      setSavingCoords(false)
    }
  }

  // Avatar upload — Cloudinary direct, then PUT /worker/profile with
  // the URL. We update workerProfile in place so the sidebar avatar
  // refreshes immediately.
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert(t('alerts.imageOnly'))
      e.target.value = ''
      return
    }
    try {
      setAvatarUploading(true)
      const { url } = await uploadChatFile(file)
      const data = await api.putWithAuth('/worker/profile', { profileImage: url })
      setWorkerProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || t('alerts.uploadFailed'))
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  // Multi-image picker for the service form. Uploads each chosen image to
  // Cloudinary in parallel, then appends successful URLs to serviceForm.images.
  // Failed uploads are surfaced via the existing serviceError banner so the
  // worker knows some files didn't make it.
  //
  // The room-left calculation runs against the CURRENT form state — if the
  // worker has already added 4 images and picks 5 more, only the first 2
  // upload (cap is 6). The rest are skipped with a clear message.
  const handleServiceImagesPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // reset the input so picking the same file twice works
    if (files.length === 0) return

    const currentImages = serviceFormApi.getValues('images') || []
    const room = MAX_SERVICE_IMAGES - currentImages.length
    const toUpload = files.slice(0, room)
    if (toUpload.length === 0) {
      setServiceError(t('alerts.maxServiceImages', { n: MAX_SERVICE_IMAGES }))
      return
    }

    setUploadingServiceImages(true)
    setServiceError('')
    try {
      const uploads = await Promise.all(
        toUpload.map(f =>
          uploadChatFile(f)
            .then(r => r.url)
            .catch(err => {
              console.error('Service image upload failed:', err)
              return null
            }),
        ),
      )
      const urls = uploads.filter((u): u is string => !!u)
      const next = [...currentImages, ...urls]
      serviceFormApi.setValue('images', next, { shouldValidate: true, shouldDirty: true })
      if (urls.length < toUpload.length) {
        setServiceError(t('alerts.someUploadsFailed'))
      } else if (toUpload.length < files.length) {
        setServiceError(t('alerts.onlyUploaded', { n: toUpload.length, max: MAX_SERVICE_IMAGES }))
      }
    } finally {
      setUploadingServiceImages(false)
    }
  }

  // Same shape as handleServiceImagesPick but writing into portfolioDraft
  // instead of serviceForm. Kept inline rather than abstracted because the
  // two call sites differ in their target state shape — abstracting would
  // hide the data flow without saving meaningful lines.
  const handlePortfolioImagesPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0 || !portfolioDraft) return

    const room = MAX_PORTFOLIO_IMAGES - portfolioDraft.images.length
    const toUpload = files.slice(0, room)
    if (toUpload.length === 0) {
      alert(t('alerts.maxPortfolioImages', { n: MAX_PORTFOLIO_IMAGES }))
      return
    }

    setUploadingPortfolioImages(true)
    try {
      const uploads = await Promise.all(
        toUpload.map(f =>
          uploadChatFile(f)
            .then(r => r.url)
            .catch(err => {
              console.error('Portfolio image upload failed:', err)
              return null
            }),
        ),
      )
      const urls = uploads.filter((u): u is string => !!u)
      // Re-read the latest draft inside the setter to avoid stale-closure issues
      // when the worker types in another field while uploads are running.
      setPortfolioDraft(prev => prev ? { ...prev, images: [...prev.images, ...urls] } : prev)
      if (urls.length < toUpload.length) {
        alert(t('alerts.someUploadsFailed'))
      } else if (toUpload.length < files.length) {
        alert(t('alerts.onlyUploaded', { n: toUpload.length, max: MAX_PORTFOLIO_IMAGES }))
      }
    } finally {
      setUploadingPortfolioImages(false)
    }
  }

  const saveProfileText = async () => {
    if (!workerProfile) return
    const skills = profileTextDraft.skills
      .split(/[,،\n]/)
      .map(s => s.trim())
      .filter(Boolean)
    try {
      setProfileSaving(true)
      const data = await api.putWithAuth('/worker/profile', {
        bio: profileTextDraft.bio,
        location: profileTextDraft.location,
        skills,
        title: profileTextDraft.title,
      })
      setWorkerProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || t('alerts.saveFailed'))
    } finally {
      setProfileSaving(false)
    }
  }

  // ─── Auth Guards ─────────────────────────────────────────────────
  // Guard 1: If not logged in at all, redirect to sign-in page.
  // We wait until authLoading is false so we don't redirect during the initial check.
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.push('/signin')
    }
  }, [authLoading, isLoggedIn, router])

  // Guard 2: If the user IS logged in but is NOT a worker, send them to homepage.
  // This prevents a customer from accessing the worker dashboard by typing the URL.
  useEffect(() => {
    if (!authLoading && isLoggedIn && user?.role !== 'worker') {
      router.push('/')
    }
  }, [authLoading, isLoggedIn, user, router])

  // ─── Fetch Dashboard Data (profile + stats) ─────────────────────
  // Runs once when the user is confirmed logged in.
  // The backend endpoint /worker/dashboard returns both the worker profile
  // and aggregated stats in a single response to reduce API calls.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'worker') return

    api.getWithAuth('/worker/dashboard')
      .then(data => {
        setWorkerProfile(data.profile)
        setStats(data.stats)
        // Pre-populate services from the profile's embedded services array.
        // This avoids an extra API call when the user first lands on the services tab.
        if (data.profile?.services) {
          setServices(data.profile.services)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load worker dashboard:', err)
        setLoading(false)
      })
  }, [isLoggedIn, user])

  // ─── Fetch Orders When Tab or Page Changes ──────────────────────
  // This effect fires whenever the user switches between "active orders" and "history" tabs,
  // or clicks a pagination button. It maps the tab name to the backend status query param.
  useEffect(() => {
    // Only fetch orders when we're on an orders tab — skip profile/services/wallet
    if (!isLoggedIn || activeTab === 'profile' || activeTab === 'services' || activeTab === 'wallet') return

    setLoading(true)

    // Map tab name to the status query parameter the backend expects:
    //   'active_orders' → fetch pending + accepted + in_progress
    //   'history'       → fetch completed + cancelled + rejected
    // The backend's getMyOrders only recognizes two status values: "in_progress"
    // (maps to pending+accepted+in_progress) and anything else (history =
    // completed+cancelled+rejected). Sending "active" here falls through to
    // the history branch, so the worker sees the wrong list.
    const statusParam = activeTab === 'active_orders' ? 'in_progress' : 'history'

    api.getWithAuth(`/worker/orders?status=${statusParam}&page=${currentPage}&limit=10`)
      .then(data => {
        setOrders(data.orders)
        setPagination(data.pagination)
      })
      .catch(err => console.error('Failed to load orders:', err))
      .finally(() => setLoading(false))
  }, [isLoggedIn, activeTab, currentPage])

  // Fetch categories for the service form dropdown
  useEffect(() => {
    api.get('/categories')
      .then(data => setAvailableCategories(data.categories))
      .catch(err => console.error('Failed to load categories:', err))
  }, [])

  // ─── Tab Change Handler ──────────────────────────────────────────
  // When switching tabs, reset the page to 1 so we always start at the beginning.
  const handleTabChange = (tab: 'profile' | 'services' | 'active_orders' | 'history' | 'wallet') => {
    setActiveTab(tab)
    setCurrentPage(1)
  }

  // ─── Fetch wallet when the wallet tab becomes active ───────────
  // Always refetches on entering the tab rather than caching — a worker might
  // have completed an order in another tab / browser and the credit needs to
  // appear without forcing a full page reload.
  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'worker') return
    if (activeTab !== 'wallet') return
    setWalletLoading(true)
    api.getWithAuth('/worker/wallet')
      .then(data => {
        setWallet(data.wallet)
        setWalletTransactions(data.transactions || [])
      })
      .catch(err => console.error('Failed to load wallet:', err))
      .finally(() => setWalletLoading(false))
  }, [isLoggedIn, user, activeTab])

  // ─── Helper: Format Date to Arabic ──────────────────────────────
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  // ─── Helper: Get User Initial for Avatar Fallback ───────────────
  const getInitial = () => {
    return workerProfile?.userId?.firstName?.charAt(0) || user?.firstName?.charAt(0) || '?'
  }

  // ─── Service CRUD Handlers ──────────────────────────────────────
  //
  // The form is now driven by react-hook-form. The zod schema does the
  // field-level validation (the previous validateServiceForm is unnecessary).
  // handleAddService / handleSaveEdit are RHF onValid handlers — they only
  // run after the schema passes, so they don't re-check the values themselves.

  /**
   * handleAddService — POST a new service to the backend.
   * After success, we add it to local state so the UI updates instantly
   * without needing to re-fetch the entire list. Failures surface in the
   * inline error banner instead of being swallowed by console.error.
   */
  const handleAddService = async (values: ServiceFormValues) => {
    setServiceError('')
    setServiceSaving(true)
    try {
      const data = await api.postWithAuth('/worker/services', values)
      // data.service is the newly created service object from the backend
      setServices(prev => [...prev, data.service])
      resetServiceForm()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('alerts.addServiceFailed')
      setServiceError(msg)
    } finally {
      setServiceSaving(false)
    }
  }

  /**
   * handleSaveEdit — PUT (update) an existing service
   * We find the service in local state by its _id and replace it with the updated version.
   */
  const handleSaveEdit = async (values: ServiceFormValues) => {
    if (!editingServiceId) return
    setServiceError('')
    setServiceSaving(true)
    try {
      const data = await api.putWithAuth(`/worker/services/${editingServiceId}`, values)
      // Replace the old service object in the array with the updated one
      setServices(prev => prev.map(s => s._id === editingServiceId ? data.service : s))
      resetServiceForm()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('alerts.updateServiceFailed')
      setServiceError(msg)
    } finally {
      setServiceSaving(false)
    }
  }

  /**
   * handleToggleActive — Toggle a service's active/inactive status
   * Uses optimistic update: we change the UI immediately, then send the request.
   * If the request fails, we revert the change.
   */
  const handleToggleActive = async (service: WorkerService) => {
    const newActive = !service.active
    // Optimistic update — flip the toggle in UI immediately for snappy feel
    setServices(prev => prev.map(s => s._id === service._id ? { ...s, active: newActive } : s))
    try {
      await api.putWithAuth(`/worker/services/${service._id}`, { active: newActive })
    } catch (err: any) {
      // Revert on failure — flip it back
      setServices(prev => prev.map(s => s._id === service._id ? { ...s, active: service.active } : s))
      console.error('Failed to toggle service:', err.message)
    }
  }

  /**
   * handleDeleteService — DELETE a service permanently.
   * Two-step UX: the trash button on a card sets `deletingServiceId`, which
   * swaps the card footer to a "تأكيد الحذف؟" inline confirm strip. Only the
   * second click here actually fires the DELETE. This matches the file's
   * existing inline-confirm pattern (no global modal system yet) and prevents
   * accidental data loss when the trash icon is mis-clicked.
   */
  const handleDeleteService = async (id: string) => {
    setDeletingInFlight(true)
    try {
      await api.deleteWithAuth(`/worker/services/${id}`)
      // Filter out the deleted service from state
      setServices(prev => prev.filter(s => s._id !== id))
      setDeletingServiceId(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('alerts.deleteServiceFailed')
      // Surface as the same banner so the worker sees what failed.
      setServiceError(msg)
    } finally {
      setDeletingInFlight(false)
    }
  }

  // ─── Order lifecycle handler ─────────────────────────────────────
  //
  // Worker can transition order.status through the accept/reject/progress/
  // complete chain via PUT /api/worker/orders/:id/status. The backend enforces
  // legal transitions; this function just routes the chosen action.
  //
  // The in_progress → completed transition has extra state: the worker must
  // submit a completion report (details + at least one image) as proof of
  // work. That flow is handled by the modal (completingOrder, handleSubmitCompletion)
  // below — this function is NOT used for that transition. Here we only
  // handle the "no-report-needed" transitions: accept/reject/start/cancel.
  //
  // After a successful call, we remove the order from the active list (when it
  // moved to a terminal state) or update its status in place (otherwise).
  // Worker response to a customer-initiated cancellation request.
  // action=approved → order flips to cancelled (drops from active tab)
  // action=denied  → request marked denied, order continues as before
  //
  // If denying, we prompt for an optional explanation so the customer can
  // see why the worker is pushing back (matches the rejection-reason UX).
  const handleCancellationResponse = async (
    orderId: string,
    action: 'approved' | 'denied',
  ) => {
    let denialReason: string | undefined
    if (action === 'denied') {
      const reason = window.prompt(t('alerts.cancelRequestRejectReasonPrompt'))
      if (reason === null) return
      denialReason = reason.trim() || undefined
    }
    try {
      await api.putWithAuth(`/worker/orders/${orderId}/cancellation`, {
        action,
        denialReason,
      })
      setOrders(prev => {
        if (action === 'approved') {
          // Order is now cancelled — disappears from the active tab.
          return prev.filter(o => o._id !== orderId)
        }
        return prev.map(o => o._id === orderId
          ? { ...o, cancellationRequest: { ...(o.cancellationRequest || {}), status: 'denied' as const, denialReason } }
          : o
        )
      })
    } catch (err: any) {
      console.error('Failed to respond to cancellation:', err)
      window.alert(err?.message || t('alerts.cancelRequestFailed'))
    }
  }

  const handleOrderStatusUpdate = async (
    orderId: string,
    status: 'accepted' | 'rejected' | 'in_progress' | 'cancelled',
  ) => {
    let rejectionReason: string | undefined
    if (status === 'rejected') {
      const reason = window.prompt(t('alerts.rejectReasonPrompt'))
      // Null means user clicked Cancel on the prompt — abort the whole action.
      if (reason === null) return
      rejectionReason = reason.trim() || undefined
    }

    try {
      await api.putWithAuth(`/worker/orders/${orderId}/status`, {
        status,
        rejectionReason,
      })

      // Terminal statuses (from active tab's perspective) drop out of view.
      const terminalFromActive = ['rejected', 'cancelled']
      setOrders(prev => {
        if (terminalFromActive.includes(status)) {
          return prev.filter(o => o._id !== orderId)
        }
        return prev.map(o => o._id === orderId
          ? { ...o, status: status as WorkerServiceRequest['status'], ...(rejectionReason ? { rejectionReason } : {}) }
          : o
        )
      })
    } catch (err: any) {
      console.error('Failed to update order status:', err)
      window.alert(err?.message || t('alerts.updateStatusFailed'))
    }
  }

  // ─── Completion report modal ────────────────────────────────────
  //
  // When the worker clicks "إنهاء الخدمة" on an in_progress order, we open a
  // modal that requires details text + at least one image before marking the
  // order as completed. This is the "proof of work" handoff — the customer
  // sees the report on their orders list, and it's the worker's answer to
  // "how do I know the job was actually done?" for future disputes.
  //
  // Images go to Cloudinary (same pipeline as chat attachments) and only the
  // returned URLs are sent to our backend.
  const [completingOrder, setCompletingOrder] = useState<WorkerServiceRequest | null>(null)
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set())
  const [rateTarget, setRateTarget] = useState<{ orderId: string; customerName: string } | null>(null)
  const [completionDetails, setCompletionDetails] = useState('')
  const [completionImages, setCompletionImages] = useState<string[]>([])
  const [completionUploading, setCompletionUploading] = useState(false)
  const [completionSubmitting, setCompletionSubmitting] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const MAX_COMPLETION_IMAGES = 6

  const openCompletionModal = (order: WorkerServiceRequest) => {
    setCompletingOrder(order)
    setCompletionDetails('')
    setCompletionImages([])
    setCompletionError('')
  }

  const closeCompletionModal = () => {
    if (completionSubmitting || completionUploading) return // don't close mid-flight
    setCompletingOrder(null)
    setCompletionDetails('')
    setCompletionImages([])
    setCompletionError('')
  }

  const handleCompletionImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    // Enforce the image cap client-side so users don't burn upload quota
    // uploading a 7th image that the backend would accept but we'd drop.
    const room = MAX_COMPLETION_IMAGES - completionImages.length
    const toUpload = files.slice(0, room)
    if (toUpload.length === 0) {
      setCompletionError(t('alerts.maxCompletionImages', { n: MAX_COMPLETION_IMAGES }))
      return
    }
    setCompletionUploading(true)
    setCompletionError('')
    try {
      const uploads = await Promise.all(
        toUpload.map(f => uploadChatFile(f).then(r => r.url).catch(err => {
          console.error('Upload failed:', err)
          return null
        })),
      )
      const urls = uploads.filter((u): u is string => !!u)
      setCompletionImages(prev => [...prev, ...urls])
      if (urls.length < toUpload.length) {
        setCompletionError(t('alerts.someUploadsFailed'))
      }
    } finally {
      setCompletionUploading(false)
    }
  }

  const removeCompletionImage = (idx: number) => {
    setCompletionImages(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmitCompletion = async () => {
    if (!completingOrder) return
    setCompletionError('')
    const details = completionDetails.trim()
    if (!details) {
      setCompletionError(t('alerts.completionDetailsRequired'))
      return
    }
    if (completionImages.length === 0) {
      setCompletionError(t('alerts.completionImageRequired'))
      return
    }
    setCompletionSubmitting(true)
    try {
      await api.putWithAuth(`/worker/orders/${completingOrder._id}/status`, {
        status: 'completed',
        completionReport: {
          details,
          images: completionImages,
        },
      })
      // Drop the completed order from the active list and close the modal.
      const completedId = completingOrder._id
      setOrders(prev => prev.filter(o => o._id !== completedId))
      setCompletingOrder(null)
      setCompletionDetails('')
      setCompletionImages([])
    } catch (err: any) {
      console.error('Failed to submit completion:', err)
      setCompletionError(err?.message || t('alerts.completionFailed'))
    } finally {
      setCompletionSubmitting(false)
    }
  }

  /**
   * handleEditService — Populate the form with existing service data for editing
   * Sets editingServiceId so handleSaveEdit knows which service to PUT.
   */
  const handleEditService = (service: WorkerService) => {
    const catId = typeof service.categoryId === 'object'
      ? service.categoryId?._id
      : (service.categoryId as string | undefined)
    serviceFormApi.reset({
      name: service.name || '',
      description: service.description || '',
      price: service.price || 0,
      typeofService: service.typeofService,
      priceRange: {
        min: service.priceRange?.min || 0,
        max: service.priceRange?.max || 0,
      },
      paymentTiming: (service as any).paymentTiming || 'before',
      categoryId: catId || '',
      images: service.images || [],
    })
    setImageInput('')
    setEditingServiceId(service._id)
    setShowAddService(true)
    setServiceError('')
  }

  /**
   * resetServiceForm — Clear the form and exit add/edit mode
   */
  const resetServiceForm = () => {
    serviceFormApi.reset(SERVICE_DEFAULTS)
    setImageInput('')
    setEditingServiceId(null)
    setShowAddService(false)
    setServiceError('')
  }

  /**
   * handleAddImage — Append the URL in the image input to the service's images array.
   * We trim + validate (non-empty) before adding.
   */
  const handleAddImage = () => {
    const url = imageInput.trim()
    if (!url) return
    const next = [...(serviceFormApi.getValues('images') || []), url]
    serviceFormApi.setValue('images', next, { shouldValidate: true, shouldDirty: true })
    setImageInput('')
  }

  /**
   * handleRemoveImage — Remove an image URL at a given index.
   */
  const handleRemoveImage = (index: number) => {
    const current = serviceFormApi.getValues('images') || []
    const next = current.filter((_, i) => i !== index)
    serviceFormApi.setValue('images', next, { shouldValidate: true, shouldDirty: true })
  }

  // ─── Loading State ──────────────────────────────────────────────
  // While auth is still checking, show a simple pulse animation.
  // This prevents a flash of the login page before redirect happens.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/30 animate-pulse" />
      </div>
    )
  }

  // ─── RENDER ─────────────────────────────────────────────────────
  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-7xl mx-auto">
        {/*
          flex-row here works as right-to-left because the <html> tag has dir="rtl".
          So the sidebar appears on the RIGHT and main content on the LEFT —
          matching Arabic reading direction.
        */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ============================================================
              SIDEBAR (appears on the right in RTL)
              Shows: avatar, name, specialty, stats, and "add service" button
              ============================================================ */}
          <aside className="w-full lg:w-80 flex flex-col gap-6">

            {/* --- Profile Card --- */}
            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]">

              {/* Avatar + Name + Specialty */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative mb-4">
                  {workerProfile?.userId?.profileImage ? (
                    <img
                      src={workerProfile.userId.profileImage}
                      alt={workerProfile.userId.firstName}
                      className="w-24 h-24 rounded-full object-cover border-4 border-primary-container/20"
                    />
                  ) : (
                    /* Fallback avatar: a colored circle with the first letter of the name */
                    <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center font-bold text-3xl border-4 border-primary-container/20">
                      {getInitial()}
                    </div>
                  )}
                  {/* Camera overlay — opens the hidden file input.
                      Same pattern as the customer profile avatar. */}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    aria-label={t('avatarChange')}
                    className="absolute bottom-0 left-0 w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-wait"
                  >
                    {avatarUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <h2 className="text-xl font-bold text-on-surface">
                  {workerProfile?.userId?.firstName} {workerProfile?.userId?.lastName}
                </h2>
                {/* Specialty: comes from the worker's Category. Falls back to a generic label. */}
                <p className="text-sm text-on-surface-variant mt-1">
                  {workerProfile?.Category?.name || t('specialtyFallback')}
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-outline-variant/20 my-4" />

              {/* --- Stats Cards --- */}
              {/* Each stat shows an icon, Arabic label, and the number.
                  The ?. (optional chaining) prevents crashes if stats hasn't loaded yet,
                  and ?? 0 provides a default value of 0. */}
              <div className="space-y-3 mb-6">
                {/* Pending orders count */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span>{t('stats.pendingOrders')}</span>
                  </div>
                  <span className="font-bold text-on-surface">{stats?.pendingOrders ?? 0}</span>
                </div>
                {/* Completed orders count */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <ShoppingBag className="w-4 h-4 text-green-500" />
                    <span>{t('stats.completedOrders')}</span>
                  </div>
                  <span className="font-bold text-on-surface">{stats?.completedOrders ?? 0}</span>
                </div>
                {/* Total earnings in Egyptian pounds (ج.م) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span>{t('stats.totalEarnings')}</span>
                  </div>
                  <span className="font-bold text-primary">{t('orders.priceEgp', { price: stats?.totalEarnings ?? 0 })}</span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-outline-variant/20 my-4" />

              {/* --- Add New Service Button --- */}
              {/* Clicking this does TWO things:
                  1. Shows the add service form (setShowAddService)
                  2. Switches to the services tab so the form is visible */}
              <button
                onClick={() => {
                  resetServiceForm()
                  setShowAddService(true)
                  setActiveTab('services')
                }}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                {t('addNewService')}
              </button>
            </div>
          </aside>

          {/* ============================================================
              MAIN CONTENT AREA (appears on the left in RTL)
              Contains the 3 tabs and their respective content
              ============================================================ */}
          <section className="flex-1">

            {/* ─── Rank + completed-orders banner (read-only) ─── */}
            {workerProfile && (
              <div className="bg-surface-container-lowest rounded-xl p-4 mb-6 flex items-center gap-4 shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
                <RankBadge rank={workerProfile.rank} size="md" />
                <div className="text-sm text-on-surface-variant">
                  {t.rich('completedOrdersMessage', { count: workerProfile.completedOrdersCount || 0, b: (chunks) => <span className="font-bold text-on-surface">{chunks}</span> })}
                </div>
              </div>
            )}

            {/* --- Tab Buttons --- */}
            {/* Each button highlights with primary color when active.
                handleTabChange resets pagination to page 1 when switching. */}
            <div className="flex gap-4 mb-8 flex-wrap">
              <button
                onClick={() => handleTabChange('profile')}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'profile'
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t('tabs.myFile')}
              </button>
              <button
                onClick={() => handleTabChange('services')}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'services'
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t('tabs.services')}
              </button>
              <button
                onClick={() => handleTabChange('active_orders')}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'active_orders'
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t('tabs.inProgressOrders')}
              </button>
              <button
                onClick={() => handleTabChange('history')}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  activeTab === 'history'
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t('tabs.history')}
              </button>
              <button
                onClick={() => handleTabChange('wallet')}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'wallet'
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <Wallet className="w-4 h-4" />
                {t('tabs.wallet')}
              </button>
            </div>

            {/* ========================================================
                TAB 0: "ملفي" — Profile editors (gallery, hours, type, info)
                Tasks 17-20 land in this section.
                ======================================================== */}
            {activeTab === 'profile' && workerProfile && (
              <div className="space-y-8">
                {/* ─── Business Gallery editor ─── */}
                <section className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-primary" />
                      {t('portfolio.title')}
                    </h3>
                    {!portfolioDraft && (
                      <button
                        type="button"
                        onClick={openNewPortfolioItem}
                        className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t('portfolio.add')}
                      </button>
                    )}
                  </div>

                  {/* List of existing items */}
                  {!portfolioDraft && (
                    <>
                      {(workerProfile.portfolio || []).length === 0 ? (
                        <p className="text-on-surface-variant text-sm">{t('portfolio.empty')}</p>
                      ) : (
                        <div className="space-y-3">
                          {workerProfile.portfolio!.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-4 p-3 rounded-xl bg-surface-container-low">
                              {item.images && item.images[0] ? (
                                <img src={item.images[0]} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-20 h-20 rounded-lg bg-surface-container-high flex-shrink-0 flex items-center justify-center">
                                  <ImageIcon className="w-6 h-6 text-on-surface-variant/40" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold truncate">{item.title || t('portfolio.untitled')}</p>
                                {item.description && (
                                  <p className="text-sm text-on-surface-variant line-clamp-2">{item.description}</p>
                                )}
                                <p className="text-xs text-on-surface-variant mt-1">
                                  {t('portfolio.imagesCount', { count: (item.images || []).length })}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditPortfolioItem(idx)}
                                  className="p-2 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high"
                                  aria-label={t('portfolio.editAria')}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deletePortfolioItem(idx)}
                                  disabled={profileSaving}
                                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                  aria-label={t('portfolio.deleteAria')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Inline form when adding/editing */}
                  {portfolioDraft && (
                    <div className="space-y-4 bg-surface-container-low p-4 rounded-xl">
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('portfolio.labelTitle')}</label>
                        <input
                          type="text"
                          value={portfolioDraft.title}
                          onChange={(e) => setPortfolioDraft({ ...portfolioDraft, title: e.target.value })}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('portfolio.labelDescription')}</label>
                        <textarea
                          value={portfolioDraft.description}
                          onChange={(e) => setPortfolioDraft({ ...portfolioDraft, description: e.target.value })}
                          rows={3}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('portfolio.labelCompletedDate')}</label>
                        <input
                          type="date"
                          value={portfolioDraft.completedAt}
                          onChange={(e) => setPortfolioDraft({ ...portfolioDraft, completedAt: e.target.value })}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold block">
                          {t('portfolio.labelImages')} <span className="text-on-surface-variant/60 font-normal">({portfolioDraft.images.length}/{MAX_PORTFOLIO_IMAGES})</span>
                        </label>
                        {portfolioDraft.images.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {portfolioDraft.images.map((url, idx) => (
                              <div key={idx} className="relative">
                                <img src={url} alt="" className="w-full h-24 rounded-lg object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeImageFromDraft(idx)}
                                  className="absolute top-1 left-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center"
                                  aria-label={t('portfolio.removeImageAria')}
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Hidden native input clicked by the upload button. */}
                        <input
                          ref={portfolioImagesInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={handlePortfolioImagesPick}
                        />

                        <button
                          type="button"
                          onClick={() => portfolioImagesInputRef.current?.click()}
                          disabled={
                            uploadingPortfolioImages ||
                            portfolioDraft.images.length >= MAX_PORTFOLIO_IMAGES
                          }
                          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-on-primary py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ImageIcon className="w-4 h-4" />
                          {uploadingPortfolioImages ? t('portfolio.uploading') : t('portfolio.uploadFromDevice')}
                        </button>

                        <details>
                          <summary className="text-xs text-on-surface-variant cursor-pointer hover:text-primary">
                            {t('portfolio.orPasteUrl')}
                          </summary>
                          <div className="flex gap-2 mt-2">
                            <input
                              type="url"
                              value={portfolioImageInput}
                              onChange={(e) => setPortfolioImageInput(e.target.value)}
                              placeholder={t('portfolio.imageUrlPlaceholder')}
                              className="flex-1 bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                            />
                            <button
                              type="button"
                              onClick={addImageToDraft}
                              disabled={!portfolioImageInput.trim() || portfolioDraft.images.length >= MAX_PORTFOLIO_IMAGES}
                              className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
                            >
                              {t('portfolio.addUrl')}
                            </button>
                          </div>
                        </details>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={savePortfolioDraft}
                          disabled={profileSaving || !portfolioDraft.title.trim()}
                          className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold disabled:opacity-40"
                        >
                          {profileSaving ? t('portfolio.saving') : t('portfolio.save')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelPortfolioDraft}
                          disabled={profileSaving}
                          className="flex-1 bg-surface-container-lowest py-3 rounded-xl font-bold disabled:opacity-40"
                        >
                          {t('portfolio.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* ─── Packages editor ─── */}
                <section className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-primary" />
                      {t('packages.title')}
                    </h3>
                    {!packageDraft && (
                      <button
                        type="button"
                        onClick={openNewPackage}
                        className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t('packages.add')}
                      </button>
                    )}
                  </div>

                  {!packageDraft && (
                    <>
                      {(workerProfile.packages || []).length === 0 ? (
                        <p className="text-on-surface-variant text-sm">{t('packages.empty')}</p>
                      ) : (
                        <div className="space-y-3">
                          {workerProfile.packages!.map((pkg, idx) => (
                            <div key={idx} className="flex items-start gap-4 p-3 rounded-xl bg-surface-container-low">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <p className="font-bold truncate">{pkg.title || t('packages.untitled')}</p>
                                  {pkg.price ? (
                                    <span className="text-primary font-bold text-sm">{t('orders.priceEgp', { price: pkg.price })}</span>
                                  ) : (
                                    <span className="text-on-surface-variant text-xs">{t('packages.contactForPrice')}</span>
                                  )}
                                </div>
                                {pkg.description && (
                                  <p className="text-sm text-on-surface-variant line-clamp-2">{pkg.description}</p>
                                )}
                                <p className="text-xs text-on-surface-variant mt-1">
                                  {t('packages.featuresCount', { count: (pkg.features || []).length })}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditPackage(idx)}
                                  className="p-2 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high"
                                  aria-label={t('portfolio.editAria')}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deletePackage(idx)}
                                  disabled={profileSaving}
                                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                  aria-label={t('portfolio.deleteAria')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {packageDraft && (
                    <div className="space-y-4 bg-surface-container-low p-4 rounded-xl">
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('packages.labelTitle')}</label>
                        <input
                          type="text"
                          value={packageDraft.title}
                          onChange={(e) => setPackageDraft({ ...packageDraft, title: e.target.value })}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('packages.labelPrice')}</label>
                        <input
                          type="number"
                          min="0"
                          value={packageDraft.price}
                          onChange={(e) => setPackageDraft({ ...packageDraft, price: e.target.value })}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('packages.labelDescription')}</label>
                        <textarea
                          value={packageDraft.description}
                          onChange={(e) => setPackageDraft({ ...packageDraft, description: e.target.value })}
                          rows={2}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold block">{t('packages.labelFeatures')}</label>
                        <textarea
                          value={packageDraft.features}
                          onChange={(e) => setPackageDraft({ ...packageDraft, features: e.target.value })}
                          rows={4}
                          placeholder={t('packages.featuresPlaceholder')}
                          className="w-full bg-surface-container-lowest rounded-xl py-2 px-3 text-sm"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={savePackageDraft}
                          disabled={profileSaving || !packageDraft.title.trim()}
                          className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold disabled:opacity-40"
                        >
                          {profileSaving ? t('packages.saving') : t('packages.save')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelPackageDraft}
                          disabled={profileSaving}
                          className="flex-1 bg-surface-container-lowest py-3 rounded-xl font-bold disabled:opacity-40"
                        >
                          {t('packages.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* ─── Working hours editor ─── */}
                <section className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    {t('workHours.title')}
                  </h3>

                  {hasMixedSchedule(workerProfile.workingHours) && (
                    <div className="mb-4 p-3 rounded-xl bg-amber-50 text-amber-700 text-sm flex gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{t('workHours.customScheduleWarning')}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold block">{t('workHours.from')}</label>
                      <input
                        type="time"
                        value={hoursDraft.defaultFrom}
                        onChange={(e) => setHoursDraft({ ...hoursDraft, defaultFrom: e.target.value })}
                        className="w-full bg-surface-container-low rounded-xl py-2 px-3 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold block">{t('workHours.to')}</label>
                      <input
                        type="time"
                        value={hoursDraft.defaultTo}
                        onChange={(e) => setHoursDraft({ ...hoursDraft, defaultTo: e.target.value })}
                        className="w-full bg-surface-container-low rounded-xl py-2 px-3 text-sm"
                      />
                    </div>
                  </div>

                  <p className="text-xs font-bold mb-2">{t('workHours.daysOff')}</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {DAY_ORDER_KEYS.map(day => {
                      const isOff = hoursDraft.daysOff.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDayOff(day)}
                          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                            isOff
                              ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                              : 'bg-surface-container-low text-on-surface-variant'
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={saveWorkingHours}
                    disabled={profileSaving}
                    className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold disabled:opacity-40"
                  >
                    {profileSaving ? t('workHours.saving') : t('workHours.save')}
                  </button>
                </section>

                {/* ─── Worker type toggle ─── */}
                <section className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
                  <h3 className="text-lg font-bold mb-4">{t('providerType.title')}</h3>
                  <div className="flex gap-3">
                    {([
                      { value: 'individual' as const, label: t('providerType.individual') },
                      { value: 'company'    as const, label: t('providerType.company') },
                    ]).map(opt => {
                      const active = workerProfile.typeOfWorker === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => saveWorkerType(opt.value)}
                          disabled={profileSaving || active}
                          className={`flex-1 py-4 rounded-xl font-bold transition-all ${
                            active
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </section>

                {/* ─── Bio + skills + location editor ─── */}
                <section className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_24px_24px_-12px_rgba(18,28,42,0.06)]">
                  <h3 className="text-lg font-bold mb-4">{t('personalInfo.title')}</h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold block">{t('personalInfo.labelTitle')}</label>
                      <input
                        type="text"
                        value={profileTextDraft.title}
                        onChange={(e) => setProfileTextDraft({ ...profileTextDraft, title: e.target.value })}
                        placeholder={t('personalInfo.titlePlaceholder')}
                        maxLength={120}
                        className="w-full bg-surface-container-low rounded-xl py-3 px-3 text-sm"
                      />
                      <p className="text-xs text-on-surface-variant">{t('personalInfo.titleHint')}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold block">{t('personalInfo.labelBio')}</label>
                      <textarea
                        value={profileTextDraft.bio}
                        onChange={(e) => setProfileTextDraft({ ...profileTextDraft, bio: e.target.value })}
                        rows={4}
                        placeholder={t('personalInfo.bioPlaceholder')}
                        className="w-full bg-surface-container-low rounded-xl py-3 px-3 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold block">{t('personalInfo.labelLocation')}</label>
                      <input
                        type="text"
                        value={profileTextDraft.location}
                        onChange={(e) => setProfileTextDraft({ ...profileTextDraft, location: e.target.value })}
                        placeholder={t('personalInfo.locationPlaceholder')}
                        className="w-full bg-surface-container-low rounded-xl py-3 px-3 text-sm"
                      />
                      {/* Map pin — separate from the text input above because
                          coords are saved through a different endpoint and
                          power the "Nearest" filter on the customer side.
                          Without coords, this worker is invisible to the geo
                          search and only shows up under the "haven't shared
                          location" tail. */}
                      <div className="flex items-center justify-between gap-3 bg-primary/5 rounded-xl p-3">
                        <div className="text-right flex-1 min-w-0">
                          <p className="text-sm font-bold flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-primary" />
                            {t('personalInfo.mapLocation')}
                          </p>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {savedCoords
                              ? t('personalInfo.mapSet', { lat: savedCoords.lat.toFixed(5), lng: savedCoords.lng.toFixed(5) })
                              : t('personalInfo.mapNotSet')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocationPicker(true)}
                          disabled={savingCoords}
                          className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-container transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1"
                        >
                          {savingCoords && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {savedCoords ? t('personalInfo.editOnMap') : t('personalInfo.setOnMap')}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold block">{t('personalInfo.labelSkills')}</label>
                      <input
                        type="text"
                        value={profileTextDraft.skills}
                        onChange={(e) => setProfileTextDraft({ ...profileTextDraft, skills: e.target.value })}
                        placeholder={t('personalInfo.skillsPlaceholder')}
                        className="w-full bg-surface-container-low rounded-xl py-3 px-3 text-sm"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={saveProfileText}
                      disabled={profileSaving}
                      className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold disabled:opacity-40"
                    >
                      {profileSaving ? t('personalInfo.saving') : t('personalInfo.save')}
                    </button>
                  </div>
                </section>

                {/* ───── Licenses & training certificates ───── */}
                {/* Self-contained editor — handles its own API calls (POST/PUT/
                    DELETE/PATCH on /worker/licenses) and bubbles updates back
                    via onLicensesChange so workerProfile stays in sync. */}
                <LicensesEditor
                  licenses={workerProfile?.licenses || []}
                  onLicensesChange={(next) => {
                    if (workerProfile) {
                      setWorkerProfile({ ...workerProfile, licenses: next })
                    }
                  }}
                />
              </div>
            )}

            {/* ========================================================
                TAB 1: "خدماتي" — My Services
                Shows the inline add/edit form + a grid of service cards
                ======================================================== */}
            {activeTab === 'services' && (
              <div>
                {/* Top-level error banner — visible whether or not the
                    add/edit form is open. Catches errors from delete (which
                    happens with the form closed) as well as form errors. */}
                {serviceError && !showAddService && (
                  <div
                    role="alert"
                    className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 text-right flex items-center justify-between gap-3"
                  >
                    <span>{serviceError}</span>
                    <button
                      type="button"
                      onClick={() => setServiceError('')}
                      className="text-xs font-semibold underline hover:no-underline"
                    >
                      {t('services.hideForm')}
                    </button>
                  </div>
                )}

                {/* --- Inline Add/Edit Service Form --- */}
                {/* This form is collapsible: only shown when showAddService is true.
                    The same form is used for both adding AND editing:
                    - If editingServiceId is null → we're adding a new service
                    - If editingServiceId has a value → we're editing that service */}
                {showAddService && (
                  <form
                    onSubmit={serviceFormApi.handleSubmit(editingServiceId ? handleSaveEdit : handleAddService)}
                    className="bg-surface-container-lowest rounded-xl p-6 mb-6 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]"
                    noValidate
                  >
                    <h3 className="font-bold text-on-surface mb-4">
                      {editingServiceId ? t('services.editTitle') : t('services.addTitle')}
                    </h3>
                    <div className="space-y-4">
                      {/* Service name */}
                      <div>
                        <label htmlFor="svc-name" className="block text-sm font-medium text-on-surface-variant mb-1">
                          {t('services.labelName')}
                        </label>
                        <input
                          id="svc-name"
                          type="text"
                          placeholder={t('services.namePlaceholder')}
                          aria-invalid={serviceFormApi.formState.errors.name ? 'true' : 'false'}
                          className={`w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm text-right outline-none focus:ring-2 ${
                            serviceFormApi.formState.errors.name ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                          }`}
                          {...serviceFormApi.register('name')}
                        />
                        {serviceFormApi.formState.errors.name && (
                          <p role="alert" className="text-xs text-red-700 mt-1">{serviceFormApi.formState.errors.name.message}</p>
                        )}
                      </div>

                      {/* Category selector */}
                      <div>
                        <label htmlFor="svc-category" className="block text-sm font-medium text-on-surface-variant mb-1">
                          {t('services.labelCategory')}
                        </label>
                        <select
                          id="svc-category"
                          aria-invalid={serviceFormApi.formState.errors.categoryId ? 'true' : 'false'}
                          className={`w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${
                            serviceFormApi.formState.errors.categoryId ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                          }`}
                          {...serviceFormApi.register('categoryId')}
                        >
                          <option value="">{t('services.categoryChoose')}</option>
                          {availableCategories.map(cat => (
                            <option key={cat._id} value={cat._id}>{cat.name}</option>
                          ))}
                        </select>
                        {serviceFormApi.formState.errors.categoryId && (
                          <p role="alert" className="text-xs text-red-700 mt-1">{serviceFormApi.formState.errors.categoryId.message}</p>
                        )}
                      </div>

                      {/* Description textarea */}
                      <div>
                        <label htmlFor="svc-description" className="block text-sm font-medium text-on-surface-variant mb-1">
                          {t('services.labelDescription')}
                        </label>
                        <textarea
                          id="svc-description"
                          placeholder={t('services.descPlaceholder')}
                          rows={3}
                          className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                          {...serviceFormApi.register('description')}
                        />
                      </div>

                      {/* Payment type selector — fixed, hourly, or range */}
                      <div>
                        <label htmlFor="svc-type" className="block text-sm font-medium text-on-surface-variant mb-1">
                          {t('services.labelPaymentType')}
                        </label>
                        <select
                          id="svc-type"
                          className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                          {...serviceFormApi.register('typeofService')}
                        >
                          <option value="fixed">{t('services.fixedPrice')}</option>
                          <option value="hourly">{t('services.hourly')}</option>
                          <option value="range">{t('services.range')}</option>
                          <option value="custom">سعر مخصص (يحدّد عند الطلب)</option>
                        </select>
                      </div>

                      {/* Payment timing — applies to every order against this service.
                          Workers can decide whether the customer pays up front or after
                          the work is done. Customer-initiated orders inherit this value;
                          worker-initiated custom orders pick their own per-order. */}
                      <div>
                        <label htmlFor="svc-timing" className="block text-sm font-medium text-on-surface-variant mb-1">
                          توقيت الدفع
                        </label>
                        <select
                          id="svc-timing"
                          className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                          {...serviceFormApi.register('paymentTiming')}
                        >
                          <option value="before">قبل الخدمة</option>
                          <option value="after">بعد الخدمة</option>
                        </select>
                      </div>

                      {/* Price inputs — change based on payment type.
                          For fixed/hourly we show one price; for range we show min+max.
                          For "custom" we show no price input — the worker enters it
                          per-order from the customer's profile. */}
                      {serviceForm.typeofService === 'custom' ? (
                        <p className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl p-3">
                          خدمة بسعر مخصص — يحدّد السعر عند إنشاء كل طلب.
                        </p>
                      ) : serviceForm.typeofService === 'range' ? (
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label htmlFor="svc-pmin" className="block text-sm font-medium text-on-surface-variant mb-1">
                              {t('services.minPrice')}
                            </label>
                            <input
                              id="svc-pmin"
                              type="number"
                              min={0}
                              aria-invalid={serviceFormApi.formState.errors.priceRange?.min ? 'true' : 'false'}
                              className={`w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${
                                serviceFormApi.formState.errors.priceRange?.min ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                              }`}
                              {...serviceFormApi.register('priceRange.min', { valueAsNumber: true })}
                            />
                            {serviceFormApi.formState.errors.priceRange?.min && (
                              <p role="alert" className="text-xs text-red-700 mt-1">{serviceFormApi.formState.errors.priceRange.min.message}</p>
                            )}
                          </div>
                          <div className="flex-1">
                            <label htmlFor="svc-pmax" className="block text-sm font-medium text-on-surface-variant mb-1">
                              {t('services.maxPrice')}
                            </label>
                            <input
                              id="svc-pmax"
                              type="number"
                              min={0}
                              aria-invalid={serviceFormApi.formState.errors.priceRange?.max ? 'true' : 'false'}
                              className={`w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${
                                serviceFormApi.formState.errors.priceRange?.max ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                              }`}
                              {...serviceFormApi.register('priceRange.max', { valueAsNumber: true })}
                            />
                            {serviceFormApi.formState.errors.priceRange?.max && (
                              <p role="alert" className="text-xs text-red-700 mt-1">{serviceFormApi.formState.errors.priceRange.max.message}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label htmlFor="svc-price" className="block text-sm font-medium text-on-surface-variant mb-1">
                            {t('services.priceEgp')} {serviceForm.typeofService === 'hourly' ? t('services.perHour') : ''}
                          </label>
                          <input
                            id="svc-price"
                            type="number"
                            min={0}
                            aria-invalid={serviceFormApi.formState.errors.price ? 'true' : 'false'}
                            className={`w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${
                              serviceFormApi.formState.errors.price ? 'ring-2 ring-red-300 focus:ring-red-300' : 'focus:ring-primary/20'
                            }`}
                            {...serviceFormApi.register('price', { valueAsNumber: true })}
                          />
                          {serviceFormApi.formState.errors.price && (
                            <p role="alert" className="text-xs text-red-700 mt-1">{serviceFormApi.formState.errors.price.message}</p>
                          )}
                        </div>
                      )}

                      {/* Images — primary path is the file picker (uploads to
                          Cloudinary). The URL paste field stays as a fallback
                          for already-hosted assets. Images cap at MAX_SERVICE_IMAGES. */}
                      <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">
                          {t('services.labelImages')} <span className="text-on-surface-variant/60">({serviceForm.images.length}/{MAX_SERVICE_IMAGES})</span>
                        </label>

                        {/* Hidden native input — we click it from the visible button below
                            so we can style the trigger freely. */}
                        <input
                          ref={serviceImagesInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={handleServiceImagesPick}
                        />

                        <div className="flex gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => serviceImagesInputRef.current?.click()}
                            disabled={
                              uploadingServiceImages ||
                              serviceForm.images.length >= MAX_SERVICE_IMAGES
                            }
                            className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ImageIcon className="w-4 h-4" />
                            {uploadingServiceImages ? t('services.uploading') : t('services.uploadFromDevice')}
                          </button>
                        </div>

                        {/* Optional: paste an existing image URL */}
                        <details className="mb-2">
                          <summary className="text-xs text-on-surface-variant cursor-pointer hover:text-primary">
                            {t('portfolio.orPasteUrl')}
                          </summary>
                          <div className="flex gap-2 mt-2">
                            <input
                              type="url"
                              value={imageInput}
                              onChange={e => setImageInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddImage() } }}
                              placeholder="https://example.com/image.jpg"
                              className="flex-1 bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleAddImage}
                              disabled={serviceForm.images.length >= MAX_SERVICE_IMAGES}
                              className="bg-primary text-white px-4 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {t('services.addUrl')}
                            </button>
                          </div>
                        </details>
                        {serviceForm.images.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {serviceForm.images.map((url, idx) => (
                              <div key={idx} className="relative group">
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-20 object-cover rounded-lg bg-surface-container-low"
                                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveImage(idx)}
                                  className="absolute top-1 left-1 bg-red-500 text-white w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Inline error banner — appears when client validation
                          rejects the form OR the backend returns an error.
                          Cleared on the next submit. */}
                      {serviceError && (
                        <div
                          role="alert"
                          className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-right"
                        >
                          {serviceError}
                        </div>
                      )}

                      {/* Save + Cancel buttons. Submit triggers RHF's
                          handleSubmit on the parent <form>, which runs zod
                          validation first then calls handleAddService /
                          handleSaveEdit with typed values. */}
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={serviceSaving}
                          className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
                        >
                          {serviceSaving
                            ? t('services.saving')
                            : editingServiceId ? t('services.saveEdits') : t('services.addService')}
                        </button>
                        <button
                          type="button"
                          onClick={resetServiceForm}
                          disabled={serviceSaving}
                          className="flex-1 bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-bold hover:opacity-80 transition-opacity disabled:opacity-50"
                        >
                          {t('services.cancel')}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* --- Services Grid --- */}
                {/* Shows all the worker's services as cards.
                    Each card has: description, price, type badge, active toggle, edit, delete */}
                {services.length === 0 && !showAddService ? (
                  /* Empty state — shown when worker has no services yet */
                  <div className="text-center py-20 bg-surface-container-lowest rounded-xl">
                    <Briefcase className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
                    <p className="text-on-surface-variant text-lg mb-2">{t('services.noneTitle')}</p>
                    <p className="text-sm text-on-surface-variant/60">{t('services.noneBody')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {services.map(service => (
                      <div
                        key={service._id}
                        className="bg-surface-container-lowest rounded-xl p-5 hover:shadow-lg transition-all border border-transparent hover:border-primary/10"
                      >
                        {/* Service name */}
                        {service.name && (
                          <h4 className="text-on-surface font-bold mb-1">{service.name}</h4>
                        )}

                        {/* Description text */}
                        <p className="text-on-surface-variant text-sm mb-3 line-clamp-2">
                          {service.description || t('services.noDescription')}
                        </p>

                        {/* Middle row: price + type badge + approval status */}
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <span className="text-lg font-bold text-primary">
                            {service.typeofService === 'range'
                              ? t('services.rangeFormat', { min: service.priceRange?.min ?? 0, max: service.priceRange?.max ?? 0 })
                              : t('services.priceFormat', { price: service.price })}
                          </span>
                          {/* Type badge: different colors for each payment type */}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            service.typeofService === 'hourly'
                              ? 'bg-blue-50 text-blue-600'
                              : service.typeofService === 'range'
                              ? 'bg-purple-50 text-purple-600'
                              : 'bg-green-50 text-green-600'
                          }`}>
                            {service.typeofService === 'hourly' ? t('services.kindHourly') : service.typeofService === 'range' ? t('services.kindRange') : t('services.kindFixed')}
                          </span>

                          {/* Approval status badge — shows whether admin approved/rejected/is reviewing */}
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            service.approvalStatus === 'approved' ? 'bg-green-50 text-green-600' :
                            service.approvalStatus === 'rejected' ? 'bg-red-50 text-red-600' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {service.approvalStatus === 'approved' ? t('services.approvalApproved') :
                             service.approvalStatus === 'rejected' ? t('services.approvalRejected') :
                             t('services.approvalPending')}
                          </span>
                        </div>

                        {/* If rejected, show the admin's rejection reason so the worker knows what to fix */}
                        {service.approvalStatus === 'rejected' && service.rejectionReason && (
                          <p className="text-xs text-red-500 mt-1 mb-3">{service.rejectionReason}</p>
                        )}

                        {/* Bottom row: active toggle + edit + delete.
                            When this card is the one being deleted, the row swaps
                            to a "هل أنت متأكد؟" confirm strip so the worker has
                            to click twice to actually delete the service. */}
                        {deletingServiceId === service._id ? (
                          <div className="flex items-center justify-between gap-3 bg-red-50/60 border border-red-100 rounded-lg px-3 py-2">
                            <span className="text-xs text-red-700 font-semibold">
                              {t('services.confirmDelete')}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeleteService(service._id)}
                                disabled={deletingInFlight}
                                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {deletingInFlight ? t('services.deleting') : t('services.confirmDeleteBtn')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingServiceId(null)}
                                disabled={deletingInFlight}
                                className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:opacity-80 transition-opacity disabled:opacity-50"
                              >
                                {t('services.backOut')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            {/* Active/Inactive Toggle Switch — only for APPROVED services.
                                Non-approved services can't be toggled on/off because they aren't
                                visible to customers anyway. We show a text label instead. */}
                            <div className="flex items-center gap-2">
                              {service.approvalStatus === 'approved' ? (
                                <>
                                  <button
                                    onClick={() => handleToggleActive(service)}
                                    className={`w-11 h-6 rounded-full transition-colors relative ${
                                      service.active ? 'bg-primary' : 'bg-outline-variant/40'
                                    }`}
                                  >
                                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                                      service.active ? 'right-1' : 'right-6'
                                    }`} />
                                  </button>
                                  <span className="text-xs text-on-surface-variant">
                                    {service.active ? t('services.active') : t('services.inactive')}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-on-surface-variant/50">
                                  {service.approvalStatus === 'pending' ? t('services.approvalAwaiting') : t('services.approvalRejectedShort')}
                                </span>
                              )}
                            </div>

                            {/* Action buttons: Edit + Delete */}
                            <div className="flex items-center gap-2">
                              {/* Edit button — pencil icon */}
                              <button
                                onClick={() => handleEditService(service)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {/* Delete button — trash icon, red color.
                                  First click flips the card into the confirm strip above. */}
                              <button
                                onClick={() => { setServiceError(''); setDeletingServiceId(service._id) }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container-low text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================
                TAB 2 & 3: Orders (Active or History)
                Same layout for both — only the data differs based on activeTab.
                The order cards show CUSTOMER info (not worker, since WE are the worker).
                ======================================================== */}
            {(activeTab === 'active_orders' || activeTab === 'history') && (
              <div>
                {loading ? (
                  /* Loading skeleton — 3 placeholder cards that pulse */
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="bg-surface-container-lowest rounded-xl h-32 animate-pulse" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  /* Empty state — no orders found for this tab */
                  <div className="text-center py-20 bg-surface-container-lowest rounded-xl">
                    <ShoppingBag className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
                    <p className="text-on-surface-variant text-lg">
                      {activeTab === 'active_orders'
                        ? t('orders.emptyInProgress')
                        : t('orders.emptyHistory')}
                    </p>
                  </div>
                ) : (
                  /* Order cards list */
                  <div className="space-y-4">
                    {orders.map(order => {
                      // Look up the status badge config, fall back to "pending" if unknown
                      const badge = statusColors[order.status] || statusColors.pending
                      return (
                        <div
                          key={order._id}
                          className="bg-surface-container-lowest rounded-xl p-6 hover:shadow-lg transition-all border border-transparent hover:border-primary/10"
                        >
                          {/* Top row: service + category + status badge */}
                          <div className="flex items-start justify-between mb-4 gap-4">
                            <div className="min-w-0 flex-1">
                              {/* Service name (new — populated from the order) with
                                  a small category chip underneath. Falls back to the
                                  category name alone for older orders that pre-date
                                  serviceId being required. */}
                              <h3 className="font-bold text-on-surface text-lg truncate">
                                {order.customTitle || order.serviceId?.name || order.categoryId?.name || t('orders.fallbackServiceName')}
                              </h3>
                              {order.serviceId?.name && order.categoryId?.name && (
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  {t('orders.category', { name: order.categoryId.name })}
                                </p>
                              )}
                              {order.description && (
                                <p className="text-sm text-on-surface-variant mt-1 line-clamp-1">
                                  {order.description}
                                </p>
                              )}
                              {order.problemImages && order.problemImages.length > 0 && (
                                <div className="mt-3">
                                  <p className="text-xs font-bold text-on-surface-variant mb-2">
                                    صور المشكلة من العميل ({order.problemImages.length})
                                  </p>
                                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                    {order.problemImages.map((url, idx) => (
                                      <a
                                        key={url}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block aspect-square rounded-lg overflow-hidden bg-surface-container-low hover:opacity-80 transition-opacity"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={url}
                                          alt={`صورة المشكلة ${idx + 1}`}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Status badge — colored pill */}
                            <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${badge.bg} ${badge.text}`}>
                              {t(badge.key as any)}
                            </span>
                          </div>

                          {/* Middle row: customer info + date + price + payment mode */}
                          <div className="flex items-center gap-6 flex-wrap mb-3">
                            {/* Customer — clickable, opens the worker-only customer profile */}
                            {order.customerId ? (
                              <Link
                                href={`/customer/${order.customerId._id}`}
                                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                              >
                                {order.customerId.profileImage ? (
                                  <img
                                    src={order.customerId.profileImage}
                                    alt=""
                                    className="w-6 h-6 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                                    {order.customerId.firstName?.charAt(0)}
                                  </div>
                                )}
                                <span className="text-sm text-on-surface-variant hover:text-primary hover:underline">
                                  {order.customerId.firstName} {order.customerId.lastName}
                                </span>
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-on-surface-variant/60">{t('orders.unknownCustomer')}</span>
                              </div>
                            )}

                            {/* Order date */}
                            <div className="flex items-center gap-1 text-sm text-on-surface-variant">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(order.scheduledDate || order.createdAt)}</span>
                            </div>

                            {/* Address if provided. When the customer also
                                pinned a location on the map, expose a quick
                                "view on map" affordance — the worker can see
                                exactly where to go. The map modal is
                                lazy-loaded so this link costs nothing until
                                clicked. */}
                            {order.location?.address && (
                              <div className="flex items-center gap-1 text-sm text-on-surface-variant">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate max-w-[200px]">{order.location.address}</span>
                                {typeof order.location.lat === 'number' && typeof order.location.lng === 'number' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      setViewingOrderPin({
                                        lat: order.location!.lat!,
                                        lng: order.location!.lng!,
                                        address: order.location!.address,
                                      })
                                    }}
                                    className="text-primary font-bold hover:underline mr-1"
                                  >
                                    {t('orders.viewOnMap')}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Payment mode badge */}
                            {order.paymentMode && (
                              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant">
                                {order.paymentMode === 'card' ? (
                                  <><CreditCard className="w-3 h-3" /> {t('orders.card')}</>
                                ) : (
                                  <><Wallet className="w-3 h-3" /> {t('orders.cash')}</>
                                )}
                              </span>
                            )}

                            {/* Price if available */}
                            {order.proposedPrice ? (
                              <span className="text-sm font-bold text-primary ms-auto">
                                {t('orders.priceEgp', { price: order.proposedPrice })}
                              </span>
                            ) : null}
                          </div>

                          {/* Rejection reason (history tab only — already rejected) */}
                          {order.rejectionReason && order.status === 'rejected' && (
                            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                              {t('orders.rejectionReason', { reason: order.rejectionReason })}
                            </p>
                          )}

                          {/* Pending cancellation request from the customer.
                              Shows the reason (if any) and gives the worker
                              approve/deny buttons. Only appears while the
                              request is pending — once responded to, the
                              banner goes away (order leaves the list on
                              approve, or state just flips to denied). */}
                          {order.cancellationRequest?.status === 'pending' && activeTab === 'active_orders' && (
                            <div className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                              <div className="flex items-start gap-2 mb-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-amber-900 text-sm">
                                    {t('orders.cancellationRequestedTitle')}
                                  </p>
                                  {order.cancellationRequest.reason && (
                                    <p className="text-sm text-amber-900/90 mt-1">
                                      {t('orders.cancellationReason', { reason: order.cancellationRequest.reason })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCancellationResponse(order._id, 'approved')}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                  {t('orders.acceptCancellation')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancellationResponse(order._id, 'denied')}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-900 text-sm font-bold hover:bg-amber-100 transition-colors"
                                >
                                  <XIcon className="w-4 h-4" />
                                  {t('orders.rejectCancellation')}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Completion report — shown in history so the worker
                              can revisit what they uploaded for a past order.
                              viewerIsWorker switches the card's title phrasing. */}
                          {order.status === 'completed' && order.completionReport && (
                            <CompletionReportCard report={order.completionReport} viewerIsWorker />
                          )}

                          {order.status === 'completed' && order.customerId && (
                            <div className="pt-3 mt-3 border-t border-outline-variant/10 flex items-center justify-between gap-3">
                              <span className="text-sm text-on-surface-variant">{t('orders.rateCustomerPrompt')}</span>
                              {/* Server-side `hasWorkerReview` is the source of truth across page
                                  reloads. `reviewedOrderIds` is the in-session add-on for orders
                                  just rated without a refetch. Either being true locks the button. */}
                              {(order.hasWorkerReview || reviewedOrderIds.has(order._id)) ? (
                                <span className="text-sm text-on-surface-variant px-3 py-2 rounded-lg bg-surface-container-low cursor-not-allowed">
                                  {t('orders.rated')}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setRateTarget({
                                    orderId: order._id,
                                    customerName: order.customerId
                                      ? `${order.customerId.firstName || ''} ${order.customerId.lastName || ''}`.trim() || t('orders.fallbackCustomer')
                                      : t('orders.fallbackCustomer'),
                                  })}
                                  className="text-sm bg-primary text-on-primary px-4 py-2 rounded-lg font-bold hover:bg-primary-container transition-colors"
                                >
                                  {t('orders.rateCustomer')}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Action buttons — only rendered for active statuses.
                              Legal transitions mirror the backend state machine:
                                pending     → accept | reject
                                accepted    → in_progress | cancel
                                in_progress → complete
                              History tab orders (completed / cancelled / rejected) show nothing. */}
                          {activeTab === 'active_orders' && (
                            <div className="flex flex-wrap gap-2 pt-3 border-t border-outline-variant/10">
                              {order.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOrderStatusUpdate(order._id, 'accepted')}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary-container transition-colors"
                                  >
                                    <Check className="w-4 h-4" />
                                    {t('orders.accept')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOrderStatusUpdate(order._id, 'rejected')}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors"
                                  >
                                    <XIcon className="w-4 h-4" />
                                    {t('orders.reject')}
                                  </button>
                                </>
                              )}
                              {order.status === 'pending_customer_confirmation' && (
                                <span className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 text-xs font-bold">
                                  في انتظار تأكيد العميل
                                </span>
                              )}
                              {order.status === 'accepted' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOrderStatusUpdate(order._id, 'in_progress')}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary-container transition-colors"
                                  >
                                    <Play className="w-4 h-4" />
                                    {t('orders.startWork')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOrderStatusUpdate(order._id, 'cancelled')}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant text-sm font-semibold hover:bg-surface-container-high transition-colors"
                                  >
                                    <XIcon className="w-4 h-4" />
                                    {t('orders.cancel')}
                                  </button>
                                </>
                              )}
                              {order.status === 'in_progress' && (
                                <button
                                  type="button"
                                  onClick={() => openCompletionModal(order)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  {t('orders.complete')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* --- Pagination Controls --- */}
                {/* Only shown when there's more than 1 page of results.
                    Uses ChevronRight/ChevronLeft — note that in RTL:
                    - ChevronRight points LEFT visually (= "previous page")
                    - ChevronLeft points RIGHT visually (= "next page") */}
                {pagination.pages > 1 && (
                  <div className="mt-8 flex justify-center items-center gap-2">
                    {/* Previous page button */}
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    {/* Page number buttons — show up to 5 pages */}
                    {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-colors ${
                          currentPage === page
                            ? 'bg-primary text-white'
                            : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    {/* Next page button */}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(pagination.pages, p + 1))}
                      disabled={currentPage === pagination.pages}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant disabled:opacity-30"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================
                TAB 4: "المحفظة" — Worker wallet
                Shows available balance, lifetime earnings, and recent
                transactions. "سحب الأرباح" opens a placeholder modal
                (real payout flow is not implemented yet).
                ======================================================== */}
            {activeTab === 'wallet' && (
              <div>
                {walletLoading ? (
                  <div className="space-y-4">
                    <div className="bg-surface-container-lowest rounded-2xl h-48 animate-pulse" />
                    <div className="bg-surface-container-lowest rounded-xl h-24 animate-pulse" />
                    <div className="bg-surface-container-lowest rounded-xl h-24 animate-pulse" />
                  </div>
                ) : (
                  <>
                    {/* Balance hero card */}
                    <div className="bg-gradient-to-br from-primary to-primary-container text-white rounded-2xl p-8 mb-6 shadow-lg shadow-primary/20">
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <div>
                          <p className="text-sm opacity-80 mb-1">{t('wallet.availableBalance')}</p>
                          <p className="text-4xl md:text-5xl font-black tracking-tight">
                            {wallet?.balance ?? 0}
                            <span className="text-xl font-medium opacity-80"> {t('wallet.currency')}</span>
                          </p>
                        </div>
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                          <Wallet className="w-7 h-7" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div className="bg-white/10 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 opacity-80 mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>{t('wallet.totalEarnings')}</span>
                          </div>
                          <p className="font-bold text-lg">
                            {t('orders.priceEgp', { price: wallet?.lifetimeEarnings ?? 0 })}
                          </p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 opacity-80 mb-1">
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                            <span>{t('wallet.totalWithdrawn')}</span>
                          </div>
                          <p className="font-bold text-lg">
                            {t('orders.priceEgp', { price: wallet?.lifetimeWithdrawn ?? 0 })}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowWithdrawModal(true)}
                        disabled={!wallet || wallet.balance <= 0}
                        className="w-full bg-white text-primary py-3 rounded-xl font-black text-base flex items-center justify-center gap-2 hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <ArrowDownCircle className="w-5 h-5" />
                        {t('wallet.withdraw')}
                      </button>
                    </div>

                    {/* Transactions list */}
                    <div className="bg-surface-container-lowest rounded-xl p-6">
                      <h3 className="text-lg font-bold mb-4 border-r-4 border-primary pr-3">
                        {t('wallet.recentTx')}
                      </h3>

                      {walletTransactions.length === 0 ? (
                        <div className="text-center py-12 text-on-surface-variant">
                          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>{t('wallet.noneTitle')}</p>
                          <p className="text-xs mt-1">{t('wallet.noneSub')}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {walletTransactions.map(tx => {
                            const isCredit = tx.type === 'credit'
                            const orderServiceName = typeof tx.relatedOrderId === 'object' && tx.relatedOrderId?.serviceId
                              && typeof tx.relatedOrderId.serviceId === 'object'
                                ? tx.relatedOrderId.serviceId.name
                                : null
                            return (
                              <div
                                key={tx._id}
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container-low transition-colors"
                              >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                  isCredit
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-amber-100 text-amber-600'
                                }`}>
                                  {isCredit ? <TrendingUp className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-on-surface text-sm truncate">
                                    {tx.note || (isCredit ? t('wallet.txDefaultCredit') : t('wallet.txDefaultDebit'))}
                                  </p>
                                  <p className="text-xs text-on-surface-variant">
                                    {new Date(tx.createdAt).toLocaleDateString('ar-EG', {
                                      year: 'numeric', month: 'long', day: 'numeric',
                                    })}
                                    {orderServiceName && ` • ${orderServiceName}`}
                                  </p>
                                </div>
                                <div className={`text-sm font-black shrink-0 ${
                                  isCredit ? 'text-green-600' : 'text-amber-600'
                                }`}>
                                  {isCredit ? '+' : '-'}{t('orders.priceEgp', { price: tx.amount })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ─── Withdraw Modal (placeholder) ─────────────────────────── */}
      {/* The worker fills out this form but the submit does NOT actually
          transfer money — the real payout pipeline (Paymob / bank transfer)
          isn't wired yet. The UI is complete so the future integration is a
          small swap of the onSubmit body rather than a rewrite.
          Clicking submit shows an inline "قريباً" notice and closes the modal. */}
      {showWithdrawModal && (
        <WithdrawModal
          balance={wallet?.balance || 0}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={() => {
            // Refresh wallet so the new pending withdrawal shows immediately.
            api.getWithAuth('/worker/wallet')
              .then(data => {
                setWallet(data.wallet)
                setWalletTransactions(data.transactions || [])
              })
              .catch(() => { /* silent — modal already showed success */ })
          }}
        />
      )}

      {/* ─── Completion-Report Modal ──────────────────────────────── */}
      {/* Opens when the worker clicks "إنهاء الخدمة" on an in_progress order.
          Collects details + images (uploaded to Cloudinary) and submits them
          as the "proof of work" when flipping the order to `completed`.
          The backend rejects the transition if either field is missing. */}
      {completingOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Click on the backdrop closes the modal (if not submitting).
            if (e.target === e.currentTarget) closeCompletionModal()
          }}
        >
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-outline-variant/10">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-on-surface">
                  <FileCheck2 className="w-6 h-6 text-green-600" />
                  {t('completionModal.title')}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {completingOrder.serviceId?.name || completingOrder.categoryId?.name || t('completionModal.fallbackOrder')}
                  {completingOrder.customerId && ` • ${completingOrder.customerId.firstName} ${completingOrder.customerId.lastName}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCompletionModal}
                disabled={completionSubmitting || completionUploading}
                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <p className="text-sm text-on-surface-variant">
                {t('completionModal.intro')}
              </p>

              {/* Details textarea */}
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">
                  {t('completionModal.labelDetails')} <span className="text-error">*</span>
                </label>
                <textarea
                  value={completionDetails}
                  onChange={e => setCompletionDetails(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder={t('completionModal.detailsPlaceholder')}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                />
                <p className="text-xs text-on-surface-variant mt-1 text-left">
                  {completionDetails.length} / 2000
                </p>
              </div>

              {/* Images */}
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">
                  {t('completionModal.labelImages')} <span className="text-error">*</span>
                  <span className="text-xs font-normal text-on-surface-variant mr-2">
                    {t('completionModal.imagesHelper', { max: MAX_COMPLETION_IMAGES })}
                  </span>
                </label>

                {/* Thumbnails grid */}
                {completionImages.length > 0 && (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                    {completionImages.map((url, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden bg-surface-container-high">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeCompletionImage(idx)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title={t('completionModal.removeAria')}
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button — hidden input + label-style button */}
                {completionImages.length < MAX_COMPLETION_IMAGES && (
                  <label
                    className={`flex items-center justify-center gap-2 w-full border-2 border-dashed border-outline-variant/40 rounded-xl py-6 cursor-pointer transition-colors ${
                      completionUploading ? 'opacity-50' : 'hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={completionUploading}
                      onChange={handleCompletionImagePick}
                    />
                    {completionUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <span className="text-sm text-on-surface-variant">{t('completionModal.uploading')}</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium text-on-surface">
                          {t('completionModal.pickFromDevice')}
                        </span>
                      </>
                    )}
                  </label>
                )}
              </div>

              {/* Error */}
              {completionError && (
                <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 text-error text-sm">
                  {completionError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-outline-variant/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeCompletionModal}
                disabled={completionSubmitting || completionUploading}
                className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-high disabled:opacity-50"
              >
                {t('completionModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmitCompletion}
                disabled={completionSubmitting || completionUploading || !completionDetails.trim() || completionImages.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {completionSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('completionModal.sending')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {t('completionModal.submit')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Worker location picker — Leaflet bundle is lazy-loaded inside */}
      <AddressPicker
        open={locationPicker}
        initial={savedCoords}
        onConfirm={handleLocationPicked}
        onClose={() => setLocationPicker(false)}
      />

      {/* Read-only order-pin viewer — opens when the worker clicks
          "عرض على الخريطة" on an order card. */}
      <LocationViewer
        open={!!viewingOrderPin}
        lat={viewingOrderPin?.lat ?? 0}
        lng={viewingOrderPin?.lng ?? 0}
        address={viewingOrderPin?.address}
        onClose={() => setViewingOrderPin(null)}
      />

      {rateTarget && (
        <RateCustomerModal
          serviceRequestId={rateTarget.orderId}
          customerName={rateTarget.customerName}
          onClose={() => setRateTarget(null)}
          onSuccess={() => {
            const id = rateTarget.orderId
            setReviewedOrderIds(prev => {
              const next = new Set(prev)
              next.add(id)
              return next
            })
          }}
        />
      )}
    </div>
  )
}

// =============================================================================
// WithdrawModal — real Paymob payout flow
// =============================================================================
// Lets the worker pick a destination (bank / InstaPay / mobile wallet) and
// submit a withdrawal. The submit handler first PATCHes the worker's saved
// payout info, then POSTs the withdrawal. The wallet balance is reserved
// atomically server-side, so a double-click can't overdraw.
//
// onSuccess is called when the backend accepts the request — the parent
// uses it to refresh the wallet panel.
// =============================================================================
function WithdrawModal({
  balance,
  onClose,
  onSuccess,
}: {
  balance: number
  onClose: () => void
  onSuccess?: () => void
}) {
  const [method, setMethod] = useState<'bank' | 'instapay' | 'wallet'>('instapay')
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [instapayAlias, setInstapayAlias] = useState('')
  const [walletPhone, setWalletPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const t = useTranslations('dashboard')

  // Prefill any previously saved destination so the worker doesn't retype it
  // on every withdrawal. Errors are silent — this is purely a convenience.
  useEffect(() => {
    api.getWithAuth('/worker/payouts/info')
      .then(data => {
        const info = data?.payoutInfo
        if (!info) return
        if (info.method) setMethod(info.method)
        if (info.bankAccountNumber) setBankAccountNumber(info.bankAccountNumber)
        if (info.bankName) setBankName(info.bankName)
        if (info.accountHolderName) setAccountHolderName(info.accountHolderName)
        if (info.instapayAlias) setInstapayAlias(info.instapayAlias)
        if (info.walletPhone) setWalletPhone(info.walletPhone)
      })
      .catch(() => { /* no saved info yet — start with empty form */ })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0 || amt > balance) {
      setError(t('withdrawModal.errAmount'))
      return
    }
    setSubmitting(true)
    try {
      // Save / update payout info first so the next withdrawal can skip
      // re-entering it. The endpoint validates per-method fields itself.
      await api.postWithAuth('/worker/payouts/info', {
        method,
        bankAccountNumber,
        bankName,
        accountHolderName,
        instapayAlias,
        walletPhone,
      })
      await api.postWithAuth('/worker/payouts/withdraw', { amount: amt })
      setSuccess(true)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('withdrawModal.errGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-outline-variant/10">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-on-surface">
              <ArrowDownCircle className="w-6 h-6 text-primary" />
              {t('withdrawModal.title')}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              <span className="font-bold text-on-surface">{t('withdrawModal.availableBalance', { amount: balance })}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Amount */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">
              {t('withdrawModal.labelAmount')} <span className="text-error">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={balance}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 pe-14 text-on-surface text-lg font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
              <span className="absolute inset-y-0 end-4 flex items-center text-on-surface-variant text-sm">
                {t('withdrawModal.currency')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAmount(String(balance))}
              className="text-xs text-primary hover:underline mt-1 font-medium"
            >
              {t('withdrawModal.withdrawAll', { amount: balance })}
            </button>
          </div>

          {/* Method selector — Paymob payouts support bank / InstaPay / wallet */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">
              {t('withdrawModal.labelMethod')} <span className="text-error">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod('instapay')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${
                  method === 'instapay'
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 hover:border-outline-variant/60'
                }`}
              >
                <CreditCard className={`w-6 h-6 ${method === 'instapay' ? 'text-primary' : 'text-on-surface-variant'}`} />
                <span className="text-sm font-semibold text-on-surface">{t('withdrawModal.methodInstapay')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('wallet')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${
                  method === 'wallet'
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 hover:border-outline-variant/60'
                }`}
              >
                <Wallet className={`w-6 h-6 ${method === 'wallet' ? 'text-primary' : 'text-on-surface-variant'}`} />
                <span className="text-sm font-semibold text-on-surface">{t('withdrawModal.methodWallet')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('bank')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${
                  method === 'bank'
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 hover:border-outline-variant/60'
                }`}
              >
                <Landmark className={`w-6 h-6 ${method === 'bank' ? 'text-primary' : 'text-on-surface-variant'}`} />
                <span className="text-sm font-semibold text-on-surface">{t('withdrawModal.methodBank')}</span>
              </button>
            </div>
          </div>

          {/* Destination details (changes based on method) */}
          {method === 'instapay' && (
            <div>
              <label className="block text-sm font-bold text-on-surface mb-2">
                {t('withdrawModal.labelInstapay')} <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={instapayAlias}
                onChange={e => setInstapayAlias(e.target.value.trim())}
                placeholder="name@instapay"
                required
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          )}

          {method === 'wallet' && (
            <div>
              <label className="block text-sm font-bold text-on-surface mb-2">
                {t('withdrawModal.labelWalletPhone')} <span className="text-error">*</span>
              </label>
              <input
                type="tel"
                value={walletPhone}
                onChange={e => setWalletPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="01012345678"
                required
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-mono focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          )}

          {method === 'bank' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">
                  {t('withdrawModal.labelAccountHolder')} <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={accountHolderName}
                  onChange={e => setAccountHolderName(e.target.value)}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">
                  {t('withdrawModal.labelBankName')}
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">
                  {t('withdrawModal.labelBankNumber')} <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={e => setBankAccountNumber(e.target.value)}
                  placeholder="EG00 0000 0000 0000 0000 0000 000"
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface font-mono focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
          )}

          {/* Status messages */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-green-900 mb-0.5">{t('withdrawModal.successTitle')}</p>
                <p className="text-green-800">{t('withdrawModal.successBody')}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-outline-variant/10">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface font-semibold hover:bg-surface-container-high"
            >
              {success ? t('withdrawModal.done') : t('withdrawModal.close')}
            </button>
            {!success && (
              <button
                type="submit"
                disabled={submitting || !amount || Number(amount) <= 0 || Number(amount) > balance}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowDownCircle className="w-4 h-4" />
                )}
                {t('withdrawModal.submit')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
