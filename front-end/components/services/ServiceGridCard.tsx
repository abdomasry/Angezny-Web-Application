'use client'

// Flat service card for the "services-only" view on /services. Renders a
// vertical card (image on top, body below) with the service info plus a
// compact provider strip (name + rating). Reuses the same "اسأل" / "اطلب"
// handlers as the providers view so behaviour is identical.

import Link from 'next/link'
import { Star, MessageCircleQuestion, ShoppingBag, BadgeCheck } from 'lucide-react'
import type { WorkerProfile, WorkerService } from '@/lib/types'

interface Props {
  service: WorkerService
  worker: WorkerProfile
  onAsk: (service: WorkerService, worker: WorkerProfile) => void
  onOrder: (service: WorkerService) => void
  formatPrice: (s: WorkerService) => string
}

export default function ServiceGridCard({ service, worker, onAsk, onOrder, formatPrice }: Props) {
  const image = service.images?.[0]
  // Custom-priced services are "ask only" — they can't be ordered directly
  // from the catalog. The price label is "سعر مخصص" and the order button
  // is hidden, leaving just the ask CTA that opens chat with the worker.
  const isCustom = service.typeofService === 'custom'
  return (
    <article className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[0_24px_24px_-16px_rgba(18,28,42,0.06)] hover:shadow-[0_32px_40px_-16px_rgba(18,28,42,0.1)] transition-shadow flex flex-col">
      {/* Image */}
      <Link href={`/services/${service._id}`} className="block aspect-[4/3] bg-surface-container-high relative overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={service.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary-container/30 flex items-center justify-center text-primary font-black text-5xl">
            {service.name?.charAt(0) || '?'}
          </div>
        )}
      </Link>

      {/* Body */}
      <div className="flex-1 p-4 flex flex-col text-right">
        <Link
          href={`/services/${service._id}`}
          className="text-base font-bold text-on-surface hover:text-primary transition-colors line-clamp-2 mb-1"
        >
          {service.name}
        </Link>
        {service.description && (
          <p className="text-xs text-on-surface-variant line-clamp-2 mb-3">{service.description}</p>
        )}

        {/* Provider strip — name + rating belong to the worker per spec */}
        <Link
          href={`/worker/${worker._id}`}
          className="flex items-center gap-2 text-xs text-on-surface-variant hover:text-primary mb-3 group"
        >
          <div className="w-6 h-6 rounded-full bg-primary-container/40 overflow-hidden shrink-0 flex items-center justify-center text-primary font-bold text-[10px]">
            {worker.userId?.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={worker.userId.profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              worker.userId?.firstName?.charAt(0) || '?'
            )}
          </div>
          <span className="truncate group-hover:underline">
            {worker.userId?.firstName} {worker.userId?.lastName}
          </span>
          <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="flex items-center gap-0.5 ms-auto">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="font-bold text-on-surface">
              {worker.ratingAverage?.toFixed(1) || '0.0'}
            </span>
            <span>({worker.totalReviews || 0})</span>
          </span>
        </Link>

        {/* Price + actions */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-sm font-black text-on-surface">
            {isCustom ? 'سعر مخصص' : formatPrice(service)}
          </span>
          <div className="flex items-center gap-1">
            {isCustom ? (
              <button
                type="button"
                onClick={() => onAsk(service, worker)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
              >
                <MessageCircleQuestion className="w-3.5 h-3.5" />
                <span>اسأل</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onAsk(service, worker)}
                  title="استفسر عن هذه الخدمة"
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <MessageCircleQuestion className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOrder(service)}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>اطلب</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
