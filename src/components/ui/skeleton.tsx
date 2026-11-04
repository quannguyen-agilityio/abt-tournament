import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('bg-muted rounded-md motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}

export { Skeleton };
