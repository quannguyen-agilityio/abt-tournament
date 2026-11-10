'use client';

import { ArrowLeftRight, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import type { Side } from '@/domain/lineup';
import type { Score } from '@/domain/score';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import styles from './scorer.module.css';

export type TeamInfo = { name: string; color: string };
export type Teams = Record<Side, TeamInfo>;

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

/** A full-screen dialog (L-D, L-E, the saved card): focus moves to its primary button on open. */
function Overlay({ labelledBy, bare, children }: { labelledBy: string; bare?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target =
      ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector('button, a');
    target?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} className={styles.ov} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className={cn(styles.ovCard, bare && styles.bare)}>{children}</div>
    </div>
  );
}

const Swatch = ({ color }: { color: string }) => <span className={styles.swatch} style={{ background: color }} />;

function BigScore({ score, winner, teams }: { score: Score; winner: Side | null; teams: Teams }) {
  const part = (side: Side) => (
    <span
      className={winner === side ? undefined : styles.lose}
      style={winner === side ? { color: teams[side].color } : undefined}
    >
      {score[side]}
    </span>
  );
  return (
    <div className={styles.bigscore}>
      {part('home')}
      <span className={styles.dash}>–</span>
      {part('away')}
    </div>
  );
}

const winnerOf = (score: Score): Side | null =>
  score.home === score.away ? null : score.home > score.away ? 'home' : 'away';

const XL = cn(styles.btnXl, 'h-14');

/** L-D: the side that started at 0 reached the change-of-ends point. */
export function ChangeEndsOverlay({
  teams,
  left,
  reached,
  onContinue,
  onUndo,
}: {
  teams: Teams;
  /** The side on the left end now; the swap shows what it becomes. */
  left: Side;
  reached: { side: Side; score: number };
  onContinue: () => void;
  onUndo: () => void;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  const right = other(left);
  return (
    <Overlay labelledBy={titleId} bare>
      <div className={styles.eyebrow}>{t('endsReached', { team: teams[reached.side].name, n: reached.score })}</div>
      <h2 id={titleId} className={cn(styles.ovTitle, styles.huge)}>
        {t('endsTitle')}
      </h2>
      <div className={styles.swapviz}>
        {[left, right].map((side, i) => (
          <div key={side} className="contents">
            {i === 1 && <ArrowLeftRight aria-hidden />}
            <div className={styles.tm} style={{ '--tc': teams[side].color } as React.CSSProperties}>
              <Swatch color={teams[side].color} />
              <span>{teams[side].name}</span>
            </div>
          </div>
        ))}
      </div>
      <p className={styles.ovSub}>{t('endsSub')}</p>
      <div className={styles.ovActions}>
        <Button type="button" className={XL} data-autofocus onClick={onContinue}>
          {t('cont')}
        </Button>
        <button type="button" className={styles.linkbtn} onClick={onUndo}>
          {t('undoLast')}
        </button>
      </div>
    </Overlay>
  );
}

/** L-E: a side reached the target. The scorer confirms, or undoes the last point. */
export function EndOverlay({
  teams,
  relay,
  slotNo,
  target,
  eyebrow,
  score,
  winner,
  onConfirm,
  onUndo,
}: {
  teams: Teams;
  relay: boolean;
  slotNo: number;
  target: number;
  eyebrow: string;
  score: Score;
  winner: Side;
  onConfirm: () => void;
  onUndo: () => void;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  return (
    <Overlay labelledBy={titleId} bare>
      <div className={styles.eyebrow}>{eyebrow}</div>
      <h2 id={titleId} className={styles.ovTitle}>
        {t(relay ? 'endLegQ' : 'endSetQ')}
      </h2>
      <BigScore score={score} winner={winner} teams={teams} />
      <div className={styles.winline}>
        <Swatch color={teams[winner].color} />
        {relay
          ? t('wonLeg', { team: teams[winner].name, n: target })
          : t('wonSet', { team: teams[winner].name, n: slotNo })}
      </div>
      <p className={styles.ovSub}>{t('writes')}</p>
      <div className={styles.ovActions}>
        <Button type="button" className={XL} data-autofocus onClick={onConfirm}>
          {t('confirm')}
        </Button>
        <Button type="button" variant="outline" className={cn(styles.btnLg, 'h-12')} onClick={onUndo}>
          <Undo2 aria-hidden />
          {t('undoLast')}
        </Button>
      </div>
    </Overlay>
  );
}

/** After a confirm: the saved score and the way to the next set or leg. */
export function SavedOverlay({
  relay,
  slotNo,
  score,
  next,
  onNext,
}: {
  relay: boolean;
  slotNo: number;
  score: Score;
  /** The next set or leg, with the type label of a group set. */
  next: { slotNo: number; type: string | null };
  onNext: () => void;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  return (
    <Overlay labelledBy={titleId}>
      <div className={styles.eyebrow}>{t(relay ? 'savedLeg' : 'savedSet', { n: slotNo })}</div>
      <h2 id={titleId} className={styles.ovTitle}>
        {score.home}–{score.away}
      </h2>
      <p className={styles.ovSub}>
        {relay ? t('nextLeg', { n: next.slotNo }) : t('nextSet', { n: next.slotNo, type: next.type ?? '' })}
      </p>
      <div className={styles.ovActions}>
        <Button type="button" className={XL} data-autofocus onClick={onNext}>
          {relay ? t('toLegSetup') : t('toSetup', { n: next.slotNo })}
        </Button>
      </div>
    </Overlay>
  );
}

/** The last slot is confirmed: the match result, and the way back. */
export function DoneOverlay({
  teams,
  score,
  matchHref,
  listHref,
}: {
  teams: Teams;
  /** Group: sets won. Relay: the final cumulative score. */
  score: Score;
  matchHref: string;
  listHref: string;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  return (
    <Overlay labelledBy={titleId}>
      <h2 id={titleId} className={styles.ovTitle}>
        {t('matchDone')}
      </h2>
      <BigScore score={score} winner={winnerOf(score)} teams={teams} />
      <p className={styles.ovSub}>{t('matchDoneSub')}</p>
      <div className={styles.ovActions}>
        <Link href={matchHref} data-autofocus className={cn(buttonVariants(), XL)}>
          {t('backToMatch')}
        </Link>
        <Link href={listHref} className={cn(buttonVariants({ variant: 'outline' }), styles.btnLg, 'h-12')}>
          {t('backToList')}
        </Link>
      </div>
    </Overlay>
  );
}
