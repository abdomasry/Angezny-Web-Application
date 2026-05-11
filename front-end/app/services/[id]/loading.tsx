import { Skeleton } from '@/components/ui/skeleton'

export default function ServiceDetailLoading() {
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <Skeleton className="aspect-[16/9] w-full rounded-2xl mb-6" />
      <Skeleton className="h-9 w-2/3 mb-3" />
      <Skeleton className="h-5 w-1/3 mb-6" />
      <div className="space-y-3 mb-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  )
}
