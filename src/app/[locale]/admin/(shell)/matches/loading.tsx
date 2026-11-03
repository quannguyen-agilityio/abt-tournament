import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { ListSkeleton, SkeletonPage } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton />
      <Skeleton className="h-9 w-full max-w-xl" />
      <ListSkeleton rows={8} className="gap-0" />
    </SkeletonPage>
  );
}
