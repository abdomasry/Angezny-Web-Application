'use client'

// Admin User Details Page — /admin/users/[id]
// Shows full details of a user when admin clicks on them in the users table.
// Admin can suspend/ban/activate the user from this page.

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, MapPin, Calendar, Shield, ShoppingBag, Mail, Phone,
  Bell, BellOff, Star, CheckCircle, XCircle, AlertTriangle, Briefcase,
  User as UserIcon,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

// Status badge styles
const statusStyles: Record<string, { label: string; bg: string; text: string }> = {
  active:    { label: 'نشط',   bg: 'bg-green-50',  text: 'text-green-600' },
  suspended: { label: 'معلق',  bg: 'bg-amber-50',  text: 'text-amber-600' },
  banned:    { label: 'محظور', bg: 'bg-red-50',    text: 'text-red-600' },
}

const roleLabels: Record<string, string> = {
  customer: 'عميل',
  worker: 'مزود خدمة',
  admin: 'مسؤول',
}

const orderStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending:     { label: 'قيد الانتظار', bg: 'bg-amber-50',   text: 'text-amber-600' },
  accepted:    { label: 'مقبول',        bg: 'bg-blue-50',    text: 'text-blue-600' },
  in_progress: { label: 'قيد التنفيذ',  bg: 'bg-primary/10', text: 'text-primary' },
  completed:   { label: 'مكتمل',        bg: 'bg-green-50',   text: 'text-green-600' },
  rejected:    { label: 'مرفوض',        bg: 'bg-red-50',     text: 'text-red-600' },
  cancelled:   { label: 'ملغي',         bg: 'bg-gray-100',   text: 'text-gray-500' },
}

