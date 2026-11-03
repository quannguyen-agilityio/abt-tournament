import { SkeletonPage, TitleSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton className="mb-6" />
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-28 rounded-[10px]" />
          <Skeleton className="h-28 rounded-[10px]" />
        </div>
        <div className="hidden md:block" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-28 rounded-[10px]" />
        </div>
      </div>
      <div className="mt-8 max-w-md">
        <Skeleton className="h-28 rounded-[10px]" />
      </div>
    </SkeletonPage>
  );
}
