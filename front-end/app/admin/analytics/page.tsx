'use client'
// Admin Analytics page.

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import {
  fetchAnalytics,
  type AnalyticsRange,
  type OverviewData,
  type TrendPoint,
  type StatusRow,
  type CategoryRow,
  type ServiceRow,
  type WorkerRow,
  type CustomerRow,
  type GovernorateRow,
  type CityRow,
  type GapRow,
  type RetentionData,
  type RevenueSplit,
  type PaymentMethodRow,
  type RefundRateData,
  type CouponSummary,
  type SearchTermRow,
  type ReportCategoryRow,
  type CompletionTimeRow,
  type CancellationReasonRow,
} from '@/lib/api/adminAnalytics'

import FilterBar from '@/components/admin/analytics/FilterBar'
import KpiCard from '@/components/admin/analytics/KpiCard'
import RankedTable from '@/components/admin/analytics/RankedTable'
import TrendChart from '@/components/admin/analytics/TrendChart'
import BreakdownChart from '@/components/admin/analytics/BreakdownChart'
import BarRanking from '@/components/admin/analytics/BarRanking'

import {
  Receipt,
  DollarSign,
  CheckCircle2,
  XCircle,
  Wallet,
  ArrowLeft,
  TrendingUp,
  MapPin,
  Users,
  Megaphone,
} from 'lucide-react'

const TABS = [
  { key: 'orders', label: 'الطلبات والفئات', icon: TrendingUp },
  { key: 'geography', label: 'الجغرافيا', icon: MapPin },
  { key: 'customers', label: 'العملاء والإيرادات', icon: Users },
  { key: 'marketing', label: 'التسويق والجودة', icon: Megaphone },
] as const

type TabKey = (typeof TABS)[number]['key']

// Arabic labels for order status (mirrors the main admin page).
const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الانتظار',
  accepted: 'مقبول',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
}

const PAYMENT_LABEL: Record<string, string> = {
  cash_on_delivery: 'دفع عند الاستلام',
  card: 'بطاقة',
}

