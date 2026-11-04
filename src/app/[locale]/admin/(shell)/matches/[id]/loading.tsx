import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { ListSkeleton, SkeletonPage } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton back />
      <Skeleton className="h-24 rounded-[10px]" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-[10px]" />
        <Skeleton className="h-40 rounded-[10px]" />
      </div>
      <ListSkeleton rows={4} />
    </SkeletonPage>
  );
}
