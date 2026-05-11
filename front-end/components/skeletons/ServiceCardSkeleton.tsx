import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the shape of a service card in the listing/search grids: square
// thumbnail on top, title + meta + rating + price stacked below. Keeping the
// same dimensions prevents layout shift when real cards replace skeletons.
export default function ServiceCardSkeleton() {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  )
}