// Egyptian-pound formatter. Used for revenue / earnings / spend cells.
const fmtEGP = (n: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(n || 0)

const fmtNum = (n: number) => new Intl.NumberFormat('ar-EG').format(n || 0)
const fmtPct = (n: number) => `${((n || 0) * 100).toFixed(1)}%`

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()

  // Range comes from the URL so refresh / share preserves the filter.
  const range = (searchParams.get('range') as AnalyticsRange) || '30d'
  const tab = (searchParams.get('tab') as TabKey) || 'orders'

  // Auth gate: bounce non-admins. Same pattern as /admin main page.
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
    } else if (user.role !== 'admin') {
      router.replace('/')
    }
  }, [user, authLoading, router])

  if (authLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-on-surface-variant">جاري التحميل…</div>
      </div>
    )
  }

  const setTab = (next: TabKey) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', next)
    router.replace(`/admin/analytics?${p.toString()}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="p-8 pt-24 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">التحليلات والإحصائيات</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              نظرة شاملة على أداء المنصة
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة إلى لوحة الإدارة
          </Link>
        </div>

        <FilterBar range={range} />

        {/* KPI cards (always visible) */}
        <OverviewSection range={range} />

        {/* Tabs */}
        <div className="flex gap-2 mt-8 mb-6 border-b border-outline-variant/15">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'orders' && <OrdersTab range={range} />}
        {tab === 'geography' && <GeographyTab range={range} />}
        {tab === 'customers' && <CustomersTab range={range} />}
        {tab === 'marketing' && <MarketingTab range={range} />}
      </main>
    </div>
  )
}

// ─── Section: Overview KPIs ─────────────────────────────────────────────

function OverviewSection({ range }: { range: AnalyticsRange }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    fetchAnalytics<OverviewData>('/overview', range)
      .then(setData)
      .catch((e) => setError(e?.message || 'حدث خطأ'))
  }, [range])

  if (error) {
    return <div className="text-sm text-red-600 mb-4">تعذر تحميل البطاقات: {error}</div>
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard
        label="إجمالي الطلبات"
        value={fmtNum(data?.totalOrders ?? 0)}
        icon={Receipt}
      />
      <KpiCard
        label="الإيرادات"
        value={fmtEGP(data?.revenue ?? 0)}
        icon={DollarSign}
        tone="success"
      />
      <KpiCard
        label="مكتملة"
        value={fmtNum(data?.completed ?? 0)}
        icon={CheckCircle2}
        tone="success"
      />
      <KpiCard
        label="نسبة الإلغاء"
        value={fmtPct(data?.cancellationRate ?? 0)}
        icon={XCircle}
        tone={data && data.cancellationRate > 0.2 ? 'danger' : 'warning'}
      />
      <KpiCard
        label="متوسط قيمة الطلب"
        value={fmtEGP(data?.avgOrderValue ?? 0)}
        icon={Wallet}
      />
    </div>
  )
}

// ─── Tab: Orders, Categories & Workers ──────────────────────────────────

function OrdersTab({ range }: { range: AnalyticsRange }) {
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [status, setStatus] = useState<StatusRow[]>([])
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [reasons, setReasons] = useState<CancellationReasonRow[]>([])

  useEffect(() => {
    Promise.all([
      fetchAnalytics<TrendPoint[]>('/orders-trend', range).then(setTrend).catch(() => {}),
      fetchAnalytics<StatusRow[]>('/orders-status', range).then(setStatus).catch(() => {}),
      fetchAnalytics<CategoryRow[]>('/top-categories', range).then(setCats).catch(() => {}),
      fetchAnalytics<ServiceRow[]>('/top-services', range).then(setServices).catch(() => {}),
      fetchAnalytics<WorkerRow[]>('/top-workers', range).then(setWorkers).catch(() => {}),
      fetchAnalytics<CancellationReasonRow[]>('/cancellation-reasons', range)
        .then(setReasons)
        .catch(() => {}),
    ])
  }, [range])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <TrendChart title="الطلبات عبر الزمن" data={trend} dataKey="count" />
      </div>
      <BreakdownChart
        title="حالات الطلبات"
        data={status.map((s) => ({ name: STATUS_LABEL[s.status] || s.status, value: s.count }))}
        donut
      />

      <div className="lg:col-span-2">
        <RankedTable
          title="الفئات الأكثر طلباً"
          rows={cats}
          columns={[
            { key: 'name', label: 'الفئة' },
            { key: 'orderCount', label: 'عدد الطلبات', align: 'end', render: (r) => fmtNum(r.orderCount) },
            { key: 'revenue', label: 'الإيرادات', align: 'end', render: (r) => fmtEGP(r.revenue) },
          ]}
        />
      </div>
      <RankedTable
        title="أكثر أسباب الإلغاء"
        rows={reasons}
        columns={[
          { key: 'reason', label: 'السبب' },
          { key: 'count', label: 'العدد', align: 'end', render: (r) => fmtNum(r.count) },
        ]}
      />

      <div className="lg:col-span-3">
        <RankedTable
          title="أفضل الخدمات"
          rows={services}
          columns={[
            { key: 'name', label: 'الخدمة' },
            { key: 'orderCount', label: 'الطلبات', align: 'end', render: (r) => fmtNum(r.orderCount) },
            { key: 'revenue', label: 'الإيرادات', align: 'end', render: (r) => fmtEGP(r.revenue) },
          ]}
        />
      </div>

      <div className="lg:col-span-3">
        <RankedTable
          title="أفضل العمال (Bestsellers)"
          rows={workers}
          columns={[
            { key: 'name', label: 'العامل' },
            {
              key: 'completedOrders',
              label: 'طلبات مكتملة',
              align: 'end',
              render: (r) => fmtNum(r.completedOrders),
            },
            { key: 'earnings', label: 'الأرباح', align: 'end', render: (r) => fmtEGP(r.earnings) },
            {
              key: 'rating',
              label: 'التقييم',
              align: 'end',
              render: (r) => `${r.rating?.toFixed(1) ?? '0.0'} ⭐ (${r.totalReviews})`,
            },
          ]}
        />
      </div>
    </div>
  )
}

// ─── Tab: Geography ─────────────────────────────────────────────────────

function GeographyTab({ range }: { range: AnalyticsRange }) {
  const [govs, setGovs] = useState<GovernorateRow[]>([])
  const [cities, setCities] = useState<CityRow[]>([])
  const [gaps, setGaps] = useState<GapRow[]>([])

  useEffect(() => {
    Promise.all([
      fetchAnalytics<GovernorateRow[]>('/orders-by-governorate', range).then(setGovs).catch(() => {}),
      fetchAnalytics<CityRow[]>('/orders-by-city', range).then(setCities).catch(() => {}),
      fetchAnalytics<GapRow[]>('/demand-supply-gap', range).then(setGaps).catch(() => {}),
    ])
  }, [range])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BarRanking
        title="الطلبات حسب المحافظة"
        data={govs.map((g) => ({ name: g.governorate, value: g.orderCount }))}
        color="#3b82f6"
      />
      <RankedTable
        title="أفضل المدن"
        rows={cities}
        columns={[
          { key: 'city', label: 'المدينة' },
          { key: 'orderCount', label: 'الطلبات', align: 'end', render: (r) => fmtNum(r.orderCount) },
        ]}
      />

      <div className="lg:col-span-2">
        <RankedTable
          title="فجوة العرض والطلب (محافظات بأعلى احتياج)"
          rows={gaps}
          columns={[
            { key: 'governorate', label: 'المحافظة' },
            { key: 'orders', label: 'الطلبات', align: 'end', render: (r) => fmtNum(r.orders) },
            { key: 'workers', label: 'عمال نشطون', align: 'end', render: (r) => fmtNum(r.workers) },
            {
              key: 'gap',
              label: 'الفرق',
              align: 'end',
              render: (r) => (
                <span className={r.gap > 0 ? 'text-amber-600 font-semibold' : 'text-on-surface-variant'}>
                  {fmtNum(r.gap)}
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}

// ─── Tab: Customers & Revenue ───────────────────────────────────────────

function CustomersTab({ range }: { range: AnalyticsRange }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [retention, setRetention] = useState<RetentionData | null>(null)
  const [revenueTrend, setRevenueTrend] = useState<TrendPoint[]>([])
  const [split, setSplit] = useState<RevenueSplit | null>(null)
  const [pms, setPms] = useState<PaymentMethodRow[]>([])
  const [refund, setRefund] = useState<RefundRateData | null>(null)

  useEffect(() => {
    Promise.all([
      fetchAnalytics<CustomerRow[]>('/top-customers', range).then(setCustomers).catch(() => {}),
      fetchAnalytics<RetentionData>('/customer-retention', range).then(setRetention).catch(() => {}),
      fetchAnalytics<TrendPoint[]>('/revenue-trend', range).then(setRevenueTrend).catch(() => {}),
      fetchAnalytics<RevenueSplit>('/revenue-split', range).then(setSplit).catch(() => {}),
      fetchAnalytics<PaymentMethodRow[]>('/payment-methods', range).then(setPms).catch(() => {}),
      fetchAnalytics<RefundRateData>('/refund-rate', range).then(setRefund).catch(() => {}),
    ])
  }, [range])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <TrendChart
          title="الإيرادات عبر الزمن"
          data={revenueTrend}
          dataKey="revenue"
          color="#10b981"
        />
      </div>
      <BreakdownChart
        title="عملاء جدد مقابل عائدين"
        data={[
          { name: 'جدد', value: retention?.new ?? 0 },
          { name: 'عائدون', value: retention?.returning ?? 0 },
        ]}
        donut
      />

      <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
        <h3 className="font-semibold text-on-surface mb-4">توزيع الإيرادات</h3>
        {split && split.total > 0 ? (
          <div className="space-y-3 text-sm">
            <Row label="إجمالي" value={fmtEGP(split.total)} />
            <Row label="حصة المنصة" value={fmtEGP(split.platformFee)} />
            <Row label="أرباح العمال" value={fmtEGP(split.workerEarnings)} />
          </div>
        ) : (
          <div className="text-on-surface-variant text-sm py-6 text-center">لا توجد بيانات</div>
        )}
      </div>

      <BreakdownChart
        title="طرق الدفع"
        data={pms.map((p) => ({ name: PAYMENT_LABEL[p.mode] || p.mode, value: p.count }))}
      />

      <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
        <h3 className="font-semibold text-on-surface mb-4">نسبة المرتجعات</h3>
        {refund ? (
          <div className="space-y-3 text-sm">
            <Row label="مكتمل" value={fmtNum(refund.completed)} />
            <Row label="مرتجع" value={fmtNum(refund.refunded)} />
            <Row
              label="النسبة"
              value={fmtPct(refund.rate)}
              tone={refund.rate > 0.05 ? 'danger' : 'default'}
            />
          </div>
        ) : (
          <div className="text-on-surface-variant text-sm py-6 text-center">لا توجد بيانات</div>
        )}
      </div>

      <div className="lg:col-span-3">
        <RankedTable
          title="أفضل العملاء"
          rows={customers}
          columns={[
            { key: 'name', label: 'العميل' },
            { key: 'orderCount', label: 'الطلبات', align: 'end', render: (r) => fmtNum(r.orderCount) },
            { key: 'spend', label: 'الإنفاق', align: 'end', render: (r) => fmtEGP(r.spend) },
          ]}
        />
      </div>
    </div>
  )
}

// ─── Tab: Marketing & Quality ───────────────────────────────────────────

function MarketingTab({ range }: { range: AnalyticsRange }) {
  const [coupons, setCoupons] = useState<CouponSummary | null>(null)
  const [terms, setTerms] = useState<SearchTermRow[]>([])
  const [reports, setReports] = useState<ReportCategoryRow[]>([])
  const [completion, setCompletion] = useState<CompletionTimeRow[]>([])

  useEffect(() => {
    Promise.all([
      fetchAnalytics<CouponSummary>('/coupons', range).then(setCoupons).catch(() => {}),
      fetchAnalytics<SearchTermRow[]>('/top-search-terms', range).then(setTerms).catch(() => {}),
      fetchAnalytics<ReportCategoryRow[]>('/reports-by-category', range).then(setReports).catch(() => {}),
      fetchAnalytics<CompletionTimeRow[]>('/avg-completion-time', range).then(setCompletion).catch(() => {}),
    ])
  }, [range])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl p-5 border border-outline-variant/15">
        <h3 className="font-semibold text-on-surface mb-4">ملخص أكواد الخصم</h3>
        {coupons ? (
          <div className="space-y-2 text-sm mb-4">
            <Row label="الأكواد النشطة" value={fmtNum(coupons.totals.activeCount)} />
            <Row label="إجمالي الاستخدامات" value={fmtNum(coupons.totals.totalUses)} />
            <Row label="الإيرادات الناتجة" value={fmtEGP(coupons.totals.totalRevenue)} />
          </div>
        ) : (
          <div className="text-on-surface-variant text-sm py-6 text-center">لا توجد بيانات</div>
        )}
      </div>

      <RankedTable
        title="أكثر الكلمات بحثاً"
        rows={terms}
        columns={[
          { key: 'query', label: 'الكلمة' },
          { key: 'count', label: 'مرات البحث', align: 'end', render: (r) => fmtNum(r.count) },
        ]}
      />

      {coupons && coupons.top.length > 0 && (
        <div className="lg:col-span-2">
          <RankedTable
            title="أفضل الكوبونات"
            rows={coupons.top}
            columns={[
              { key: 'code', label: 'الكود' },
              { key: 'currentUses', label: 'الاستخدامات', align: 'end', render: (r) => fmtNum(r.currentUses) },
              { key: 'revenueGenerated', label: 'الإيرادات', align: 'end', render: (r) => fmtEGP(r.revenueGenerated) },
              { key: 'status', label: 'الحالة', align: 'end' },
            ]}
          />
        </div>
      )}

      <BarRanking
        title="البلاغات حسب الفئة"
        data={reports.map((r) => ({ name: r.name, value: r.count }))}
        color="#ef4444"
      />
      <BarRanking
        title="متوسط زمن الإنجاز (دقائق) حسب الفئة"
        data={completion.map((r) => ({ name: r.name, value: r.avgMinutes }))}
        color="#8b5cf6"
      />
    </div>
  )
}

// Small label/value row used inside text-only cards (revenue split, refund).
function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/10 last:border-0 pb-2 last:pb-0">
      <span className="text-on-surface-variant">{label}</span>
      <span className={`font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-on-surface'}`}>
        {value}
      </span>
    </div>
  )
}
