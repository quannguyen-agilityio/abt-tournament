'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter as useNextRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AccentChip, LiveChip } from '@/components/live-chip';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { TeamChip } from '@/components/team-chip';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { Link, useRouter } from '@/i18n/navigation';
import type { LiveCardState, LiveProgress } from '@/lib/live-entry';
import { cn } from '@/lib/utils';
import { claimLiveScoring, setFinalEntry, type FinalEntryState, type LiveClaimState } from './live-actions';

type Team = { name: string; color: string };

export type LiveCardProps = {
  state: LiveCardState;
  matchId: string;
  code: string;
  relay: boolean;
  teams: [Team, Team];
  /** The scoring screen's own route (§8.0 Direct link), locale-free. */
  liveHref: string;
  /** Where the lineups are locked, for the `unlocked` state. */
  lockHref: string;
  /** Who holds the scorer lock, with the time it was taken, already formatted. */
  scorer: { id: string; name: string; since: string } | null;
  /** The set or leg being scored, or `null` before the first live event. */
  progress: LiveProgress | null;
  /** Group: sets won. Relay: the cumulative score of the last confirmed leg. */
  matchScore: Score;
  /** `done`: the score of each set or leg. */
  results: { slotNo: number; score: Score }[];
  isBtc: boolean;
  /** No slot has a live event yet, so the BTC can still switch to final-score entry (L6). */
  canSwitchToFinal: boolean;
};

type ActionError =
  | Extract<LiveClaimState, { error: unknown }>['error']
  | Extract<FinalEntryState, { error: unknown }>['error']
  | 'network';

/**
 * The Live scoring card on the A5 Scores step (spec-phase-2 §8.0, L-A): its state follows the
 * match status and the scorer lock (§5).
 */
