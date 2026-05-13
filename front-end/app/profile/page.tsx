'use client'

// =============================================================================
// CUSTOMER PROFILE PAGE — /profile
// =============================================================================
//
// Sections (anchor-scrolled from the sidebar):
//   1. overview     — profile header card + personal info + favorites
//   2. addresses    — saved-addresses CRUD
//   3. payment      — payment methods (Visa/Mastercard/ميزة) CRUD
//   4. orders       — order history with in-progress/history tabs
//   5. settings     — notification prefs + danger zone link
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar, MapPin, ShoppingBag, ChevronLeft, ChevronRight, Pencil,
  CreditCard, Bell, Trash2, Plus, Star, Heart, User as UserIcon,
  Save, Settings, History, BadgeCheck, Home, Briefcase, X as XIcon,
  MessageSquare, Camera, Loader2,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import CancelOrderModal from '@/components/CancelOrderModal'
import ReviewOrderModal from '@/components/ReviewOrderModal'
import AddressPicker, { type PickedAddress } from '@/components/AddressPicker/AddressPicker'
import { useAuth } from '@/lib/auth-context'
import { useFavorites } from '@/lib/favorites-context'
import { api } from '@/lib/api'
import { uploadChatFile } from '@/lib/upload'
import type {
  CustomerProfileData, ServiceRequest, PaginationInfo,
  PaymentMethod, NotificationPreferences, Category,
} from '@/lib/types'

// Status badge config — maps order status to Arabic label + colors.
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending:     { label: 'قيد الانتظار', bg: 'bg-amber-50',   text: 'text-amber-600' },
  accepted:    { label: 'مقبول',        bg: 'bg-blue-50',    text: 'text-blue-600' },
  in_progress: { label: 'قيد التنفيذ',  bg: 'bg-primary/10', text: 'text-primary' },
  completed:   { label: 'مكتمل',        bg: 'bg-green-50',   text: 'text-green-600' },
  rejected:    { label: 'مرفوض',        bg: 'bg-red-50',     text: 'text-red-600' },
  cancelled:   { label: 'ملغي',         bg: 'bg-gray-100',   text: 'text-gray-500' },
}

type Section = 'overview' | 'addresses' | 'payment' | 'orders' | 'settings'

interface AddressDraft {
  _id?: string
  label: string
  addressLine: string
  city: string
  area: string
  isPrimary: boolean
  // Coords from the map picker. Optional — addresses entered before the
  // picker existed (or if the user typed manually) won't have them.
  // The draft uses flat lng/lat for ergonomics; the saved-address shape
  // (returned by the server) carries them inside `point.coordinates`.
  lng?: number
  lat?: number
  // Returned by the server on existing addresses. We keep the field on
  // the draft so `addresses` (which is AddressDraft[]) can hold what the
  // server sends without a separate type. `coordinates` is [lng, lat].
  point?: { type?: string; coordinates?: [number, number] }
}

const EMPTY_ADDRESS: AddressDraft = {
  label: 'المنزل', addressLine: '', city: '', area: '', isPrimary: false,
}

