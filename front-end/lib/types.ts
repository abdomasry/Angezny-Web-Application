// User type — matches what the backend sends from toPublicJSON()
export interface User {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  profileImage?: string
  role: 'customer' | 'worker' | 'admin' // union type — can ONLY be one of these 3 values
}

// ─── Chat types ────────────────────────────────────────────────
// Mirror what /api/chat/* endpoints and Socket.IO events return.

// Minimal user shape embedded in a conversation row.
export interface ChatParticipant {
  _id: string
  firstName: string
  lastName: string
  profileImage?: string
  role?: 'customer' | 'worker' | 'admin'
}

export interface ChatConversation {
  _id: string
  otherUser: ChatParticipant | null
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface ChatMessage {
  _id: string
  conversationId: string
  senderId: string
  message: string   // text content, or URL for image/file messages
  messageType: 'text' | 'image' | 'file'
  fileName?: string | null  // only for image/file types
  fileSize?: number | null  // bytes, only for image/file types
  isRead: boolean
  createdAt: string
}

// Category — matches the Category MongoDB model
export interface Category {
  _id: string        // MongoDB auto-generates this ID
  name: string
  description?: string
  image?: string
  isActive: boolean
  serviceCount?: number  // Only present when fetched with ?withCounts=true
}

// WorkerProfile — the main worker listing data
// Notice the nested objects — these are "populated" fields from other collections
export interface WorkerProfile {
  _id: string
  userId: {          // Populated from User model
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
    bio?: string          // surfaced on the "عن المزود" tab
    createdAt?: string    // member-since
  }
  Category?: {       // Populated from Category model (capital C matches the model field)
    _id: string
    name: string
    image?: string
  }
  priceRange?: { min: number; max: number }
  availability: Array<{ day: string; from: string; to: string }>
  skills: string[]
  ratingAverage: number
  totalReviews: number
  verificationStatus: string
  // Geo-aware location. `point.coordinates` is [lng, lat] (GeoJSON order)
  // and is missing for workers who haven't set it yet.
  location?: {
    address?: string
    city?: string
    point?: {
      type?: 'Point'
      coordinates?: [number, number]
    }
  }
  // Only present when the listing was fetched with lat/lng — distance from
  // the user in km, rounded to 1 decimal. Used by the "Nearest" tab card.
  distanceKm?: number
  // Raw distance in meters (unrounded). Used as the geo-pagination cursor
  // — preserves precision so "load more" doesn't accidentally skip or
  // duplicate items at page boundaries.
  distanceMeters?: number
  typeOfWorker?: 'individual' | 'company'
  services: WorkerService[]
  portfolio?: PortfolioItem[]
  // title doubles as the worker's tagline/quote on the new public profile.
  title?: string
  packages?: Array<{
    title?: string
    description?: string
    price?: number
    features?: string[]
  }>
  license?: {
    name?: string
    number?: string
    fileUrl?: string
    status?: 'not_submitted' | 'pending' | 'approved' | 'rejected'
    rejectionReason?: string
  }
  // Multi-license / training-cert flow. Each entry goes pending → admin
  // approves or rejects → worker decides whether to surface it (`active`).
  licenses?: WorkerLicense[]
  // ─── new in 2026-04-26 enhanced-worker-profile ─────────────
  rank?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  completedOrdersCount?: number
  workingHours?: Array<{
    day: 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
    from: string
    to: string
    enabled: boolean
  }>
  publicStats?: {
    completedOrders: number
    historicalOrders: number
    successRate: number
    startingPrice: number
  }
}

// One credential the worker submits for admin review.
// Multiple per worker — training certs, professional licenses, safety, etc.
// `active` is worker-controlled (only meaningful when status === "approved").
export interface WorkerLicense {
  _id: string
  name: string
  number?: string
  fileUrl: string
  issuedBy?: string
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  active: boolean
  submittedAt?: string
  reviewedAt?: string
}

// WorkerService — individual service a worker offers
export interface WorkerService {
  _id: string
  name: string
  description?: string
  images?: string[]
  price: number
  typeofService: 'hourly' | 'fixed' | 'range'
  priceRange?: { min?: number; max?: number; custom?: string }
  active: boolean
  // Sometimes categoryId is a raw id string (worker dashboard), sometimes
  // it's the populated { _id, name } object (public worker profile + /services).
  // Both shapes come straight from the backend based on which endpoint served
  // the service, so the type has to allow both.
  categoryId?: string | { _id: string; name: string }
  // Approval workflow fields — every new service starts as "pending" until admin reviews it
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  // If the admin rejects a service, they can provide a reason so the worker knows what to fix
  rejectionReason?: string
}

// Pagination info returned by paginated endpoints
export interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number  // Total number of pages (Math.ceil(total / limit))
}

