import { cn } from '@/lib/utils';

/** A team's color swatch and name. */
export function TeamChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span aria-hidden className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />
      <span className="truncate font-semibold">{name}</span>
    </span>
  );
}