export default function ProfilePage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth()
  const { ids: favoriteIds } = useFavorites()
  const router = useRouter()

  // ─── Page-level state ───────────────────────────────────────────
  const [profile, setProfile] = useState<CustomerProfileData | null>(null)
  const [orders, setOrders] = useState<ServiceRequest[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 0 })
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({ orders: true, messages: true, promotions: true })
  const [categories, setCategories] = useState<Category[]>([])

  // Active section in the sidebar nav. Each section also has a DOM
  // anchor (id attribute) so the scroll-into-view pattern works.
  const [activeSection, setActiveSection] = useState<Section>('overview')

  // Order tabs (existing behavior preserved inside the orders section)
  const [orderTab, setOrderTab] = useState<'in_progress' | 'history'>('in_progress')
  const [currentPage, setCurrentPage] = useState(1)

  // Modal slots — null when closed.
  const [cancellingOrder, setCancellingOrder] = useState<ServiceRequest | null>(null)
  const [reviewingOrder, setReviewingOrder] = useState<ServiceRequest | null>(null)

  // ─── Personal-info draft (saved as a batch by the header button) ─
  // The batch saves name, phone, preferred language, and the chosen
  // favorite category ids.
  const [nameDraft, setNameDraft] = useState({ firstName: '', lastName: '' })
  const [phoneDraft, setPhoneDraft] = useState('')
  const [languageDraft, setLanguageDraft] = useState<'ar' | 'en'>('ar')
  const [favoriteCategoryIds, setFavoriteCategoryIds] = useState<string[]>([])
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchDirty, setBatchDirty] = useState(false)

  // ─── Address state ──────────────────────────────────────────────
  const [addresses, setAddresses] = useState<AddressDraft[]>([])
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(null)
  const [addressSaving, setAddressSaving] = useState(false)
  // Map-picker modal visibility — opens only on click, so its Leaflet
  // bundle is also lazy-loaded only on click.
  const [pickerOpen, setPickerOpen] = useState(false)

  // ─── Avatar upload state ────────────────────────────────────────
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // ─── Payment-method add form ────────────────────────────────────
  const [showAddCard, setShowAddCard] = useState(false)
  const [cardForm, setCardForm] = useState({ cardholderName: '', lastFourDigits: '', cardBrand: 'visa' as const, expiryMonth: 1, expiryYear: 2025 })

  // Refs to each section so the sidebar can scroll smoothly.
  const sectionRefs = {
    overview:  useRef<HTMLDivElement>(null),
    addresses: useRef<HTMLDivElement>(null),
    payment:   useRef<HTMLDivElement>(null),
    orders:    useRef<HTMLDivElement>(null),
    settings:  useRef<HTMLDivElement>(null),
  }

  // ─── Auth guards ────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isLoggedIn) router.push('/signin')
  }, [authLoading, isLoggedIn, router])

  // ─── Data loaders ───────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return
    api.getWithAuth('/customer/profile')
      .then(data => {
        setProfile(data.profile)
        setNameDraft({ firstName: data.profile.firstName || '', lastName: data.profile.lastName || '' })
        setPhoneDraft(data.profile.phone || '')
        setLanguageDraft(data.profile.preferredLanguage || 'ar')
        setFavoriteCategoryIds((data.profile.favoriteCategories || []).map((c: any) => c._id))
        setAddresses(data.profile.addresses || [])
        if (data.profile.notificationPreferences) {
          setNotifPrefs(data.profile.notificationPreferences)
        }
      })
      .catch(err => console.error('Failed to load profile:', err))
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return
    api.getWithAuth('/customer/payment-methods')
      .then(data => setPaymentMethods(data.paymentMethods))
      .catch(err => console.error('Failed to load payment methods:', err))
  }, [isLoggedIn])

  useEffect(() => {
    api.get('/categories')
      .then(data => setCategories(data.categories))
      .catch(err => console.error('Failed to load categories:', err))
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    const params = new URLSearchParams({ status: orderTab, page: String(currentPage), limit: '10' })
    api.getWithAuth(`/customer/orders?${params.toString()}`)
      .then(data => {
        setOrders(data.orders)
        setPagination(data.pagination)
      })
      .catch(err => console.error('Failed to load orders:', err))
  }, [isLoggedIn, orderTab, currentPage])

  // ─── Helpers ────────────────────────────────────────────────────
  const getInitial = () => profile?.firstName?.charAt(0) || user?.firstName?.charAt(0) || '?'
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const memberYear = profile?.memberSince ? new Date(profile.memberSince).getFullYear() : null

  const goToSection = (s: Section) => {
    setActiveSection(s)
    const node = sectionRefs[s].current
    if (node) {
      const top = node.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  const markDirty = () => setBatchDirty(true)

  // Batch save: name + phone + language + favorite categories.
  const handleBatchSave = async () => {
    try {
      setBatchSaving(true)
      const data = await api.putWithAuth('/customer/profile', {
        firstName: nameDraft.firstName.trim(),
        lastName: nameDraft.lastName.trim(),
        phone: phoneDraft.trim(),
        preferredLanguage: languageDraft,
        favoriteCategoryIds,
      })
      setProfile(data.profile)
      setBatchDirty(false)
    } catch (err: any) {
      alert(err?.message || 'فشل حفظ التغييرات')
    } finally {
      setBatchSaving(false)
    }
  }

  // ─── Avatar upload ──────────────────────────────────────────────
  // Upload flow: file → Cloudinary (uploadChatFile) → PUT /customer/profile
  // with the secure URL. We update local state immediately so the new
  // image shows without needing to re-fetch the whole profile.
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('الرجاء اختيار ملف صورة')
      e.target.value = ''
      return
    }
    try {
      setAvatarUploading(true)
      const { url } = await uploadChatFile(file)
      const data = await api.putWithAuth('/customer/profile', { profileImage: url })
      setProfile(data.profile)
    } catch (err: any) {
      alert(err?.message || 'فشل رفع الصورة')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  // ─── Address handlers ───────────────────────────────────────────
  // When opening an existing address that already has coords, pre-load
  // them into the draft so the picker centers on the saved pin.
  const openAddAddress = () => setAddressDraft({ ...EMPTY_ADDRESS })
  const openEditAddress = (a: AddressDraft) => {
    const coords = a.point?.coordinates
    setAddressDraft({
      ...a,
      // GeoJSON is [lng, lat]; the draft stores them as separate flat fields.
      lng: Array.isArray(coords) ? coords[0] : undefined,
      lat: Array.isArray(coords) ? coords[1] : undefined,
    })
  }
  const cancelAddressDraft = () => setAddressDraft(null)

  // Called when the map picker fires "تأكيد". Merges the chosen coords +
  // (optional) reverse-geocoded text fields into the open draft. The user
  // can still edit any field afterwards before clicking "حفظ".
  const handlePickerConfirm = (picked: PickedAddress) => {
    if (!addressDraft) return
    setAddressDraft({
      ...addressDraft,
      lat: picked.lat,
      lng: picked.lng,
      // Only overwrite text fields when Nominatim returned something — never
      // wipe what the user already typed. Empty strings from Nominatim are
      // also ignored.
      addressLine: picked.address?.trim() || addressDraft.addressLine,
      city: picked.city?.trim() || addressDraft.city,
      area: picked.area?.trim() || addressDraft.area,
    })
    setPickerOpen(false)
  }

  const saveAddress = async () => {
    if (!addressDraft) return
    if (!addressDraft.addressLine.trim()) return alert('العنوان التفصيلي مطلوب')
    try {
      setAddressSaving(true)
      const isEdit = Boolean(addressDraft._id)
      const url = isEdit
        ? `/customer/addresses/${addressDraft._id}`
        : '/customer/addresses'
      // Backend accepts lng/lat as flat fields and assembles the GeoJSON
      // Point itself. Sending undefined for either is fine — the controller
      // just leaves the existing coords (or absence thereof) untouched.
      const payload = {
        ...addressDraft,
        lng: addressDraft.lng,
        lat: addressDraft.lat,
      }
      const data = isEdit
        ? await api.putWithAuth(url, payload)
        : await api.postWithAuth(url, payload)
      setAddresses(data.addresses)
      setAddressDraft(null)
    } catch (err: any) {
      alert(err?.message || 'فشل الحفظ')
    } finally {
      setAddressSaving(false)
    }
  }

  const deleteAddress = async (id?: string) => {
    if (!id) return
    if (!confirm('حذف هذا العنوان؟')) return
    try {
      const data = await api.deleteWithAuth(`/customer/addresses/${id}`)
      setAddresses(data.addresses)
    } catch (err: any) {
      alert(err?.message || 'فشل الحذف')
    }
  }

  // ─── Payment handlers (preserved) ───────────────────────────────
  const handleAddCard = async () => {
    try {
      const data = await api.postWithAuth('/customer/payment-methods', cardForm)
      setPaymentMethods(prev => [...prev, data.paymentMethod])
      setShowAddCard(false)
      setCardForm({ cardholderName: '', lastFourDigits: '', cardBrand: 'visa', expiryMonth: 1, expiryYear: 2025 })
    } catch (err: any) {
      alert(err?.message || 'فشل إضافة البطاقة')
    }
  }
  const handleDeleteCard = async (id: string) => {
    try {
      await api.deleteWithAuth(`/customer/payment-methods/${id}`)
      setPaymentMethods(prev => prev.filter(c => c._id !== id))
    } catch (err: any) { console.error('Failed to delete card:', err.message) }
  }
  const handleSetDefault = async (id: string) => {
    try {
      await api.putWithAuth(`/customer/payment-methods/${id}/default`, {})
      setPaymentMethods(prev => prev.map(c => ({ ...c, isDefault: c._id === id })))
    } catch (err: any) { console.error('Failed to set default:', err.message) }
  }

  const handleToggleNotif = async (key: keyof NotificationPreferences) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(updated)
    try {
      await api.putWithAuth('/customer/notifications/preferences', updated)
    } catch (err: any) {
      setNotifPrefs(notifPrefs)
      console.error('Failed to update preferences:', err.message)
    }
  }

  const toggleFavoriteCategory = (id: string) => {
    setFavoriteCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
    markDirty()
  }

  // ─── Loading ────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/30 animate-pulse" />
      </div>
    )
  }

  const navItems: Array<{ key: Section; label: string; icon: any }> = [
    { key: 'overview',  label: 'نظرة عامة',       icon: UserIcon },
    { key: 'addresses', label: 'العناوين المسجلة', icon: MapPin },
    { key: 'payment',   label: 'طرق الدفع',       icon: CreditCard },
    { key: 'orders',    label: 'سجل الطلبات',     icon: History },
    { key: 'settings',  label: 'إعدادات الحساب',  icon: Settings },
  ]

  return (
    <div className="bg-background min-h-screen">
      <Navbar />

      <main className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
        {/* ----- Page header ----- */}
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-on-surface mb-2 tracking-tight">
              الملف الشخصي للعميل
            </h1>
            <p className="text-on-surface-variant text-lg leading-relaxed">
              أهلاً بك، {profile?.firstName || ''}! هنا يمكنك إدارة معلوماتك وتفضيلاتك بكل سهولة.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBatchSave}
            disabled={!batchDirty || batchSaving}
            className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Save className="w-5 h-5" />
            {batchSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ----- Sidebar nav ----- */}
          <aside className="lg:col-span-3 hidden lg:block">
            <nav className="flex flex-col gap-2 p-2 bg-surface-container-low rounded-xl sticky top-24">
              {navItems.map(item => {
                const Icon = item.icon
                const active = activeSection === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => goToSection(item.key)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-4 font-bold text-right transition-all ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* ----- Main content ----- */}
          <div className="lg:col-span-9 space-y-8">
            {/* ─── Overview section ─── */}
            <div ref={sectionRefs.overview} id="overview" className="space-y-6 scroll-mt-28">
              {/* Profile header card */}
              <section className="bg-surface-container-lowest rounded-[24px] p-8 shadow-sm flex flex-col md:flex-row items-center gap-8">
                <div className="relative group flex-shrink-0">
                  <div className="w-40 h-40 rounded-full overflow-hidden bg-surface-container-high ring-4 ring-primary/10 transition-all group-hover:ring-primary/30">
                    {profile?.profileImage ? (
                      <img src={profile.profileImage} alt={profile.firstName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary text-white flex items-center justify-center font-bold text-5xl">
                        {getInitial()}
                      </div>
                    )}
                  </div>
                  {/* Camera overlay — click anywhere on the avatar to change.
                      The hidden input is wired up via avatarInputRef. */}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    aria-label="تغيير الصورة الشخصية"
                    className="absolute bottom-1 left-1 w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-wait"
                  >
                    {avatarUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
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
                <div className="text-center md:text-right flex-1 space-y-4">
                  <div>
                    <h2 className="text-3xl font-bold text-on-surface">
                      {profile?.firstName} {profile?.lastName}
                    </h2>
                    <p className="text-on-surface-variant flex items-center justify-center md:justify-start gap-2 mt-1">
                      <BadgeCheck className="w-4 h-4 text-primary" fill="currentColor" />
                      عضو منذ {memberYear || '...'}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center md:justify-start gap-3">
                    <div className="bg-surface-container-low px-4 py-3 rounded-2xl flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-full text-primary">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-on-surface-variant font-medium">إجمالي الحجوزات</p>
                        <p className="text-lg font-bold">{profile?.numberOfOrders ?? 0}</p>
                      </div>
                    </div>
                    <Link
                      href="/favorites"
                      className="bg-surface-container-low px-4 py-3 rounded-2xl flex items-center gap-3 hover:bg-surface-container-high transition-colors"
                    >
                      <div className="bg-rose-100 p-2 rounded-full text-rose-700">
                        <Heart className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-on-surface-variant font-medium">العمال المفضلين</p>
                        <p className="text-lg font-bold">{favoriteIds.size}</p>
                      </div>
                    </Link>
                    
                  </div>
                </div>
              </section>

              {/* Personal info */}
              <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-primary" />
                  المعلومات الشخصية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-on-surface-variant">الاسم الأول</label>
                    <input
                      type="text"
                      value={nameDraft.firstName}
                      onChange={(e) => { setNameDraft({ ...nameDraft, firstName: e.target.value }); markDirty() }}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-on-surface-variant">الاسم الأخير</label>
                    <input
                      type="text"
                      value={nameDraft.lastName}
                      onChange={(e) => { setNameDraft({ ...nameDraft, lastName: e.target.value }); markDirty() }}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-on-surface-variant">البريد الإلكتروني</label>
                    <input
                      type="email"
                      value={profile?.email || ''}
                      readOnly
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-on-surface-variant cursor-not-allowed"
                    />
                    <p className="text-xs text-on-surface-variant">البريد الإلكتروني غير قابل للتعديل من هذه الصفحة.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-on-surface-variant">رقم الهاتف</label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={phoneDraft}
                      onChange={(e) => { setPhoneDraft(e.target.value); markDirty() }}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-right focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-on-surface-variant">اللغة المفضلة</label>
                    <select
                      value={languageDraft}
                      onChange={(e) => { setLanguageDraft(e.target.value as 'ar' | 'en'); markDirty() }}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="ar">العربية</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Favorite services */}
              <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  الخدمات المفضلة
                </h3>
                {categories.length === 0 ? (
                  <p className="text-on-surface-variant text-sm">جاري التحميل...</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {categories.map(cat => {
                      const selected = favoriteCategoryIds.includes(cat._id)
                      return (
                        <button
                          key={cat._id}
                          type="button"
                          onClick={() => toggleFavoriteCategory(cat._id)}
                          className={`px-4 py-2 rounded-full font-medium border transition-colors ${
                            selected
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10'
                          }`}
                        >
                          {cat.name}
                        </button>
                      )
                    })}
                  </div>
                )}
                {batchDirty && (
                  <p className="text-xs text-amber-600 mt-4">لديك تغييرات لم يتم حفظها. اضغط "حفظ التغييرات" أعلى الصفحة.</p>
                )}
              </section>
            </div>

            {/* ─── Addresses section ─── */}
            <div ref={sectionRefs.addresses} id="addresses" className="scroll-mt-28">
              <section className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    العناوين المسجلة
                  </h2>
                  {!addressDraft && (
                    <button
                      type="button"
                      onClick={openAddAddress}
                      className="text-primary font-bold bg-primary/5 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-primary/10"
                    >
                      <Plus className="w-4 h-4" />
                      إضافة عنوان
                    </button>
                  )}
                </div>

                {addressDraft && (
                  <div className="bg-surface-container-lowest p-6 rounded-2xl border border-primary/20 space-y-3">
                    {/* Map button — opens the lazy-loaded picker. When the
                        user confirms a pin, addressLine/city/area get auto-
                        filled from Nominatim (one call, on confirm only) and
                        coords get attached to the draft. */}
                    <div className="flex items-center justify-between gap-3 bg-primary/5 rounded-xl p-3">
                      <div className="text-right flex-1 min-w-0">
                        <p className="text-sm font-bold flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-primary" />
                          الموقع على الخريطة
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {typeof addressDraft.lat === 'number' && typeof addressDraft.lng === 'number'
                            ? `محدد: ${addressDraft.lat.toFixed(5)}, ${addressDraft.lng.toFixed(5)}`
                            : 'لم يتم تحديد موقع بعد'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-container transition-colors shrink-0"
                      >
                        {typeof addressDraft.lat === 'number' ? 'تعديل على الخريطة' : 'تحديد على الخريطة'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold block mb-1">الاسم (مثل المنزل / المكتب)</label>
                        <input
                          type="text"
                          value={addressDraft.label}
                          onChange={(e) => setAddressDraft({ ...addressDraft, label: e.target.value })}
                          className="w-full bg-surface-container-low rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold block mb-1">العنوان التفصيلي</label>
                        <input
                          type="text"
                          value={addressDraft.addressLine}
                          onChange={(e) => setAddressDraft({ ...addressDraft, addressLine: e.target.value })}
                          placeholder="الشارع، رقم المبنى..."
                          className="w-full bg-surface-container-low rounded-xl px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold block mb-1">المدينة</label>
                        <input
                          type="text"
                          value={addressDraft.city}
                          onChange={(e) => setAddressDraft({ ...addressDraft, city: e.target.value })}
                          className="w-full bg-surface-container-low rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold block mb-1">الحي / المنطقة</label>
                        <input
                          type="text"
                          value={addressDraft.area}
                          onChange={(e) => setAddressDraft({ ...addressDraft, area: e.target.value })}
                          className="w-full bg-surface-container-low rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addressDraft.isPrimary}
                        onChange={(e) => setAddressDraft({ ...addressDraft, isPrimary: e.target.checked })}
                        className="w-4 h-4 accent-primary"
                      />
                      تعيين كعنوان أساسي
                    </label>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={saveAddress}
                        disabled={addressSaving}
                        className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold disabled:opacity-40"
                      >
                        {addressSaving ? 'جاري الحفظ...' : 'حفظ'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelAddressDraft}
                        disabled={addressSaving}
                        className="flex-1 bg-surface-container-low py-3 rounded-xl font-bold disabled:opacity-40"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {!addressDraft && addresses.length === 0 && (
                  <div className="bg-surface-container-lowest p-8 rounded-2xl text-center">
                    <MapPin className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
                    <p className="text-on-surface-variant">لا توجد عناوين محفوظة</p>
                  </div>
                )}

                {!addressDraft && addresses.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {addresses.map(addr => (
                      <div
                        key={addr._id}
                        className={`bg-surface-container-lowest p-6 rounded-2xl relative shadow-sm hover:shadow-md transition-shadow ${addr.isPrimary ? 'border border-primary/30' : 'border border-outline-variant/15'}`}
                      >
                        <div className="absolute top-4 left-4 flex gap-2">
                          {addr.isPrimary && (
                            <span className="bg-primary-container text-on-primary-container text-xs font-bold px-3 py-1 rounded-full">
                              الأساسي
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditAddress(addr)}
                            className="text-on-surface-variant hover:text-primary"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAddress(addr._id)}
                            className="text-on-surface-variant hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="bg-primary/5 p-4 rounded-full">
                            {addr.label?.includes('مكتب') ? (
                              <Briefcase className="w-5 h-5 text-primary" />
                            ) : (
                              <Home className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="space-y-1 mt-1">
                            <p className="font-bold text-lg">{addr.label}</p>
                            <p className="text-on-surface-variant text-sm leading-relaxed">
                              {addr.addressLine}
                              {(addr.city || addr.area) && <br />}
                              {[addr.area, addr.city].filter(Boolean).join('، ')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ─── Payment section ─── */}
            <div ref={sectionRefs.payment} id="payment" className="scroll-mt-28">
              <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    طرق الدفع
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowAddCard(!showAddCard)}
                    className="text-primary font-bold bg-primary/5 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-primary/10"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة بطاقة
                  </button>
                </div>

                {showAddCard && (
                  <div className="bg-surface-container-low rounded-xl p-4 mb-4 space-y-3">
                    <input type="text" placeholder="اسم حامل البطاقة" value={cardForm.cardholderName} onChange={e => setCardForm({...cardForm, cardholderName: e.target.value})} className="w-full bg-white border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
                    <input type="text" placeholder="آخر 4 أرقام" maxLength={4} value={cardForm.lastFourDigits} onChange={e => setCardForm({...cardForm, lastFourDigits: e.target.value.replace(/\D/g, '')})} dir="ltr" className="w-full bg-white border-none rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-primary/20 outline-none" />
                    <div className="flex gap-2">
                      <select value={cardForm.cardBrand} onChange={e => setCardForm({...cardForm, cardBrand: e.target.value as any})} className="flex-1 bg-white border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20">
                        <option value="visa">Visa</option>
                        <option value="mastercard">Mastercard</option>
                        <option value="meza">ميزة</option>
                      </select>
                      <input type="number" placeholder="شهر" min={1} max={12} value={cardForm.expiryMonth} onChange={e => setCardForm({...cardForm, expiryMonth: parseInt(e.target.value)})} className="w-20 bg-white border-none rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary/20 outline-none" />
                      <input type="number" placeholder="سنة" min={2025} value={cardForm.expiryYear} onChange={e => setCardForm({...cardForm, expiryYear: parseInt(e.target.value)})} className="w-24 bg-white border-none rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAddCard} className="flex-1 bg-primary text-on-primary py-2 rounded-lg text-sm font-bold">حفظ</button>
                      <button onClick={() => setShowAddCard(false)} className="flex-1 bg-surface-container-high py-2 rounded-lg text-sm font-bold">إلغاء</button>
                    </div>
                  </div>
                )}

                {paymentMethods.length === 0 && !showAddCard ? (
                  <p className="text-sm text-on-surface-variant text-center py-8">لا توجد بطاقات محفوظة</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {paymentMethods.map(card => (
                      <div key={card._id} className="relative bg-gradient-to-br from-primary to-primary-container text-on-primary p-6 rounded-2xl shadow-lg overflow-hidden">
                        <div className="flex justify-between items-start mb-8">
                          <div className="flex flex-col">
                            <span className="text-xs text-on-primary/70">الرصيد</span>
                            <span className="font-bold text-lg uppercase">{card.cardBrand}</span>
                          </div>
                          <CreditCard className="w-8 h-8 opacity-80" />
                        </div>
                        <div className="text-xl tracking-widest mb-4 font-mono" dir="ltr">
                          •••• •••• •••• {card.lastFourDigits}
                        </div>
                        <div className="flex justify-between items-end text-sm">
                          <div>
                            <div className="text-xs opacity-70">الاسم</div>
                            <div className="font-bold">{card.cardholderName}</div>
                          </div>
                          <div>
                            <div className="text-xs opacity-70">الانتهاء</div>
                            <div className="font-bold" dir="ltr">{String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}</div>
                          </div>
                        </div>
                        <div className="absolute top-4 right-4 flex gap-2">
                          {card.isDefault ? (
                            <span className="text-xs bg-white/20 backdrop-blur px-2 py-1 rounded-full font-bold">افتراضي</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(card._id)}
                              className="text-xs bg-white/10 hover:bg-white/20 backdrop-blur px-2 py-1 rounded-full font-bold"
                            >
                              تعيين كافتراضي
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteCard(card._id)}
                            className="bg-white/10 hover:bg-red-500/40 p-1 rounded-full"
                            aria-label="حذف"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ─── Orders section ─── */}
            <div ref={sectionRefs.orders} id="orders" className="scroll-mt-28">
              <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    سجل الطلبات
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setOrderTab('in_progress'); setCurrentPage(1) }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm ${
                        orderTab === 'in_progress' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      قيد التنفيذ
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOrderTab('history'); setCurrentPage(1) }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm ${
                        orderTab === 'history' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      السجل
                    </button>
                  </div>
                </div>

                {orders.length === 0 ? (
                  <p className="text-sm text-on-surface-variant text-center py-12">لا توجد طلبات</p>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => {
                      const cfg = statusConfig[order.status] || statusConfig.pending
                      return (
                        <div key={order._id} className="bg-surface-container-low rounded-xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <ShoppingBag className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate">{order.serviceId?.name || 'خدمة'}</p>
                            <p className="text-xs text-on-surface-variant">
                              {order.workerId?.firstName} {order.workerId?.lastName} • {formatDate(order.createdAt)}
                            </p>
                          </div>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                          {order.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => setCancellingOrder(order)}
                              className="text-red-600 text-xs font-bold hover:underline"
                            >
                              إلغاء
                            </button>
                          )}
                          {order.status === 'completed' && !order.review && (
                            <button
                              type="button"
                              onClick={() => setReviewingOrder(order)}
                              className="text-primary text-xs font-bold hover:underline flex items-center gap-1"
                            >
                              <Star className="w-3 h-3" />
                              قيّم
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {pagination.pages > 1 && (
                  <div className="mt-6 flex justify-center items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low disabled:opacity-30"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-on-surface-variant">{currentPage} / {pagination.pages}</span>
                    <button
                      onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
                      disabled={currentPage === pagination.pages}
                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-low disabled:opacity-30"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </section>
            </div>

            {/* ─── Settings section ─── */}
            <div ref={sectionRefs.settings} id="settings" className="scroll-mt-28">
              <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary" />
                  إعدادات الحساب
                </h2>

                
                <Link
                  href="/profile/edit"
                  className="inline-flex items-center gap-2 bg-primary/5 text-primary px-4 py-3 rounded-xl font-bold hover:bg-primary/10"
                >
                  <Pencil className="w-4 h-4" />
                  تعديل الملف الشخصي الكامل (الصورة، السيرة الذاتية...)
                </Link>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Address picker modal — Leaflet bundle is lazy-loaded inside */}
      <AddressPicker
        open={pickerOpen && !!addressDraft}
        initial={
          addressDraft && typeof addressDraft.lat === 'number' && typeof addressDraft.lng === 'number'
            ? { lat: addressDraft.lat, lng: addressDraft.lng }
            : null
        }
        onConfirm={handlePickerConfirm}
        onClose={() => setPickerOpen(false)}
      />

      {/* Modals — preserved from previous version */}
      {cancellingOrder && (
        <CancelOrderModal
          orderId={cancellingOrder._id}
          orderStatus={cancellingOrder.status as 'pending' | 'accepted' | 'in_progress'}
          serviceName={cancellingOrder.serviceId?.name}
          onClose={() => setCancellingOrder(null)}
          onDone={() => {
            setCancellingOrder(null)
            const params = new URLSearchParams({ status: orderTab, page: String(currentPage), limit: '10' })
            api.getWithAuth(`/customer/orders?${params.toString()}`).then(d => {
              setOrders(d.orders)
              setPagination(d.pagination)
            })
          }}
        />
      )}
      {reviewingOrder && (
        <ReviewOrderModal
          orderId={reviewingOrder._id}
          serviceName={reviewingOrder.serviceId?.name}
          workerName={reviewingOrder.workerId
            ? `${reviewingOrder.workerId.firstName || ''} ${reviewingOrder.workerId.lastName || ''}`.trim()
            : undefined}
          onClose={() => setReviewingOrder(null)}
          onDone={() => {
            setReviewingOrder(null)
            const params = new URLSearchParams({ status: orderTab, page: String(currentPage), limit: '10' })
            api.getWithAuth(`/customer/orders?${params.toString()}`).then(d => {
              setOrders(d.orders)
              setPagination(d.pagination)
            })
          }}
        />
      )}
    </div>
  )
}
