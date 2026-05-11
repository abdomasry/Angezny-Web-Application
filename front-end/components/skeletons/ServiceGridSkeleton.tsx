import ServiceCardSkeleton from './ServiceCardSkeleton'

// Default of 8 placeholder cards — enough to fill the visible viewport on
// desktop without overshooting on mobile, where the grid collapses to one
// column and only ~3 are visible above the fold anyway.
export default function ServiceGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ServiceCardSkeleton key={i} />
      ))}
    </div>
  )
}
