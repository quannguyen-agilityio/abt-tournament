'use client';

import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { moveItem } from '@/lib/award-admin';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { reorderAwards } from './actions';

export type AwardListItem = { id: string; name: string; sponsor: string | null; value: number | null; winners: number };

const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const DRAG_TYPE = 'application/x-abt-award';

/**
 * The season's awards in the order the public page shows them (spec §6 A7). The BTC reorders them by
 * drag and drop, or with the move buttons on each row (the keyboard way); every move is saved at once.
 */
export function AwardList({
  seasonId,
  year,
  selectedId,
  awards,
}: {
  seasonId: string;
  year: number;
  selectedId: string | null;
  awards: AwardListItem[];
}) {
  const t = useTranslations('Admin.awards.list');
  const locale = useLocale() as 'vi' | 'en';
  const [order, setOrder] = useState(awards);
  const [over, setOver] = useState<number | null>(null);
  const [error, setError] = useState<'changed' | 'failed' | null>(null);
  const [pending, startTransition] = useTransition();

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length) return;
    const before = order;
    const next = moveItem(order, from, to);
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderAwards(
        seasonId,
        next.map((a) => a.id),
      );
      if ('error' in result) {
        setOrder(before);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 self-start">
      <ol aria-label={t('label')} className="border-border bg-surface divide-border divide-y rounded-[10px] border">
        {order.map((award, i) => (
          <li
            key={award.id}
            draggable={!pending}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, String(i));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (pending || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOver(i);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const from = Number(e.dataTransfer.getData(DRAG_TYPE));
              if (Number.isInteger(from)) move(from, i);
            }}
            className={cn(
              'flex items-center gap-3 p-3 first:rounded-t-[10px] last:rounded-b-[10px]',
              award.id === selectedId && 'bg-surface-2',
              over === i && 'ring-primary/40 ring-3 ring-inset',
              !pending && 'cursor-grab active:cursor-grabbing',
            )}
          >
            <GripVertical aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
            <Link
              href={`/admin/seasons/${year}/awards?award=${award.id}`}
              draggable={false}
              aria-current={award.id === selectedId ? 'true' : undefined}
              className="min-w-0 flex-1 hover:underline"
            >
              <span className="block truncate font-semibold">{award.name}</span>
              {(award.sponsor || award.value !== null) && (
                <span className="text-muted-foreground block truncate text-xs">
                  {[award.sponsor, award.value !== null ? formatMoney(award.value, locale) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </Link>
            <span
              className={cn(CHIP, award.winners > 0 ? 'border-win/60 text-win' : 'border-warn/60 bg-warn/10 text-warn')}
            >
              {award.winners > 0 ? t('winners', { count: award.winners }) : t('pending')}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={pending || i === 0}
                aria-label={t('moveUp', { name: award.name })}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={pending || i === order.length - 1}
                aria-label={t('moveDown', { name: award.name })}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {pending ? t('saving') : t('hint')}
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
