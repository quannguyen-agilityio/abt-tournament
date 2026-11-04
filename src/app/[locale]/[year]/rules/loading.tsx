import { SkeletonPage, TitleSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <section key={i} className="border-border bg-surface rounded-[10px] border p-5">
            <Skeleton className="mb-3 h-7 w-40" />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </section>
        ))}
      </div>
    </SkeletonPage>
  );
}
