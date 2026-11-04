import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { SkeletonPage, TableSkeleton } from '@/components/page-skeletons';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton />
      <TableSkeleton rows={6} cols={5} />
    </SkeletonPage>
  );
}
