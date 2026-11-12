'use client';

import { EllipsisVertical, Lock, Sun, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { TakeoverDialog } from '@/app/[locale]/admin/(shell)/matches/[id]/live-card';
import { ShuttleIcon } from '@/components/shuttle-icon';
import { Button } from '@/components/ui/button';
import type { Side } from '@/domain/lineup';
import type { LiveState, SlotSetup } from '@/domain/live';
import type { Score } from '@/domain/score';
import { Link } from '@/i18n/navigation';
import { setupPreview, type ScorerSlot } from '@/lib/live-scorer';
import { cn } from '@/lib/utils';
import { CourtDiagram } from './court';
import type { Teams } from './overlays';
import styles from './scorer.module.css';

const SIDES: readonly Side[] = ['home', 'away'];
const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const given = (name: string) => name.split(' ').pop() ?? name;
const bold = (chunks: React.ReactNode) => <b>{chunks}</b>;
const sep = (chunks: React.ReactNode) => <span className={styles.sep}>{chunks}</span>;

/** One cell of the set strip (or the leg strip of a relay). */
export type StripCell = { slotNo: number; kind: 'done' | 'cur' | 'pend'; score: Score | null };

export type ScoringScreenProps = {
  mode: 'scorer' | 'viewer';
  code: string;
  courtName: string | null;
  matchHref: string;
  relay: boolean;
  slot: ScorerSlot;
  setup: SlotSetup;
  state: LiveState;
  teams: Teams;
  nameOf: (player: string) => string;
  /** The group slot type, as a label. */
  typeLabel: string | null;
  cells: StripCell[];
  /** Relay: every milestone, the last one is the end of the match. */
  milestones: readonly number[];
  pending: number;
  wake: 'on' | 'off' | null;
  scorerName: string | null;
  /** The BTC reopened this set or leg and it is being fixed. */
  fixing: boolean;
  toast: string | null;
  overlay: React.ReactNode;
  onPlus: (side: Side) => void;
  onUndo: () => void;
  onEditSetup: () => void;
  /** Chấn thương (§6): `null` when a medical timeout cannot start now. */
  onInjury: (() => void) | null;
  /** Viewer: take the scorer lock. */
  takeover?: { onConfirm: () => void; pending: boolean };
};

/**
 * L-C: the scoring screen, and L-H (read-only) with `mode="viewer"` (spec-phase-2 §8.1). The two big
 * `+1` buttons sit on the side of the team's end, so the button of the team on the left end is on the
 * left; the court mirrors at the change of ends.
 */
export function ScoringScreen(props: ScoringScreenProps) {
  const { mode, code, courtName, matchHref, relay, slot, setup, state, teams, nameOf, cells, overlay } = props;
  const t = useTranslations('Admin.live');
  const ro = mode === 'viewer';
  const left = state.ends?.left ?? 'home';
  const right = other(left);
  const colors: Record<Side, string> = { home: teams.home.color, away: teams.away.color };
  const final = props.milestones.at(-1) ?? 1;

  const frozen = ro || !state.setUp || state.ended || state.changeEndsDue || !!state.timeout || !!state.retired;
  const lastRally = state.rallies.at(-1);
  const undoDisabled = ro || !lastRally || state.confirmed || !!state.retired || !!state.timeout;
  const previousLocked = !lastRally && slot.slot_no > 1;

  const mid = relay
    ? t('legMid', { n: slot.slot_no, total: cells.length, m: state.target })
    : t('setMid', { n: slot.slot_no, type: props.typeLabel ?? '' });
  const chip = state.retired
    ? ([styles.chipLoss, t('stateRetired')] as const)
    : state.timeout
      ? ([styles.chipWarn, t('stateMed')] as const)
      : state.changeEndsDue
        ? ([styles.chipAccent, t('stateEnds')] as const)
        : state.ended
          ? ([styles.chipWin, t(relay ? 'stateLegEnded' : 'stateSetEnded')] as const)
          : ([styles.chipLive, t('stateLive')] as const);

  // The court and the caption under it.
  const preview = setupPreview(setup, { ends: { left }, serving: null, server: null, receiver: null });
  const view =
    state.setUp && state.positions && state.servingSide && state.server && state.receiver && state.serverCourt
      ? {
          left,
          positions: state.positions,
          server: { side: state.servingSide, player: state.server, court: state.serverCourt },
          receiver: { side: other(state.servingSide), player: state.receiver, court: state.serverCourt },
        }
      : preview;
  const serveValues =
    state.setUp && state.servingSide && state.server && state.receiver && state.serverCourt
      ? {
          s: nameOf(state.server),
          c: t(state.serverCourt === 'right' ? 'rightFull' : 'leftFull'),
          n: state.score[state.servingSide],
          p: t(state.score[state.servingSide] % 2 ? 'odd' : 'even'),
          r: nameOf(state.receiver),
        }
      : null;
  const waitingText = t(relay ? 'waitingLeg' : 'waitingSet', { n: slot.slot_no });
  const plainService = serveValues ? t('serveCapPlain', serveValues) : waitingText;
  const courtLabel = t('courtAria', { l: teams[left].name, r: teams[right].name, s: plainService });
  const announce = `${t('scoreAria', {
    ta: teams[left].name,
    a: state.score[left],
    tb: teams[right].name,
    b: state.score[right],
  })} ${plainService}`;

  return (
    <div className={cn(styles.sc, ro && styles.ro)}>
      <div className={styles.scBody} inert={!!overlay}>
        <header className={cn(styles.scTop, styles.scPad)}>
          <div className={styles.scCode}>
            {code}
            {courtName && <small>{courtName}</small>}
          </div>
          <div className={styles.scMid}>
            <span className={styles.scSet}>{mid}</span>
            <span className={cn(styles.chip, chip[0])}>{chip[1]}</span>
          </div>
          {!ro && (
            <ScorerMenu
              matchHref={matchHref}
              canEdit={state.setUp && !state.confirmed}
              onEdit={props.onEditSetup}
              onInjury={props.onInjury}
            />
          )}
        </header>
        <div className={cn(styles.scStatus, styles.scPad)}>
          <span className={cn(styles.conn, props.pending > 0 ? styles.connPend : styles.connOk)} role="status">
            {props.pending > 0 ? t('pending', { n: props.pending }) : t('synced')}
          </span>
          {props.wake && (
            <span className={cn(styles.scWl, props.wake === 'on' ? styles.on : styles.off)} role="status">
              {props.wake === 'on' ? <Sun aria-hidden /> : <Lock aria-hidden />}
              <span>{t(props.wake === 'on' ? 'wlOn' : 'wlOff')}</span>
            </span>
          )}
          {props.scorerName && <span className={styles.who}>{t('scorerBy', { name: props.scorerName })}</span>}
        </div>
        {props.fixing && (
          <div className={cn(styles.fixBanner, styles.scPad)} role="note">
            {t('fixBanner', { unit: t(relay ? 'unitLeg' : 'unitSet'), n: slot.slot_no })}
          </div>
        )}
        {relay ? (
          <div className={cn(styles.rl, styles.scPad)}>
            {SIDES.map((side) => (
              <div key={side} className={styles.rlRow}>
                <span className={styles.swatch} style={{ background: teams[side].color }} />
                <div className={styles.relay}>
                  <span
                    style={{
                      background: teams[side].color,
                      width: `${Math.min(100, (state.score[side] / final) * 100)}%`,
                    }}
                  />
                  {props.milestones.slice(0, -1).map((m) => (
                    <i key={m} className={styles.tick} style={{ left: `${(m / final) * 100}%` }} />
                  ))}
                </div>
                <b>{state.score[side]}</b>
              </div>
            ))}
            <div className={styles.rlMs} aria-hidden="true">
              {props.milestones.map((m) => (
                <span
                  key={m}
                  className={m === state.target ? styles.on : undefined}
                  style={{ left: `${(m / final) * 100}%` }}
                >
                  {m}
                </span>
              ))}
            </div>
            <Strip cells={cells} teams={teams} relay state={state} />
          </div>
        ) : (
          <Strip cells={cells} teams={teams} relay={false} state={state} padded />
        )}
        {ro && props.takeover && (
          <div className={cn(styles.vwBanner, styles.scPad)}>
            <span className={styles.chip}>{t('readOnly')}</span>
            <div className={styles.txt}>
              <b>{t('scoringBy', { name: props.scorerName ?? '—' })}</b>
              <br />
              <span className="text-muted-foreground">{t('scoringByHint')}</span>
            </div>
            <TakeoverDialog
              compact
              code={code}
              scorerName={props.scorerName ?? '—'}
              pending={props.takeover.pending}
              onConfirm={props.takeover.onConfirm}
            />
          </div>
        )}
        <main className={styles.scMain} data-left={left}>
          {SIDES.map((side) => {
            const start = setup.start[side];
            return (
              <section
                key={`info-${side}`}
                className={cn(
                  styles.info,
                  side === 'home' ? styles.iH : styles.iA,
                  state.servingSide === side && styles.serving,
                )}
                style={{ '--tc': teams[side].color } as React.CSSProperties}
              >
                <div className={styles.nm}>
                  <span className={styles.swatch} style={{ background: teams[side].color }} />
                  <span className={styles.t}>{teams[side].name}</span>
                  <span className={styles.sh}>
                    <ShuttleIcon />
                  </span>
                  {!relay && start > 0 && (
                    <span className={styles.hc} title={t('hcChip', { n: start })}>
                      +{start}
                    </span>
                  )}
                </div>
                <div className={styles.pl}>{setup.pairs[side].map((p) => given(nameOf(p))).join(' · ')}</div>
                <div key={state.score[side]} className={cn(styles.big, styles.pop)} aria-hidden="true">
                  {state.score[side]}
                </div>
              </section>
            );
          })}
          <div className={styles.courtWrap}>
            <CourtDiagram view={view} colors={colors} nameOf={nameOf} ariaLabel={courtLabel} />
            <p className={styles.cap}>
              {serveValues ? t.rich('serveCap', { ...serveValues, b: bold, sep }) : waitingText}
            </p>
          </div>
          {SIDES.map((side) => (
            <div
              key={`btn-${side}`}
              className={cn(styles.bSlot, side === 'home' ? styles.bH : styles.bA)}
              style={{ '--tc': teams[side].color } as React.CSSProperties}
            >
              <button
                type="button"
                className={styles.plus}
                disabled={frozen}
                aria-label={t('plusAria', { team: teams[side].name })}
                onClick={() => props.onPlus(side)}
              >
                +1<small>{t('plusLabel', { team: teams[side].name })}</small>
              </button>
            </div>
          ))}
        </main>
        <footer className={cn(styles.scFoot, styles.scPad)}>
          <Button
            type="button"
            variant="outline"
            className={styles.undo}
            disabled={undoDisabled}
            onClick={props.onUndo}
          >
            <Undo2 aria-hidden />
            {t('undo')}
          </Button>
          <span className={styles.last}>
            {lastRally
              ? t('lastPoint', { team: teams[lastRally.side].name, n: state.rallies.length })
              : previousLocked
                ? t(relay ? 'undoLockedLeg' : 'undoLockedSet')
                : t('noPoints')}
          </span>
        </footer>
        <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
          {announce}
        </div>
      </div>
      <div className={styles.toast} role="status" hidden={!props.toast}>
        {props.toast}
      </div>
      {overlay}
    </div>
  );
}

function Strip({
  cells,
  teams,
  relay,
  state,
  padded,
}: {
  cells: StripCell[];
  teams: Teams;
  relay: boolean;
  state: LiveState;
  padded?: boolean;
}) {
  const t = useTranslations('Admin.live');
  return (
    <div className={cn(styles.strip, padded && styles.scPad)} role="list">
      {cells.map((cell) => {
        const winner: Side | null =
          cell.score && cell.score.home !== cell.score.away
            ? cell.score.home > cell.score.away
              ? 'home'
              : 'away'
            : null;
        const score = cell.kind === 'cur' ? state.score : cell.score;
        return (
          <div
            key={cell.slotNo}
            role="listitem"
            className={cn(
              styles.cell,
              cell.kind === 'done' && styles.done,
              cell.kind === 'cur' && styles.cur,
              cell.kind === 'pend' && styles.pend,
            )}
            style={
              cell.kind === 'done' && winner ? ({ '--wc': teams[winner].color } as React.CSSProperties) : undefined
            }
            aria-current={cell.kind === 'cur' ? 'true' : undefined}
          >
            <i>{t(relay ? 'legN' : 'setN', { n: cell.slotNo })}</i>
            <b>{cell.kind === 'pend' || !score ? '–' : `${score.home}–${score.away}`}</b>
          </div>
        );
      })}
    </div>
  );
}

/** The ⋮ menu of the scorer: Sửa thiết lập, Chấn thương, Về trận. */
function ScorerMenu({
  matchHref,
  canEdit,
  onEdit,
  onInjury,
}: {
  matchHref: string;
  canEdit: boolean;
  onEdit: () => void;
  onInjury: (() => void) | null;
}) {
  const t = useTranslations('Admin.live');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.scMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.iconbtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('menu')}
        onClick={() => setOpen(!open)}
      >
        <EllipsisVertical aria-hidden />
      </button>
      <div id={menuId} className={styles.menu} role="menu" hidden={!open}>
        <button
          type="button"
          role="menuitem"
          disabled={!canEdit}
          onClick={() => {
            setOpen(false);
            onEdit();
          }}
        >
          {t('editSetup')}
        </button>
        <button
          type="button"
          role="menuitem"
          className={styles.warnrow}
          disabled={!onInjury}
          onClick={() => {
            setOpen(false);
            onInjury?.();
          }}
        >
          {t('injury')}
        </button>
        <Link href={matchHref} role="menuitem">
          {t('backToMatch')}
        </Link>
      </div>
    </div>
  );
}
