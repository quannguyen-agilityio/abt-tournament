import { readableTextOn } from '@/lib/contrast';
import { cn } from '@/lib/utils';

/** A square in the team color with the first letter of its name. Size and text size come from `className`. */
export function TeamBadge({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('font-display grid shrink-0 place-items-center rounded-md font-bold', className)}
      style={{ backgroundColor: color, color: readableTextOn(color) }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
