import { CardGridSkeleton, SkeletonPage, TitleSkeleton } from '@/components/page-skeletons';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <CardGridSkeleton count={12} className="gap-3" />
    </SkeletonPage>
  );
}
