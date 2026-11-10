'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { claimLiveScoring } from '@/app/[locale]/admin/(shell)/matches/[id]/live-actions';
import type { Side } from '@/domain/lineup';
import { tryReplay, type LiveEvent, type LiveSettings, type LiveState } from '@/domain/live';
import type { Score } from '@/domain/score';
import { withSeq, type NewLiveEvent } from '@/lib/live-scoring';
import {
  currentSlotNo,
  finishedScore,
  latestSetup,
  scorerSlotSetup,
  serverCoversLocal,
  setsWon,
  slotPhases,
  wasReopened,
  type ScorerLogs,
  type ScorerMatch,
  type ScorerSlot,
} from '@/lib/live-scorer';
import { ChangeEndsOverlay, DoneOverlay, EndOverlay, SavedOverlay, type Teams } from './overlays';
import { ScoringScreen, type StripCell } from './scoring-screen';
import { SetupScreen } from './setup-screen';
import { useLiveRealtime, useOutbox, useThrottledRefresh, type DropReason } from './use-live-sync';
import { useWakeLock } from './use-wake-lock';
import styles from './scorer.module.css';

const NO_EVENTS: readonly LiveEvent[] = [];
const REFRESH_AFTER_SYNC_MS = 1500;
const VIEWER_REFRESH_MS = 30_000;
const REALTIME_REFRESH_MS = 1000;
const TOAST_MS = 5000;

export type ScorerProps = {
  /** `scorer`: the viewer holds the scorer lock. `viewer`: someone else does (L-H). */
  mode: 'scorer' | 'viewer';
  matchId: string;
  code: string;
  courtName: string | null;
  match: ScorerMatch;
  settings: LiveSettings;
  teams: Teams;
  /** Player id to full name. */
  names: Record<string, string>;
  slots: ScorerSlot[];
  /** The stored log of each slot, by `slot_no`. */
  logs: Record<number, LiveEvent[]>;
  viewerId: string;
  scorer: { id: string; name: string } | null;
};

/**
 * The live scorer screens (spec-phase-2 §8.1): set or leg setup (L-B), scoring (L-C), change of ends
 * (L-D), end of set or leg (L-E) and the read-only viewer (L-H).
 *
 * The screen replays its own log, so a tap shows at once; the events go to the server in order, one
 * at a time. Whenever new server data arrives with nothing left to send, the local log is replaced
 * by the server's, so the screen is `replay()` of the stored log.
 */
