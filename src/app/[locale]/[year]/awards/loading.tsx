import { SkeletonPage, TitleSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <ul className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="border-border bg-surface flex flex-col gap-3 rounded-[10px] border p-5">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="border-border mt-2 border-t pt-3">
              <Skeleton className="h-5 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonPage>
  );
}