// Notification preferences — per-category toggles
export interface NotificationPreferences {
  orders: boolean
  messages: boolean
  promotions: boolean
}

// Customer profile — merged data from User + CustomerProfile models
export interface CustomerProfileData {
  _id: string
  userId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  profileImage?: string
  role: string
  bio?: string
  location?: {
    city?: string
    area?: string
  }
  numberOfOrders: number
  memberSince: string
  status: string
  isVerified?: boolean  // Whether the user has verified their email. Phone-only users are unverified.
  notificationPreferences?: NotificationPreferences
  // ─── Enhanced profile additions ─────────────────────────────
  addresses?: Array<{
    _id?: string
    label: string
    addressLine: string
    city?: string
    area?: string
    isPrimary?: boolean
    // Optional GeoJSON pin set from the in-form map picker.
    // coordinates is [lng, lat]. Absent on legacy addresses.
    point?: {
      type?: 'Point'
      coordinates?: [number, number]
    }
  }>
  favoriteCategories?: Array<{
    _id: string
    name: string
    image?: string
  }>
  favoriteWorkers?: Array<{
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
  }>
  ratingAverage?: number
  totalRatings?: number
  preferredLanguage?: 'ar' | 'en'
}

// Service request / order — used in customer order cards
export interface ServiceRequest {
  _id: string
  customerId: string
  workerId?: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
  }
  serviceId?: WorkerService    // populated in /customer/orders and /worker/orders
  categoryId?: {
    _id: string
    name: string
  }
  description?: string
  location?: {
    address?: string
  }
  proposedPrice?: number
  paymentMode?: 'cash_on_delivery' | 'card'
  couponCode?: string | null
  discountAmount?: number
  rejectionReason?: string | null
  // Completion proof uploaded by the worker when flipping the order to
  // completed. Only populated on orders with status === 'completed'.
  completionReport?: {
    details?: string
    images?: string[]
    submittedAt?: string
  }
  // Cancellation request raised by the customer on an accepted/in_progress
  // order. Populated while pending / after the worker responds. Absent on
  // orders that were never subject to a cancel request.
  cancellationRequest?: {
    requestedBy?: 'customer' | 'worker'
    reason?: string
    status?: 'pending' | 'approved' | 'denied'
    requestedAt?: string
    respondedAt?: string
    denialReason?: string
  }
  // The customer's own review (if submitted) — only populated on completed
  // orders by the customer GET /customer/orders endpoint. Used by the UI
  // to decide between "تقييم الخدمة" button vs. showing the submitted rating.
  review?: {
    _id: string
    rating: number
    comment?: string
    createdAt: string
  }
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
  scheduledDate?: string
  completedAt?: string
  cancelledBy?: string
  createdAt: string
}

// Payment method — saved credit/debit card (only last 4 digits stored, never full number)
export interface PaymentMethod {
  _id: string
  cardholderName: string
  lastFourDigits: string
  cardBrand: 'visa' | 'mastercard' | 'meza'
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
}

// Review — a customer's review of a worker (populated customerId)
export interface Review {
  _id: string
  serviceRequestId?: string
  customerId: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
  }
  workerId: string
  rating: number
  comment?: string
  createdAt: string
}

// Portfolio item — from WorkerProfile.portfolio subdocument
export interface PortfolioItem {
  _id?: string
  title?: string
  description?: string
  images: string[]
  completedAt?: string
}

// Worker dashboard stats — aggregated counts for the worker sidebar
export interface WorkerDashboardStats {
  pendingOrders: number
  inProgressOrders: number
  completedOrders: number
  totalEarnings: number
}

// Worker wallet snapshot — returned by GET /api/worker/wallet
export interface WorkerWalletSummary {
  balance: number           // current withdrawable amount
  lifetimeEarnings: number  // cumulative credit ever received
  lifetimeWithdrawn: number // always 0 until withdrawals are real
}

