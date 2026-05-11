// Thin wrapper over `api.getWithAuth` for the admin analytics endpoints.
// Each call returns the unwrapped `data` payload so consumers don't have
// to keep destructuring `{ data }`.
//
// All endpoints accept the same `range` query param. We centralize that
// here so the page only passes `range` once and every endpoint stays in
// sync without each component re-implementing the query string.

import { api } from "@/lib/api";

export type AnalyticsRange = "today" | "7d" | "30d" | "90d" | "all";

export async function fetchAnalytics<T>(
  path: string,
  range: AnalyticsRange,
): Promise<T> {
  const res = await api.getWithAuth(
    `/admin/analytics${path}?range=${encodeURIComponent(range)}`,
  );
  return res.data as T;
}

// Response shapes used across the dashboard. Keeping them here means any
// schema change in the controller is fixed in one place.

export interface OverviewData {
  totalOrders: number;
  completed: number;
  cancelled: number;
  cancellationRate: number;
  avgOrderValue: number;
  revenue: number;
}

export interface TrendPoint {
  date: string;
  count?: number;
  revenue?: number;
}

export interface StatusRow {
  status: string;
  count: number;
}

export interface CategoryRow {
  categoryId: string;
  name: string;
  orderCount: number;
  revenue: number;
}

export interface ServiceRow {
  serviceId: string;
  name: string;
  price?: number;
  orderCount: number;
  revenue: number;
}

export interface WorkerRow {
  workerId: string;
  name: string;
  rating: number;
  totalReviews: number;
  completedOrders: number;
  earnings: number;
}

export interface CustomerRow {
  customerId: string;
  name: string;
  orderCount: number;
  spend: number;
}

export interface GovernorateRow {
  governorate: string;
  orderCount: number;
  revenue: number;
}

export interface CityRow {
  city: string;
  orderCount: number;
}

export interface GapRow {
  governorate: string;
  orders: number;
  workers: number;
  gap: number;
}

export interface RetentionData {
  new: number;
  returning: number;
}

export interface RevenueSplit {
  platformFee: number;
  workerEarnings: number;
  total: number;
}

export interface PaymentMethodRow {
  mode: string;
  count: number;
}

export interface RefundRateData {
  completed: number;
  refunded: number;
  rate: number;
}

export interface CouponSummary {
  totals: {
    totalUses: number;
    totalRevenue: number;
    activeCount: number;
  };
  top: Array<{
    code: string;
    description?: string;
    currentUses: number;
    maxUses: number;
    revenueGenerated: number;
    discountType: "percentage" | "fixed";
    discountValue: number;
    status: "active" | "paused";
    expiresAt: string;
  }>;
}

export interface SearchTermRow {
  query: string;
  count: number;
}

export interface ReportCategoryRow {
  name: string;
  count: number;
}

export interface CompletionTimeRow {
  name: string;
  avgMinutes: number;
  count: number;
}

export interface CancellationReasonRow {
  reason: string;
  count: number;
}