export function LiveCard(props: LiveCardProps) {
  const { state, matchId, code, relay, teams, liveHref, lockHref, scorer, progress, matchScore, results } = props;
  const t = useTranslations('Admin.match.live');
  const router = useRouter();
  const nextRouter = useNextRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const unit = t(relay ? 'unitLeg' : 'unitSet');
  const slotLabel = (no: number) => t(relay ? 'legN' : 'setN', { n: no });

  const claim = (expectedScorerId: string | null) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await claimLiveScoring({ matchId, expectedScorerId });
        // Either way the lock may have moved: the card reloads its state. On success the scoring
        // route opens; until the scorer screens render there, it leads back to this card.
        nextRouter.refresh();
        if ('error' in result) setError(result.error);
        else router.push(liveHref);
      } catch {
        setError('network');
      }
    });
  };

  const switchFinal = (on: boolean) => {
    if (!window.confirm(t(on ? 'finalConfirm' : 'liveConfirm', { code }))) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setFinalEntry({ matchId, on });
        if ('error' in result) setError(result.error);
        nextRouter.refresh();
      } catch {
        setError('network');
      }
    });
  };

  const board = progress && (
    <div className="bg-surface-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-[10px] px-3 py-2.5">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t('current')}
        </span>
        <b className="font-display text-3xl leading-none font-extrabold tabular-nums">
          {slotLabel(progress.slotNo)} · {progress.score.home}–{progress.score.away}
        </b>
      </div>
      <div className="grid justify-items-end gap-0.5 text-right">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t(relay ? 'cumulative' : 'setScore')}
        </span>
        <b className="font-display text-3xl leading-none font-extrabold tabular-nums">
          {relay ? `${progress.score.home}–${progress.score.away}` : `${matchScore.home}–${matchScore.away}`}
        </b>
      </div>
    </div>
  );

  const bigButton = 'h-12 w-full text-base';
  const switchButton = props.isBtc && props.canSwitchToFinal && ['ready', 'mine', 'other'].includes(state) && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start"
      disabled={pending}
      onClick={() => switchFinal(true)}
    >
      {t('switchToFinal')}
    </Button>
  );

  let chips: React.ReactNode;
  let body: React.ReactNode;
  switch (state) {
    case 'unlocked':
      chips = <MatchStatusBadge status="scheduled" />;
      body = (
        <>
          <Button type="button" className={bigButton} disabled aria-describedby="live-lock-hint">
            {t('start')}
          </Button>
          <p id="live-lock-hint" className="text-warn flex items-start gap-2 text-sm font-semibold">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('lockFirst')}
          </p>
          <Link href={lockHref} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
            {t('goLock')}
          </Link>
        </>
      );
      break;
    case 'ready':
      chips = <AccentChip>{t('ready')}</AccentChip>;
      body = (
        <>
          <Button type="button" className={bigButton} pending={pending} onClick={() => claim(null)}>
            {t('start')}
          </Button>
          <p className="text-muted-foreground text-sm">{t('startHint', { unit })}</p>
          {board}
        </>
      );
      break;
    case 'mine':
      chips = (
        <>
          <LiveChip />
          <AccentChip>{t('youHold')}</AccentChip>
        </>
      );
      body = (
        <>
          <Link href={liveHref} className={cn(buttonVariants(), bigButton)}>
            {t('resume')}
          </Link>
          {board}
        </>
      );
      break;
    case 'other':
      chips = <LiveChip />;
      body = (
        <>
          <p className="font-semibold">
            {t.rich('heldBy', {
              name: scorer?.name ?? '—',
              time: scorer?.since ?? '',
              b: (chunks) => <b>{chunks}</b>,
            })}
          </p>
          {board}
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href={liveHref} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
              {t('watch')}
            </Link>
            <TakeoverDialog
              code={code}
              scorerName={scorer?.name ?? '—'}
              pending={pending}
              onConfirm={() => claim(scorer?.id ?? null)}
            />
          </div>
          <p className="text-muted-foreground text-xs">{t('heldHint')}</p>
        </>
      );
      break;
    case 'final':
      chips = <AccentChip>{t('finalChip')}</AccentChip>;
      body = (
        <>
          <p className="text-muted-foreground text-sm">{t('finalHint')}</p>
          {props.isBtc && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              pending={pending}
              onClick={() => switchFinal(false)}
            >
              {t('switchToLive')}
            </Button>
          )}
        </>
      );
      break;
    case 'done': {
      const winner = matchScore.home === matchScore.away ? null : teams[matchScore.home > matchScore.away ? 0 : 1];
      chips = <MatchStatusBadge status="completed" />;
      body = (
        <>
          <div className="bg-surface-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-[10px] px-3 py-2.5">
            <div className="grid gap-0.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {t('doneTitle')}
              </span>
              <b className="font-display text-3xl leading-none font-extrabold tabular-nums">
                {matchScore.home}–{matchScore.away}
              </b>
            </div>
            {winner && (
              <div className="grid justify-items-end gap-1 text-right">
                <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                  {t('winner')}
                </span>
                <TeamChip name={winner.name} color={winner.color} />
              </div>
            )}
          </div>
          <div>
            <h3 className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
              {t(relay ? 'perLeg' : 'perSet')}
            </h3>
            <ul className="divide-border divide-y">
              {results.map(({ slotNo, score }) => {
                const homeWon = score.home > score.away;
                return (
                  <li key={slotNo} className="flex items-center gap-3 py-2">
                    <b className="font-display w-16 shrink-0">{slotLabel(slotNo)}</b>
                    <span className="font-display shrink-0 text-lg tabular-nums">
                      <span className={homeWon ? 'text-win font-bold' : 'text-muted-foreground'}>{score.home}</span>
                      <span className="text-muted-foreground px-1">–</span>
                      <span className={homeWon ? 'text-muted-foreground' : 'text-win font-bold'}>{score.away}</span>
                    </span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                      {t('wins', { team: teams[homeWon ? 0 : 1].name })}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">{t('onlyBtc')}</p>
          </div>
        </>
      );
      break;
    }
  }

  return (
    <section
      aria-labelledby="live-card-title"
      className={cn(
        'bg-surface border-border grid min-w-0 gap-3 rounded-[14px] border p-4',
        state === 'unlocked' && 'bg-surface-2',
        state === 'ready' && 'border-primary ring-primary ring-1',
        (state === 'mine' || state === 'other') && 'border-loss/45',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="live-card-title" className="font-display mr-1 text-2xl leading-none font-bold uppercase">
          {t('title')}
        </h2>
        {chips}
      </div>
      {body}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`)}
        </p>
      )}
      {switchButton}
      {state !== 'unlocked' && state !== 'final' && <DirectLink route={liveHref} />}
    </section>
  );
}

/** The takeover confirmation (spec-phase-2 §5). Also used by the read-only scorer screen (L-H). */
export function TakeoverDialog({
  code,
  scorerName,
  pending,
  onConfirm,
  compact = false,
}: {
  code: string;
  scorerName: string;
  pending: boolean;
  onConfirm: () => void;
  /** A small trigger button, for a banner. */
  compact?: boolean;
}) {
  const t = useTranslations('Admin.match.live');
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size={compact ? 'sm' : 'lg'}
            className={compact ? undefined : 'w-full'}
            pending={pending}
          />
        }
      >
        {t('takeover')}
      </DialogTrigger>
      <DialogContent closeLabel={t('cancel')}>
        <DialogHeader>
          <DialogTitle>{t('takeTitle', { code })}</DialogTitle>
          <DialogDescription>{t('takeBody', { name: scorerName })}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t('takeLog')}</p>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</DialogClose>
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t('takeover')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The scoring screen's own route, to bookmark or share in chat (§8.0 Direct link). */
function DirectLink({ route }: { route: string }) {
  const t = useTranslations('Admin.match.live');
  const [message, setMessage] = useState<string | null>(null);
  const [full, setFull] = useState(route);

  const say = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2400);
  };
  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname.split('/').slice(0, 2).join('/')}${route}`;
    setFull(url);
    try {
      await navigator.clipboard.writeText(url);
      say(t('copied'));
    } catch {
      // No clipboard permission (or an insecure origin): select the link instead, never claim "copied".
      const node = document.getElementById('live-route');
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      say(t('copySelect'));
    }
  };

  return (
    <div className="border-border grid gap-1.5 border-t pt-3">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t('directLink')}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <code
          id="live-route"
          className="border-border bg-surface-2 min-w-0 flex-[1_1_200px] rounded-lg border border-dashed px-2 py-1.5 text-[12.5px] [overflow-wrap:anywhere]"
        >
          {full}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {message ?? t('copyLink')}
        </Button>
        <span role="status" className="sr-only">
          {message}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{t('directHint')}</p>
    </div>
  );
}
