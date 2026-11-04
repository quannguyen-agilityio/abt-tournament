import { ListSkeleton, SkeletonPage, TableSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <section className="mb-8">
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-14 w-72 max-w-full sm:h-16" />
        <div className="border-border mt-5 h-1.5 max-w-md border-y" />
      </section>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 md:grid-cols-2">
            <ListSkeleton rows={3} />
            <ListSkeleton rows={3} />
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <Skeleton className="h-8 w-40" />
          <TableSkeleton rows={6} cols={4} />
        </aside>
      </div>
    </SkeletonPage>
  );
}
