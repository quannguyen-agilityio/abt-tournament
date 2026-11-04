import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { SkeletonPage } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton back />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-[10px]" />
        <Skeleton className="h-64 rounded-[10px]" />
      </div>
    </SkeletonPage>
  );
}
