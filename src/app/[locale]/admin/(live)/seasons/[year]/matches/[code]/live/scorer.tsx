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
  retirementPreview,
  scorerSlotSetup,
  serverCoversLocal,
  setsWon,
  slotPhases,
  wasReopened,
  type RetirementPreview,
  type ScorerLogs,
  type ScorerMatch,
  type ScorerSlot,
} from '@/lib/live-scorer';
import {
  ChangeEndsOverlay,
  DoneOverlay,
  EndOverlay,
  RetiredOverlay,
  RetireOverlay,
  SavedOverlay,
  TimeoutOverlay,
  UnsentOverlay,
  type Teams,
} from './overlays';
import { ScoringScreen, type StripCell } from './scoring-screen';
import { SetupScreen } from './setup-screen';
import { useLiveRealtime, useOutbox, useThrottledRefresh, type DropReason, type QueuedEvent } from './use-live-sync';
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
  /** Length of one medical timeout (§3, `medical_timeout_minutes`). */
  medicalTimeoutMinutes: number;
  teams: Teams;
  /** Player id to full name. */
  names: Record<string, string>;
  slots: ScorerSlot[];
  /** The stored log of each slot, by `slot_no`. */
  logs: Record<number, LiveEvent[]>;
  /** When the scorer tapped each stored event (`client_at`), by `slot_no` then `seq`: the timeout countdown. */
  eventTimes: Record<number, Record<number, string>>;
  viewerId: string;
  scorer: { id: string; name: string } | null;
};

/**
 * The live scorer screens (spec-phase-2 §8.1): set or leg setup (L-B), scoring (L-C), change of ends
 * (L-D), end of set or leg (L-E), medical timeout (L-F), retirement (L-G) and the read-only viewer
 * (L-H).
 *
 * The screen replays its own log, so a tap shows at once; the events go to the server in order, one
 * at a time, through a queue kept in IndexedDB (§8.1 Connection state), so taps made offline survive
 * a reload. Whenever new server data arrives with nothing left to send, the local log is replaced by
 * the server's, so the screen is `replay()` of the stored log. If the server refuses the queue, the
 * screen turns read-only and lists what was not sent.
 */
