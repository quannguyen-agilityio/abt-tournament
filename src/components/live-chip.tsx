import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** The LIVE chip of a match or slot being scored live (spec-phase-2 §8.0), with a pulsing dot. */
export function LiveChip({ className }: { className?: string }) {
  const t = useTranslations('Live');
  return (
    <span
      className={cn(
        'text-loss border-loss/40 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
      {t('chip')}
    </span>
  );
}

/** A plain chip in the brand tone, such as "Sẵn sàng chấm". */
export function AccentChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'bg-brand-soft text-primary inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}
