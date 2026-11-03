import { LoadingLabel } from '@/components/loading-label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CARD = 'border-border bg-surface rounded-[10px] border';

/** Wrapper announcing a busy region; the visible placeholders inside are aria-hidden. */
export function SkeletonPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <LoadingLabel />
      {children}
    </div>
  );
}

/** Mirrors the page h1 + subtitle. */
export function TitleSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('mb-5', className)}>
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="h-5 w-72 max-w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn(CARD, 'overflow-hidden', className)}>
      <div className="border-border flex gap-4 border-b px-3 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={cn('h-4', i === 1 ? 'flex-[3]' : 'flex-1')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="border-border flex gap-4 border-b px-3 py-3 last:border-b-0">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={cn('h-5', i === 1 ? 'flex-[3]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={cn(CARD, 'flex flex-col gap-3 p-4')}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0" />
            <div className="flex-1">
              <Skeleton className="mb-1.5 h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-4 w-2/3" />
        </li>
      ))}
    </ul>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn(CARD, 'flex items-center gap-3 p-4')}>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn(CARD, 'grid max-w-xl gap-4 p-5', className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="grid gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

/** Generic fallback: title + table. */
export function PageSkeleton() {
  return (
    <SkeletonPage>
      <TitleSkeleton />
      <TableSkeleton />
    </SkeletonPage>
  );
}
