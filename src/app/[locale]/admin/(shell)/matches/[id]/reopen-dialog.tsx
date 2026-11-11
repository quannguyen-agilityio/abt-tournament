'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Score } from '@/domain/score';
import type { ReopenOption } from '@/lib/live-reopen';
import { applyLiveEvent, type LiveApplyState } from './live-actions';

const INPUT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none focus-visible:ring-3';

/** A confirmed set or leg the BTC may reopen, as the A5 card shows it. */
export type ReopenItem = ReopenOption & {
  /** The slot row id, for `live_apply`. */
  slotId: string;
  score: Score;
  /** The name of the player who retired, when the slot ended by retirement. */
  retiredName: string | null;
};

type ReopenError = Extract<LiveApplyState, { error: unknown }>['error'] | 'network';

/**
 * **Mở lại set** / **Mở lại lượt** (spec-phase-2 §4.5, L10): BTC only. The confirmation lists what
 * the reopen changes and needs a reason, which goes to the audit log with the `reopened` event. A
 * relay leg that cannot be reopened yet shows why instead of the button.
 */
export function ReopenDialog({
  item,
  relay,
  matchCompleted,
  onReopened,
}: {
  item: ReopenItem;
  relay: boolean;
  /** The match is completed, so the reopen moves it back to in progress. */
  matchCompleted: boolean;
  onReopened: (slotNo: number) => void;
}) {
  const t = useTranslations('Admin.match.live.reopen');
  const tl = useTranslations('Admin.match.live');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ReopenError | null>(null);
  const [pending, startTransition] = useTransition();
  const label = tl(relay ? 'legN' : 'setN', { n: item.slotNo });
  const action = t(relay ? 'leg' : 'set', { n: item.slotNo });

  if (item.blocked) {
    return (
      <span className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t(`blocked.${item.blocked}`)}
      </span>
    );
  }

  const submit = () => {
    if (reason.trim() === '') return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyLiveEvent({
          slotId: item.slotId,
          expectedSeq: item.expectedSeq,
          event: { kind: 'reopened', payload: { reason: reason.trim() } },
          clientAt: new Date().toISOString(),
        });
        router.refresh();
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setReason('');
        onReopened(item.slotNo);
      } catch {
        setError('network');
      }
    });
  };

  const forfeits = item.clearsForfeits.map((n) => tl(relay ? 'legN' : 'setN', { n })).join(', ');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label={t(relay ? 'legAria' : 'setAria', { n: item.slotNo })}
          />
        }
      >
        {action}
      </DialogTrigger>
      <DialogContent closeLabel={tl('cancel')}>
        <DialogHeader>
          <DialogTitle>{t(relay ? 'titleLeg' : 'titleSet', { n: item.slotNo })}</DialogTitle>
          <DialogDescription>{t('body', { label, score: `${item.score.home}–${item.score.away}` })}</DialogDescription>
        </DialogHeader>
        <ul className="border-warn/40 bg-warn/10 grid list-disc gap-1 rounded-lg border p-3 pl-7 text-sm">
          <li>{t('cleared', { label })}</li>
          {matchCompleted && <li>{t('matchLive')}</li>}
          {item.retirement && <li>{t('retirement', { player: item.retiredName ?? '—' })}</li>}
          {item.clearsForfeits.length > 0 && <li>{t('forfeits', { slots: forfeits })}</li>}
          {item.retirement && relay && <li>{t('retiredTeam')}</li>}
          <li>{t('audit')}</li>
        </ul>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('reason')}
          <textarea
            name="reason"
            value={reason}
            rows={2}
            maxLength={500}
            required
            onChange={(e) => setReason(e.target.value)}
            className={INPUT}
          />
          <span className="text-muted-foreground text-xs font-normal">{t('reasonHint')}</span>
        </label>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${error}`)}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{tl('cancel')}</DialogClose>
          <Button
            type="button"
            variant="destructive"
            pending={pending}
            disabled={reason.trim() === ''}
            onClick={submit}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