export default function AdminUserDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user: authUser, isLoggedIn, isLoading: authLoading } = useAuth()

  const [userData, setUserData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Auth guard — admin only
  useEffect(() => {
    if (!authLoading && (!isLoggedIn || authUser?.role !== 'admin')) {
      router.push('/')
    }
  }, [authLoading, isLoggedIn, authUser, router])

  // Fetch user details
  useEffect(() => {
    if (!isLoggedIn || authUser?.role !== 'admin') return
    api.getWithAuth(`/admin/users/${params.id}`)
      .then(data => setUserData(data))
      .catch(err => console.error('Failed to load user:', err))
      .finally(() => setLoading(false))
  }, [isLoggedIn, authUser, params.id])

  // Handle status change (suspend/ban/activate)
  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true)
    try {
      await api.putWithAuth(`/admin/users/${params.id}/status`, { status: newStatus })
      setUserData((prev: any) => prev ? { ...prev, user: { ...prev.user, status: newStatus } } : prev)
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 px-6 max-w-5xl mx-auto">
          <div className="space-y-6">
            <div className="h-8 w-48 bg-surface-container-low rounded-lg animate-pulse" />
            <div className="h-48 bg-surface-container-lowest rounded-xl animate-pulse" />
            <div className="grid grid-cols-2 gap-6">
              <div className="h-64 bg-surface-container-lowest rounded-xl animate-pulse" />
              <div className="h-64 bg-surface-container-lowest rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 px-6 max-w-5xl mx-auto text-center py-20">
          <UserIcon className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-on-surface-variant text-lg">لم يتم العثور على المستخدم</p>
          <Link href="/admin" className="text-primary font-bold mt-4 inline-block hover:underline">
            العودة للوحة التحكم
          </Link>
        </div>
      </div>
    )
  }

  const u = userData.user
  const status = statusStyles[u.status] || statusStyles.active
  const roleBg = u.role === 'admin' ? 'bg-primary/10 text-primary' : u.role === 'worker' ? 'bg-blue-50 text-blue-600' : 'bg-surface-container-low text-on-surface-variant'

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-24 px-6 max-w-5xl mx-auto">

        {/* Back button */}
        <Link
          href="/admin"
          className="flex items-center gap-2 text-primary font-semibold mb-6 hover:underline"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للوحة التحكم
        </Link>

        {/* User Header Card */}
        <div className="bg-surface-container-lowest rounded-xl p-8 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)] mb-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            {u.profileImage ? (
              <img src={u.profileImage} alt={u.firstName} className="w-24 h-24 rounded-full object-cover border-4 border-primary-container/20" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center font-bold text-3xl border-4 border-primary-container/20">
                {u.firstName?.charAt(0) || '?'}
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-on-surface">{u.firstName} {u.lastName}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${roleBg}`}>
                  {roleLabels[u.role] || u.role}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant mt-3">
                {u.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4 text-primary" />
                    <span>{u.email}</span>
                  </div>
                )}
                {u.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4 text-primary" />
                    <span dir="ltr">{u.phone}</span>
                  </div>
                )}
                {u.location?.city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span>{u.location.city}{u.location.area ? `، ${u.location.area}` : ''}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>عضو منذ {formatDate(u.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6 pt-6 border-t border-outline-variant/15">
            {u.status === 'active' && (
              <>
                <button
                  onClick={() => handleStatusChange('suspended')}
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl text-sm font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  تعليق الحساب
                </button>
                <button
                  onClick={() => handleStatusChange('banned')}
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  حظر الحساب
                </button>
              </>
            )}
            {u.status === 'suspended' && (
              <>
                <button
                  onClick={() => handleStatusChange('active')}
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl text-sm font-bold bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  تفعيل الحساب
                </button>
                <button
                  onClick={() => handleStatusChange('banned')}
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  حظر الحساب
                </button>
              </>
            )}
            {u.status === 'banned' && (
              <button
                onClick={() => handleStatusChange('active')}
                disabled={actionLoading}
                className="px-6 py-2 rounded-xl text-sm font-bold bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                إلغاء الحظر وتفعيل الحساب
              </button>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Personal Info Card */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-primary" />
              المعلومات الشخصية
            </h3>
            <div className="space-y-4">
              {u.bio && (
                <div>
                  <p className="text-xs text-on-surface-variant mb-1">النبذة</p>
                  <p className="text-sm text-on-surface">{u.bio}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <p className="text-xs text-on-surface-variant">التحقق:</p>
                {u.isVerified ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" /> تم التحقق
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 text-sm">
                    <XCircle className="w-4 h-4" /> لم يتم التحقق
                  </span>
                )}
              </div>
              {u.notificationPreferences && (
                <div>
                  <p className="text-xs text-on-surface-variant mb-2">إعدادات الإشعارات:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${u.notificationPreferences.orders ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      الطلبات {u.notificationPreferences.orders ? '✓' : '✗'}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${u.notificationPreferences.messages ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      الرسائل {u.notificationPreferences.messages ? '✓' : '✗'}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${u.notificationPreferences.promotions ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      العروض {u.notificationPreferences.promotions ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Card */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              الإحصائيات
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">طلبات كعميل</span>
                <span className="font-bold text-on-surface">{userData.orderStats?.asCustomer || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">طلبات كمزود خدمة</span>
                <span className="font-bold text-on-surface">{userData.orderStats?.asWorker || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">تاريخ التسجيل</span>
                <span className="text-sm text-on-surface">{formatDate(u.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">آخر تحديث</span>
                <span className="text-sm text-on-surface">{formatDate(u.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Worker Profile Section (only for workers) */}
        {userData.workerProfile && (
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)] mb-6">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              ملف مزود الخدمة
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-surface-container-low rounded-lg p-3 text-center">
                <p className="text-xs text-on-surface-variant">الفئة</p>
                <p className="font-bold text-sm text-on-surface">{userData.workerProfile.Category?.name || '—'}</p>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 text-center">
                <p className="text-xs text-on-surface-variant">حالة التحقق</p>
                <p className={`font-bold text-sm ${userData.workerProfile.verificationStatus === 'approved' ? 'text-green-600' : userData.workerProfile.verificationStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                  {userData.workerProfile.verificationStatus === 'approved' ? 'معتمد' : userData.workerProfile.verificationStatus === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                </p>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 text-center">
                <p className="text-xs text-on-surface-variant">التقييم</p>
                <p className="font-bold text-sm text-on-surface flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  {userData.workerProfile.ratingAverage?.toFixed(1) || '0.0'}
                </p>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 text-center">
                <p className="text-xs text-on-surface-variant">المراجعات</p>
                <p className="font-bold text-sm text-on-surface">{userData.workerProfile.totalReviews || 0}</p>
              </div>
            </div>

            {/* Worker Services */}
            {userData.workerProfile.services?.length > 0 && (
              <div>
                <p className="text-sm font-bold text-on-surface-variant mb-2">الخدمات:</p>
                <div className="space-y-2">
                  {userData.workerProfile.services.map((s: any) => (
                    <div key={s._id} className="flex items-center justify-between bg-surface-container-low rounded-lg p-3">
                      <span className="text-sm text-on-surface overflow-hidden text-ellipsis">{s.description || 'خدمة'}</span>
                      <span className="text-sm font-bold text-primary">{s.price} ج.م</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Orders */}
        {userData.recentOrders?.length > 0 && (
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[24px_0_24px_-12px_rgba(18,28,42,0.04)]">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              آخر الطلبات
            </h3>
            <div className="space-y-3">
              {userData.recentOrders.map((order: any) => {
                const badge = orderStatusConfig[order.status] || orderStatusConfig.pending
                return (
                  <div key={order._id} className="flex items-center justify-between bg-surface-container-low rounded-xl p-4">
                    <div>
                      <p className="font-bold text-sm text-on-surface">
                        {order.categoryId?.name || 'خدمة عامة'}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {order.description ? order.description.substring(0, 60) + '...' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {order.proposedPrice && (
                        <span className="text-sm font-bold text-primary">{order.proposedPrice} ج.م</span>
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}