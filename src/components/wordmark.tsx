import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function Wordmark({ year, href, className }: { year?: number | string; href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('font-display text-[22px] leading-none font-extrabold tracking-[0.04em]', className)}
    >
      ABT
      <span className="text-primary" aria-hidden>
        ·
      </span>
      {year !== undefined && <span className="num">{String(year).slice(-2)}</span>}
    </Link>
  );
}
