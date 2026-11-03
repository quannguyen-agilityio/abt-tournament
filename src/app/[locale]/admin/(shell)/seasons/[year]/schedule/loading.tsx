import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { SkeletonPage, TableSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton back />
      <Skeleton className="h-9 w-full max-w-md" />
      <TableSkeleton rows={8} cols={4} />
    </SkeletonPage>
  );
}
