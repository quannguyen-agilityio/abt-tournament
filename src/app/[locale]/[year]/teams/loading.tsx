import { CardGridSkeleton, SkeletonPage, TitleSkeleton } from '@/components/page-skeletons';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <CardGridSkeleton count={9} />
    </SkeletonPage>
  );
}
