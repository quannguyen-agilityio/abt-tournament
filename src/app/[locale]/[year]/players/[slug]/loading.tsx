import { ListSkeleton, SkeletonPage, TableSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-4 w-24" />
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div>
          <Skeleton className="mb-2 h-10 w-56" />
          <Skeleton className="h-5 w-48" />
        </div>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-[10px]" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <Skeleton className="mb-3 h-8 w-40" />
          <TableSkeleton rows={6} cols={5} />
        </section>
        <section className="min-w-0">
          <Skeleton className="mb-3 h-8 w-32" />
          <ListSkeleton rows={3} />
        </section>
      </div>
    </SkeletonPage>
  );
}
