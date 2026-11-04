import { SkeletonPage, TableSkeleton } from '@/components/page-skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Mirrors the admin page heading: optional back link, h1 and subtitle. */
export function AdminTitleSkeleton({ back = false, className }: { back?: boolean; className?: string }) {
  return (
    <div className={className}>
      {back && <Skeleton className="mb-2 h-4 w-28" />}
      <Skeleton className="mb-2 h-9 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** Generic admin main-area fallback: heading plus a table card. */
export function AdminPageSkeleton({ back = false }: { back?: boolean }) {
  return (
    <SkeletonPage className="flex flex-col gap-4">
      <AdminTitleSkeleton back={back} />
      <TableSkeleton rows={6} cols={4} />
    </SkeletonPage>
  );
}

/** Mirrors AdminSidebar: profile card, then a nav that scrolls horizontally on mobile and stacks on lg. */
export function AdminSidebarSkeleton({ items = 8 }: { items?: number }) {
  return (
    <aside aria-hidden className="flex min-w-0 flex-col gap-3">
      <div className="border-border bg-surface rounded-[10px] border p-3">
        <Skeleton className="mb-1.5 h-4 w-32" />
        <Skeleton className="mb-3 h-3 w-40" />
        <Skeleton className="mb-3 h-5 w-16 rounded-full" />
        <Skeleton className="h-7 w-full" />
      </div>
      <div className="overflow-x-auto">
        <div className="flex w-max gap-1 lg:w-auto lg:flex-col">
          {Array.from({ length: items }, (_, i) => (
            <Skeleton key={i} className={cn('h-8 w-24 rounded-lg lg:w-full')} />
          ))}
        </div>
      </div>
    </aside>
  );
}
