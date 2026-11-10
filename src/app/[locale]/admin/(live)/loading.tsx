import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-2 p-3" aria-busy="true">
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-40 flex-1 rounded-lg" />
      <Skeleton className="h-28 rounded-lg" />
    </div>
  );
}