export interface WalletTransaction {
  _id: string
  workerId: string
  type: 'credit' | 'debit'
  amount: number
  source: 'order_completion' | 'withdrawal' | 'adjustment'
  status: 'pending' | 'completed' | 'failed'
  note?: string
  // Populated when source === 'order_completion' (backend populates serviceId).
  relatedOrderId?: {
    _id: string
    serviceId?: string | { _id: string; name?: string }
    scheduledDate?: string
  } | string
  createdAt: string
}

// Service request from worker's perspective — customerId is populated (not workerId)
export interface WorkerServiceRequest {
  _id: string
  customerId: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
  }
  workerId: string
  serviceId?: WorkerService
  categoryId?: {
    _id: string
    name: string
  }
  description?: string
  location?: { address?: string; lat?: number; lng?: number }
  proposedPrice?: number
  paymentMode?: 'cash_on_delivery' | 'card'
  couponCode?: string | null
  discountAmount?: number
  rejectionReason?: string | null
  completionReport?: {
    details?: string
    images?: string[]
    submittedAt?: string
  }
  cancellationRequest?: {
    requestedBy?: 'customer' | 'worker'
    reason?: string
    status?: 'pending' | 'approved' | 'denied'
    requestedAt?: string
    respondedAt?: string
    denialReason?: string
  }
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
  scheduledDate?: string
  completedAt?: string
  createdAt: string
}

// Admin dashboard stats — platform-wide counts
export interface AdminStats {
  totalUsers: number
  activeWorkers: number
  openReports: number
  totalSales: number
  totalCategories: number
}

// User row in admin management table
export interface AdminUser {
  _id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  profileImage?: string
  role: 'customer' | 'worker' | 'admin'
  status: 'active' | 'suspended' | 'banned'
  createdAt: string
}

// Worker verification request
export interface VerificationRequest {
  _id: string
  userId: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
    email?: string
    phone?: string
  }
  verificationStatus: 'pending' | 'approved' | 'rejected'
  documents: Array<{
    type: string
    name: string
    fileUrl: string
    status: string
  }>
  Category?: { _id: string; name: string }
  location?: { address?: string; city?: string }
  createdAt: string
}

// ─── Support tickets ───────────────────────────────────────────

// Shared shape between the initial ticket body and every subsequent reply.
// Same attachment format as chat attachments (Cloudinary URL + metadata)
// so the UI renderer can be shared with MessageThread if needed later.
export interface TicketAttachment {
  url: string
  kind: 'image' | 'file'
  fileName: string
  fileSize: number
}

export interface TicketReply {
  _id?: string
  authorId: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
    role?: 'customer' | 'worker' | 'admin'
  } | string
  authorRole: 'customer' | 'worker' | 'admin'
  message: string
  attachments?: TicketAttachment[]
  createdAt: string
}

export interface SupportTicket {
  _id: string
  userId: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
    role?: 'customer' | 'worker' | 'admin'
  } | string
  type: 'service_issue' | 'user_report' | 'technical' | 'payment_issue' | 'other'
  title: string
  message: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  targetUserId?: { _id: string; firstName: string; lastName: string; role?: string } | string
  targetServiceId?: { _id: string; name?: string } | string
  targetOrderId?: { _id: string; status?: string; proposedPrice?: number } | string
  attachments?: TicketAttachment[]
  replies: TicketReply[]
  lastActivityAt: string
  createdAt: string
}

// Report in admin reports list
export interface AdminReport {
  _id: string
  reportedBy: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
  }
  reportedUser: {
    _id: string
    firstName: string
    lastName: string
    profileImage?: string
  }
  reason: string
  description: string
  status: 'pending' | 'reviewed' | 'resolved'
  createdAt: string
}

export interface FavoriteWorkerCard {
  userId: { _id: string; firstName: string; lastName: string; profileImage?: string }
  profileId: string | null
  title: string
  ratingAverage: number
  totalReviews: number
  completedOrdersCount: number
  rank: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  location: { address?: string; governorate?: string; city?: string } | null
  priceRange: { min?: number; max?: number } | null
}

export interface FavoritesListResponse {
  favorites: FavoriteWorkerCard[]
  ids: string[]
}

export interface CustomerPublicProfile {
  _id: string
  firstName: string
  lastName: string
  profileImage?: string
  createdAt: string
  customerRatingAverage: number
  customerTotalReviews: number
}

export interface CustomerReview {
  _id: string
  serviceRequestId: string
  customerId: string
  workerId: { _id: string; firstName: string; lastName: string; profileImage?: string } | string
  rating: number
  comment?: string
  direction: 'worker_to_customer'
  createdAt: string
}