export function Scorer(props: ScorerProps) {
  const { matchId, code, courtName, match, settings, teams, names, slots, viewerId, scorer } = props;
  const { medicalTimeoutMinutes, eventTimes } = props;
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
  // The injury flow (§6): picking the injured player, then the retirement confirmation.
  const [injury, setInjury] = useState<'pick' | 'confirm' | null>(null);
  // What the confirmed retirement wrote, shown until the scorer moves on.
  const [retired, setRetired] = useState<RetirementPreview | null>(null);
  // When this screen sent each event, by `slot_no:seq`, until the server's `client_at` arrives.
  const [localTimes, setLocalTimes] = useState<Readonly<Record<string, string>>>({});
  // The queue the server refused, shown until the scorer closes it (§8.1 Connection state).
  const [unsent, setUnsent] = useState<{ reason: DropReason; items: QueuedEvent[] } | null>(null);
  const [claiming, startClaim] = useTransition();
  const logsRef = useRef<ScorerLogs>(props.logs);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const slotNoOf = (slotId: string) => propsRef.current.slots.find((s) => s.id === slotId)?.slot_no;
  const outbox = useOutbox(matchId, {
    // After the last event is stored, load the server's log (debounced: a burst of taps refreshes once).
    onDrained: () => {
      clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => router.refresh(), REFRESH_AFTER_SYNC_MS);
    },
    // The server refused the queue: read-only, the server's log, and the list of what was not sent.
    onDropped: (reason, items) => {
      setLocal(null);
      setRetired(null);
      setInjury(null);
      setEditing(false);
      setDemoted(true);
      setUnsent({ reason, items });
      router.refresh();
    },
    // The server log already holds the event when it has the same `seq` and tap time.
    isSent: (item) => {
      const slotNo = slotNoOf(item.slotId);
      const at = slotNo === undefined ? undefined : propsRef.current.eventTimes[slotNo]?.[item.expectedSeq];
      return at !== undefined && Date.parse(at) === Date.parse(item.clientAt);
    },
    // Taps left by an earlier page: shown on top of the server's log, then sent. Someone else holds
    // the lock now, so they are dropped and listed.
    onRestored: (items) => {
      if (propsRef.current.mode !== 'scorer') return false;
      const merged: Record<number, readonly LiveEvent[]> = { ...logsRef.current };
      const times: Record<string, string> = {};
      let changed = false;
      for (const item of items) {
        const slotNo = slotNoOf(item.slotId);
        if (slotNo === undefined) continue;
        const events = merged[slotNo] ?? NO_EVENTS;
        if (item.expectedSeq !== (events.at(-1)?.seq ?? 0) + 1) continue;
        merged[slotNo] = [...events, withSeq(item.event, item.expectedSeq)];
        if (item.event.kind === 'timeout_start') times[`${slotNo}:${item.expectedSeq}`] = item.clientAt;
        changed = true;
      }
      if (changed) {
        logsRef.current = merged;
        setLocal(merged);
        setLocalTimes((current) => ({ ...current, ...times }));
      }
      return true;
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
  const viewNo = retired ? retired.current.slotNo : showSaved ? savedNo : (current ?? lastNo);
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

  /** Appends an event to the local log and queues it; `false` when `replay()` refuses it. */
  const dispatch = (event: NewLiveEvent): boolean => {
    // Until the stored queue is restored, the next `seq` is not known.
    if (mode !== 'scorer' || !setup || !outbox.ready) return false;
    const events = logsRef.current[viewNo] ?? NO_EVENTS;
    const next = withSeq(event, (events.at(-1)?.seq ?? 0) + 1);
    if (!tryReplay(setup, [...events, next], settings).ok) return false;
    const updated = { ...logsRef.current, [viewNo]: [...events, next] };
    logsRef.current = updated;
    setLocal(updated);
    const clientAt = new Date().toISOString();
    if (event.kind === 'timeout_start') setLocalTimes((times) => ({ ...times, [`${viewNo}:${next.seq}`]: clientAt }));
    outbox.enqueue({ slotId: slot.id, slotNo: viewNo, expectedSeq: next.seq, event, clientAt });
    if (event.kind === 'end_confirmed') setSavedNo(viewNo);
    return true;
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

  if (mode === 'scorer' && !retired && !showSaved && current !== null && (!state.setUp || editing)) {
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
  const timeoutAt = state.timeout
    ? (eventTimes[viewNo]?.[state.timeout.seq] ?? localTimes[`${viewNo}:${state.timeout.seq}`] ?? null)
    : null;
  const canInjure =
    mode === 'scorer' && state.setUp && !state.ended && !state.timeout && !state.changeEndsDue && !state.confirmed;

  if (unsent) {
    overlay = (
      <UnsentOverlay
        reason={unsent.reason}
        items={unsent.items}
        relay={relay}
        teams={teams}
        nameOf={nameOf}
        onClose={() => {
          // The log changed under the queue: the scorer goes on from the server's log. The lock
          // moved: the screen stays read-only.
          if (unsent.reason === 'conflict') setDemoted(false);
          setUnsent(null);
        }}
      />
    );
  } else if (retired && mode === 'scorer') {
    const nextNo = current !== null && current !== retired.current.slotNo ? current : null;
    overlay = (
      <RetiredOverlay
        preview={retired}
        teams={teams}
        nameOf={nameOf}
        next={nextNo !== null ? { slotNo: nextNo, onNext: () => setRetired(null) } : null}
        matchHref={matchHref}
        listHref="/admin/matches"
      />
    );
  } else if (current === null) {
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
  } else if (mode === 'scorer' && state.timeout && injury === 'confirm') {
    const { player, side } = state.timeout;
    const preview = retirementPreview(match, slots, logs, settings, {
      side,
      player,
      slot_no: viewNo,
      score: state.score,
    });
    overlay = (
      <RetireOverlay
        preview={preview}
        teams={teams}
        nameOf={nameOf}
        onBack={() => setInjury(null)}
        onConfirm={() => {
          setInjury(null);
          if (dispatch({ kind: 'retire', payload: { player } })) setRetired(preview);
        }}
      />
    );
  } else if (mode === 'scorer' && (state.timeout || (injury === 'pick' && canInjure))) {
    overlay = (
      <TimeoutOverlay
        teams={teams}
        pairs={setup.pairs}
        nameOf={nameOf}
        minutes={medicalTimeoutMinutes}
        timeout={state.timeout ? { player: state.timeout.player, startedAt: timeoutAt } : null}
        onPick={(player) => dispatch({ kind: 'timeout_start', payload: { player } })}
        onCancel={() => setInjury(null)}
        onResume={() => {
          setInjury(null);
          dispatch({ kind: 'timeout_end' });
        }}
        onRetire={() => setInjury('confirm')}
      />
    );
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
      offline={outbox.offline}
      wake={wake}
      scorerName={scorerName}
      fixing={mode === 'scorer' && wasReopened(log) && !state.confirmed}
      toast={toast}
      overlay={overlay}
      onPlus={(side: Side) => dispatch({ kind: 'point', payload: { side } })}
      onUndo={() => undoLast(state, dispatch)}
      onEditSetup={() => setEditing(true)}
      onInjury={canInjure ? () => setInjury('pick') : null}
      takeover={mode === 'viewer' && scorer ? { onConfirm: claim, pending: claiming } : undefined}
    />
  );
}

/** Cancels the last counted rally (L10): a new `undo` event, never a delete. */
function undoLast(state: LiveState, dispatch: (event: NewLiveEvent) => void) {
  const last = state.rallies.at(-1);
  if (last) dispatch({ kind: 'undo', payload: { seq: last.seq } });
}
