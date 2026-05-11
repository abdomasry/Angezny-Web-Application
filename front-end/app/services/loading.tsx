import { Skeleton } from '@/components/ui/skeleton'
import ServiceGridSkeleton from '@/components/skeletons/ServiceGridSkeleton'

export default function ServicesLoading() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="flex gap-3 mb-6 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
        ))}
      </div>
      <ServiceGridSkeleton />
    </div>
  )
}
