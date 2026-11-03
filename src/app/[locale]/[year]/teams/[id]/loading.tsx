import { ListSkeleton, SkeletonPage, TableSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-4 w-24" />
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-4">
        <Skeleton className="size-14 rounded-lg" />
        <div>
          <Skeleton className="mb-2 h-10 w-56" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <Skeleton className="mb-3 h-8 w-32" />
          <TableSkeleton rows={6} cols={4} />
        </section>
        <section className="min-w-0">
          <Skeleton className="mb-3 h-8 w-32" />
          <ListSkeleton rows={4} />
        </section>
      </div>
    </SkeletonPage>
  );
}
