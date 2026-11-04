import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { SkeletonPage, TableSkeleton } from '@/components/page-skeletons';

export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton back />
      <TableSkeleton rows={8} cols={5} />
    </SkeletonPage>
  );
}
