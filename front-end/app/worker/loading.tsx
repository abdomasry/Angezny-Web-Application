import { Skeleton } from '@/components/ui/skeleton'
import ServiceGridSkeleton from '@/components/skeletons/ServiceGridSkeleton'

export default function WorkerLoading() {
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Skeleton className="h-20 w-20 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      <Skeleton className="h-5 w-32 mb-3" />
      <div className="space-y-2 mb-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>

      <Skeleton className="h-6 w-40 mb-4" />
      <ServiceGridSkeleton count={4} />
    </div>
  )
}