export function Scorer(props: ScorerProps) {
  const { matchId, code, courtName, match, settings, teams, names, slots, viewerId, scorer } = props;
  const t = useTranslations('Admin.live');
  const router = useRouter();
  const relay = match.stage !== 'group';
  const matchHref = `/admin/matches/${matchId}?step=scores`;

  const [local, setLocal] = useState<ScorerLogs | null>(null);
  const [seenLogs, setSeenLogs] = useState(props.logs);
  const [demoted, setDemoted] = useState(false);
  const [seenMode, setSeenMode] = useState(props.mode);
  const [savedNo, setSavedNo] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [claiming, startClaim] = useTransition();
  const logsRef = useRef<ScorerLogs>(props.logs);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const outbox = useOutbox({
    // After the last event is stored, load the server's log (debounced: a burst of taps refreshes once).
    onDrained: () => {
      clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => router.refresh(), REFRESH_AFTER_SYNC_MS);
    },
    onDropped: (reason: DropReason) => {
      setLocal(null);
      if (reason === 'notScorer') setDemoted(true);
      showToast(t(reason === 'notScorer' ? 'toastNotScorer' : 'toastConflict'));
      router.refresh();
    },
  });
  useEffect(
    () => () => {
      clearTimeout(syncTimer.current);
      clearTimeout(toastTimer.current);
    },
    [],
  );

  // New server data: the lock may have moved, and with nothing left to send the local log gives way
  // to the server's (unless this snapshot is older than what the screen holds).
  if (props.mode !== seenMode) {
    setSeenMode(props.mode);
    setDemoted(false);
  }
  if (props.logs !== seenLogs) {
    setSeenLogs(props.logs);
    if (local && outbox.pending === 0 && serverCoversLocal(props.logs, local)) setLocal(null);
  }

  const mode = props.mode === 'scorer' && !demoted ? 'scorer' : 'viewer';
  const logs: ScorerLogs = local ?? props.logs;
  useEffect(() => {
    logsRef.current = logs;
  });

  const wake = useWakeLock(mode === 'scorer');

  const refreshSoon = useThrottledRefresh(REALTIME_REFRESH_MS);
  useLiveRealtime(
    useMemo(() => slots.map((s) => s.id), [slots]),
    (createdBy) => {
      if (mode === 'viewer' || createdBy !== viewerId) refreshSoon();
    },
  );
  useEffect(() => {
    if (mode !== 'viewer') return;
    const id = setInterval(() => router.refresh(), VIEWER_REFRESH_MS);
    return () => clearInterval(id);
  }, [mode, router]);

  // Where the match stands, from the local logs.
  const phases = useMemo(() => slotPhases(match, slots, logs, settings), [match, slots, logs, settings]);
  const current = useMemo(() => currentSlotNo(match, slots, logs, settings), [match, slots, logs, settings]);
  const lastNo = Math.max(...slots.map((s) => s.slot_no));
  const showSaved = savedNo !== null && current !== savedNo && phases[savedNo] === 'finished';
  const viewNo = showSaved ? savedNo : (current ?? lastNo);
  const slot = slots.find((s) => s.slot_no === viewNo)!;
  const log = logs[viewNo] ?? NO_EVENTS;
  const setup = useMemo(
    () => scorerSlotSetup(match, slots, logs, viewNo, settings),
    [match, slots, logs, viewNo, settings],
  );
  const state = useMemo(() => (setup ? tryReplay(setup, log, settings).state : null), [setup, log, settings]);
  const previousState = useMemo(() => {
    if (!relay || viewNo < 2) return undefined;
    const before = scorerSlotSetup(match, slots, logs, viewNo - 1, settings);
    return before ? tryReplay(before, logs[viewNo - 1] ?? NO_EVENTS, settings).state : undefined;
  }, [relay, match, slots, logs, viewNo, settings]);

  const nameOf = useCallback((player: string) => names[player] ?? '—', [names]);
  const typeLabel = (s: ScorerSlot) => (relay ? null : t(`slotType.${s.slot_type as 'open' | 'low' | 'high'}`));

  const dispatch = (event: NewLiveEvent) => {
    if (mode !== 'scorer' || !setup) return;
    const events = logsRef.current[viewNo] ?? NO_EVENTS;
    const next = withSeq(event, (events.at(-1)?.seq ?? 0) + 1);
    if (!tryReplay(setup, [...events, next], settings).ok) return;
    const updated = { ...logsRef.current, [viewNo]: [...events, next] };
    logsRef.current = updated;
    setLocal(updated);
    outbox.enqueue({ slotId: slot.id, expectedSeq: next.seq, event, clientAt: new Date().toISOString() });
    if (event.kind === 'end_confirmed') setSavedNo(viewNo);
  };

  const claim = () => {
    startClaim(async () => {
      try {
        const result = await claimLiveScoring({ matchId, expectedScorerId: scorer?.id ?? null });
        if ('error' in result) showToast(t('claimFailed'));
      } catch {
        showToast(t('claimFailed'));
      }
      router.refresh();
    });
  };

  if (!state || !setup) {
    return (
      <div className={styles.pageLoading}>
        <p role="status" className="px-6 text-center">
          {t('notReady')}
        </p>
      </div>
    );
  }

  const teamColors = teams;
  const scorerName = scorer?.name ?? null;

  if (mode === 'scorer' && !showSaved && current !== null && (!state.setUp || editing)) {
    return (
      <SetupScreen
        // A new key per set or leg and per edit, so a fresh draft is made.
        key={`${viewNo}-${editing ? 'edit' : 'new'}`}
        code={code}
        courtName={courtName}
        setup={setup}
        total={slots.length}
        typeLabel={typeLabel(slot)}
        milestone={state.target}
        teams={teamColors}
        nameOf={nameOf}
        edit={editing ? { current: latestSetup(log)!, score: state.score } : undefined}
        previousState={previousState}
        matchHref={matchHref}
        onSave={(payload) => {
          dispatch({ kind: 'setup', payload });
          setEditing(false);
        }}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    );
  }

  const cells: StripCell[] = slots.map((s) => {
    if (s.slot_no === viewNo && !(phases[s.slot_no] === 'finished' || phases[s.slot_no] === 'final')) {
      return { slotNo: s.slot_no, kind: 'cur', score: null };
    }
    const score = finishedScore(match, slots, logs, s.slot_no, settings);
    if (score) return { slotNo: s.slot_no, kind: 'done', score };
    return { slotNo: s.slot_no, kind: 'pend', score: null };
  });

  let overlay: React.ReactNode = null;
  const lastRally = state.rallies.at(-1);
  if (current === null) {
    const result: Score = setsWon(match, slots, logs, settings);
    overlay = <DoneOverlay teams={teams} score={result} matchHref={matchHref} listHref="/admin/matches" />;
  } else if (showSaved) {
    const next = slots.find((s) => s.slot_no === current);
    overlay =
      mode === 'scorer' ? (
        <SavedOverlay
          relay={relay}
          slotNo={viewNo}
          score={state.score}
          next={{ slotNo: current, type: next ? typeLabel(next) : null }}
          onNext={() => setSavedNo(null)}
        />
      ) : null;
  } else if (mode === 'scorer' && state.changeEndsDue && lastRally) {
    overlay = (
      <ChangeEndsOverlay
        teams={teams}
        left={state.ends?.left ?? 'home'}
        reached={{ side: lastRally.side, score: lastRally.score[lastRally.side] }}
        onContinue={() => dispatch({ kind: 'ends_changed' })}
        onUndo={() => undoLast(state, dispatch)}
      />
    );
  } else if (mode === 'scorer' && state.ended && !state.confirmed && state.winnerSide) {
    overlay = (
      <EndOverlay
        teams={teams}
        relay={relay}
        slotNo={viewNo}
        target={state.target}
        eyebrow={
          relay
            ? t('legMid', { n: viewNo, total: slots.length, m: state.target })
            : t('setMid', { n: viewNo, type: typeLabel(slot) ?? '' })
        }
        score={state.score}
        winner={state.winnerSide}
        onConfirm={() => dispatch({ kind: 'end_confirmed' })}
        onUndo={() => undoLast(state, dispatch)}
      />
    );
  }

  return (
    <ScoringScreen
      mode={mode}
      code={code}
      courtName={courtName}
      matchHref={matchHref}
      relay={relay}
      slot={slot}
      setup={setup}
      state={state}
      teams={teams}
      nameOf={nameOf}
      typeLabel={typeLabel(slot)}
      cells={cells}
      milestones={settings.relay_milestones}
      pending={outbox.pending}
      wake={wake}
      scorerName={scorerName}
      fixing={mode === 'scorer' && wasReopened(log) && !state.confirmed}
      toast={toast}
      overlay={overlay}
      onPlus={(side: Side) => dispatch({ kind: 'point', payload: { side } })}
      onUndo={() => undoLast(state, dispatch)}
      onEditSetup={() => setEditing(true)}
      takeover={mode === 'viewer' && scorer ? { onConfirm: claim, pending: claiming } : undefined}
    />
  );
}

/** Cancels the last counted rally (L10): a new `undo` event, never a delete. */
function undoLast(state: LiveState, dispatch: (event: NewLiveEvent) => void) {
  const last = state.rallies.at(-1);
  if (last) dispatch({ kind: 'undo', payload: { seq: last.seq } });
}
