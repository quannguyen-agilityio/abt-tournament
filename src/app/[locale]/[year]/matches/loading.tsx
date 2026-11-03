import { SkeletonPage, TitleSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <div className="border-border mb-4 h-1.5 max-w-xs border-y" />
      {[0, 1].map((i) => (
        <section key={i} className="mb-8">
          <Skeleton className="mb-3 h-8 w-56" />
          <div className="mb-4 grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
            <Skeleton className="h-6 w-14 sm:mt-3" />
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} className="h-24 rounded-[10px]" />
              ))}
            </div>
          </div>
        </section>
      ))}
    </SkeletonPage>
  );
}
