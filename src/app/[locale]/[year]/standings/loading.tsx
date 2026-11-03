import { SkeletonPage, TableSkeleton, TitleSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <TableSkeleton rows={8} cols={8} />
      <div className="mt-6 grid max-w-3xl gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </SkeletonPage>
  );
}
