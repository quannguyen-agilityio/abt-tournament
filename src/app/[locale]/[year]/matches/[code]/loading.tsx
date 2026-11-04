import { ListSkeleton, SkeletonPage } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="ml-auto h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Skeleton className="h-8 w-40 max-w-full" />
        <Skeleton className="col-span-2 row-start-2 mx-auto h-14 w-32 sm:col-span-1 sm:row-start-auto" />
        <Skeleton className="ml-auto h-8 w-40 max-w-full" />
      </div>
      <div className="border-border my-4 h-1.5 border-y" />
      <ListSkeleton rows={4} />
    </SkeletonPage>
  );
}
