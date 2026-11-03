import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { SkeletonPage, TableSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton back />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-[10px]" />
        ))}
      </div>
      <TableSkeleton rows={8} cols={5} />
    </SkeletonPage>
  );
}
