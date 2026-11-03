import { AdminTitleSkeleton } from '@/components/admin-skeletons';
import { SkeletonPage } from '@/components/page-skeletons';

export default function Loading() {
  return (
    <SkeletonPage>
      <AdminTitleSkeleton />
    </SkeletonPage>
  );
}
