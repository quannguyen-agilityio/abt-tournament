'use client';

import { ArrowLeftRight, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import type { Side } from '@/domain/lineup';
import type { Pair } from '@/domain/live';
import type { DropReason, QueuedEvent } from '@/lib/live-outbox';
import type { Score } from '@/domain/score';
import { Link } from '@/i18n/navigation';
import type { RetirementLine, RetirementPreview } from '@/lib/live-scorer';
import { timeoutLeft } from '@/lib/public-live-panel';
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

const SIDES: readonly Side[] = ['home', 'away'];

/** m:ss of a duration in milliseconds, rounded up so the clock shows 0:00 only at the end. */
function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The current time, ticking every second while `on`. */
function useNow(on: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [on]);
  return on ? now : null;
}

/**
 * L-F (spec-phase-2 §6): pick the injured player, which starts the timeout, then resume or retire.
 * When the countdown reaches 0 the screen says so and still waits: the referee on court decides.
 */
export function TimeoutOverlay({
  teams,
  pairs,
  nameOf,
  minutes,
  timeout,
  onPick,
  onCancel,
  onResume,
  onRetire,
}: {
  teams: Teams;
  pairs: Record<Side, Pair>;
  nameOf: (player: string) => string;
  minutes: number;
  /** The open timeout, or `null` while the scorer picks the player. `startedAt` is when the scorer tapped. */
  timeout: { player: string; startedAt: string | null } | null;
  onPick: (player: string) => void;
  onCancel: () => void;
  onResume: () => void;
  onRetire: () => void;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  const total = minutes * 60_000;
  const now = useNow(Boolean(timeout?.startedAt));
  const left = timeout?.startedAt && now !== null ? timeoutLeft(timeout.startedAt, minutes, now) : total;
  const up = Boolean(timeout) && left === 0;
  return (
    <Overlay labelledBy={titleId}>
      <div className={styles.eyebrow}>{t('injured')}</div>
      <h2 id={titleId} className={styles.ovTitle}>
        {up ? t('timeUp') : t('medTitle')}
      </h2>
      <div className={styles.chips4} role="group" aria-label={t('injured')}>
        {SIDES.flatMap((side) =>
          pairs[side].map((player) => (
            <button
              key={`${side}-${player}`}
              type="button"
              className={styles.pchip}
              style={{ '--tc': teams[side].color } as React.CSSProperties}
              aria-pressed={timeout?.player === player}
              disabled={Boolean(timeout)}
              data-autofocus={!timeout && side === 'home' && player === pairs.home[0] ? true : undefined}
              onClick={() => onPick(player)}
            >
              {nameOf(player)}
              <small>{teams[side].name}</small>
            </button>
          )),
        )}
      </div>
      <div
        className={cn(styles.clock, !timeout && styles.idle, up && styles.done)}
        role="timer"
        aria-label={t('medClock')}
      >
        {mmss(left)}
      </div>
      <div className={styles.tbar} aria-hidden>
        <i style={{ width: `${(left / total) * 100}%` }} />
      </div>
      <p className={styles.ovSub} aria-live="polite">
        {!timeout ? t('medPick') : up ? t('timeUpSub') : t('medLocked')}
      </p>
      <div className={styles.ovActions}>
        <Button
          type="button"
          className={XL}
          disabled={!timeout}
          data-autofocus={timeout ? true : undefined}
          onClick={onResume}
        >
          {t('resume')}
        </Button>
        <Button
          type="button"
          className={cn(styles.btnLg, styles.btnLoss, 'h-12')}
          disabled={!timeout}
          onClick={onRetire}
        >
          {t('retire')}
        </Button>
        {!timeout && (
          <button type="button" className={styles.linkbtn} onClick={onCancel}>
            {t('cancel')}
          </button>
        )}
      </div>
    </Overlay>
  );
}

/** The consequence rows of a retirement (§6), shared by the confirmation and the recorded card. */
function RetirementRows({
  preview,
  teams,
  nameOf,
}: {
  preview: RetirementPreview;
  teams: Teams;
  nameOf: (player: string) => string;
}) {
  const t = useTranslations('Admin.live');
  const b = (chunks: React.ReactNode) => <b>{chunks}</b>;
  const team = teams[preview.side].name;
  const team2 = teams[other(preview.side)].name;
  const p = nameOf(preview.player);
  const { current } = preview;
  type Row = { key: string; tone: 'bad' | 'ok' | 'neu'; icon: string; text: React.ReactNode };
  const rows: Row[] = [];

  const line = (l: RetirementLine): Row => {
    const key = `s${l.slotNo}`;
    switch (l.outcome) {
      case 'kept':
        return { key, tone: 'neu', icon: '=', text: t('rKept', { n: l.slotNo }) };
      case 'forfeit':
        return {
          key,
          tone: 'bad',
          icon: '✕',
          text: t.rich('rForfeit', { n: l.slotNo, p, team, sa: l.score.home, sb: l.score.away, b }),
        };
      case 'played':
        return { key, tone: 'ok', icon: '✓', text: t.rich('rPlayed', { n: l.slotNo, p, b }) };
      case 'empty':
        return { key, tone: 'neu', icon: '–', text: t('rLater', { n: l.slotNo }) };
    }
  };

  const before = preview.others.filter((l) => l.slotNo < current.slotNo).map(line);
  const after = preview.others.filter((l) => l.slotNo > current.slotNo).map(line);
  rows.push(...before);
  if (preview.relay) {
    rows.push({
      key: 'cur',
      tone: 'bad',
      icon: '✕',
      text: t.rich('rLeg', {
        n: current.slotNo,
        lh: current.live.home,
        la: current.live.away,
        team,
        team2,
        m: preview.milestone ?? 0,
        k: current.live[preview.side],
        b,
      }),
    });
  } else {
    rows.push({
      key: 'cur',
      tone: 'bad',
      icon: '✕',
      text: t.rich('rCur', {
        n: current.slotNo,
        lh: current.live.home,
        la: current.live.away,
        team,
        sa: current.stored.home,
        sb: current.stored.away,
        b,
      }),
    });
  }
  rows.push(...after);
  if (preview.relay) {
    rows.push({ key: 'match', tone: 'bad', icon: '✕', text: t.rich('rMatch', { team, team2, b }) });
  }
  rows.push({ key: 'badge', tone: 'neu', icon: 'i', text: t.rich('rBadge', { p, b }) });

  return (
    <ul className={styles.conseq}>
      {rows.map((row) => (
        <li key={row.key} className={styles[row.tone]}>
          <span className={styles.ic} aria-hidden>
            {row.icon}
          </span>
          <span>{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** L-G: every consequence of the retirement, listed before the scorer confirms it (§6). */
export function RetireOverlay({
  preview,
  teams,
  nameOf,
  onConfirm,
  onBack,
}: {
  preview: RetirementPreview;
  teams: Teams;
  nameOf: (player: string) => string;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  return (
    <Overlay labelledBy={titleId}>
      <div className={styles.eyebrow}>{t('injury')}</div>
      <h2 id={titleId} className={styles.ovTitle}>
        {t('retTitle')}
      </h2>
      <p className={styles.ovSub}>{t('retSub', { p: nameOf(preview.player), team: teams[preview.side].name })}</p>
      <RetirementRows preview={preview} teams={teams} nameOf={nameOf} />
      <div className={styles.ovActions}>
        <Button type="button" className={cn(XL, styles.btnLoss)} data-autofocus onClick={onConfirm}>
          {t('retConfirm')}
        </Button>
        <Button type="button" variant="outline" className={cn(styles.btnLg, 'h-12')} onClick={onBack}>
          {t('back')}
        </Button>
      </div>
    </Overlay>
  );
}

/** After the retirement: what was written, then the next set (group) or the way back (relay, match over). */
export function RetiredOverlay({
  preview,
  teams,
  nameOf,
  next,
  matchHref,
  listHref,
}: {
  preview: RetirementPreview;
  teams: Teams;
  nameOf: (player: string) => string;
  /** Group: the next set still to play, with its type label. */
  next: { slotNo: number; onNext: () => void } | null;
  matchHref: string;
  listHref: string;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  return (
    <Overlay labelledBy={titleId}>
      <div className={styles.eyebrow}>{t('stateRetired')}</div>
      <h2 id={titleId} className={styles.ovTitle}>
        {t('retDone')}
      </h2>
      <p className={styles.ovSub}>{t('retDoneSub', { p: nameOf(preview.player), team: teams[preview.side].name })}</p>
      <RetirementRows preview={preview} teams={teams} nameOf={nameOf} />
      <div className={styles.ovActions}>
        {next ? (
          <Button type="button" className={XL} data-autofocus onClick={next.onNext}>
            {t('toSetup', { n: next.slotNo })}
          </Button>
        ) : (
          <Link href={matchHref} data-autofocus className={cn(buttonVariants(), XL)}>
            {t('backToMatch')}
          </Link>
        )}
        <Link href={listHref} className={cn(buttonVariants({ variant: 'outline' }), styles.btnLg, 'h-12')}>
          {t('backToList')}
        </Link>
      </div>
    </Overlay>
  );
}

/**
 * The queue was refused (spec-phase-2 §8.1 Connection state): why, and every action that was not
 * sent. The screen is read-only behind it. When the lock moved it stays read-only (Nhận quyền chấm
 * is on the viewer screen); when the log changed, the scorer can go on from the server's score.
 */
export function UnsentOverlay({
  reason,
  items,
  relay,
  teams,
  nameOf,
  onClose,
}: {
  reason: DropReason;
  items: readonly QueuedEvent[];
  relay: boolean;
  teams: Teams;
  nameOf: (player: string) => string;
  onClose: () => void;
}) {
  const t = useTranslations('Admin.live');
  const titleId = useId();
  const label = ({ event }: QueuedEvent) => {
    switch (event.kind) {
      case 'point':
        return t('unsentEvent.point', { team: teams[event.payload.side].name });
      case 'timeout_start':
      case 'retire':
        return t(`unsentEvent.${event.kind}`, { name: nameOf(event.payload.player) });
      default:
        return t(`unsentEvent.${event.kind}`);
    }
  };
  return (
    <Overlay labelledBy={titleId}>
      <div className={styles.eyebrow}>{t('readOnly')}</div>
      <h2 id={titleId} className={styles.ovTitle}>
        {t(reason === 'notScorer' ? 'unsentTitleNotScorer' : 'unsentTitleConflict')}
      </h2>
      <p className={styles.ovSub}>{t(reason === 'notScorer' ? 'unsentNotScorer' : 'unsentConflict')}</p>
      {items.length > 0 && (
        <>
          <p className={styles.ovSub}>{t('unsentList', { n: items.length })}</p>
          <ul className={styles.conseq}>
            {items.map((item) => (
              <li key={item.id} className={styles.bad}>
                <span className={styles.ic} aria-hidden>
                  ✕
                </span>
                <span>
                  {t(relay ? 'unsentSlotLeg' : 'unsentSlotSet', { n: item.slotNo })} · #{item.expectedSeq} ·{' '}
                  {label(item)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={styles.ovActions}>
        <Button type="button" className={XL} data-autofocus onClick={onClose}>
          {t(reason === 'notScorer' ? 'unsentClose' : 'unsentResume')}
        </Button>
      </div>
    </Overlay>
  );
}
