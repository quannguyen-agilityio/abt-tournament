'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AutoRefresh } from '@/components/auto-refresh';
import { LiveChip } from '@/components/live-chip';
import { ShuttleIcon } from '@/components/shuttle-icon';
import type { Side } from '@/domain/lineup';
import type { LiveEventKind, LiveState } from '@/domain/live';
import { REFRESH_INTERVAL_MS } from '@/lib/auto-refresh';
import {
  appendLiveEvent,
  currentLiveSlot,
  mergeLogs,
  timeoutLeft,
  toTimedEvent,
  wormOf,
  type LivePanelData,
  type TimedLiveEvent,
  type Worm,
} from '@/lib/public-live-panel';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Team = { name: string; color: string };
type Logs = Record<string, readonly TimedLiveEvent[]>;

const SIDES: readonly Side[] = ['home', 'away'];
const PANEL = 'border-border bg-surface rounded-[10px] border';
const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const EYEBROW = 'text-muted-foreground text-xs font-semibold tracking-wider uppercase';
/** Events that change the stored scores or the slot rows: the page reads them again. */
const RELOAD: ReadonlySet<LiveEventKind> = new Set(['end_confirmed', 'reopened', 'retire']);
/** `revalidateTag` runs right after the event is written; give it a moment before the refresh. */
const RELOAD_DELAY_MS = 1500;

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Keeps the logs in step with the server (spec-phase-2 §8.2): every insert into `live_event` for the
 * match's slots comes through Supabase Realtime, through RLS. A lost message (a gap in `seq`) or a
 * reconnect reads the logs again. `connected` is false once the channel failed, and the panel falls
 * back to the 30 s refresh.
 */
function useLiveLogs(data: LivePanelData) {
  const router = useRouter();
  const [local, setLocal] = useState<Logs>({});
  const [connected, setConnected] = useState(true);
  const reload = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slotIds = data.slots.map((s) => s.id).join(',');

  // A refresh can bring an older snapshot than realtime did, so keep whichever copy goes further.
  const logs = useMemo(() => mergeLogs(data.logs, local), [data.logs, local]);
  // What the realtime handler appends to: the page's logs plus what came since, updated at once so
  // two messages in a row both find the event before them.
  const latest = useRef<Logs>(logs);
  useEffect(() => {
    latest.current = mergeLogs(latest.current, logs);
  }, [logs]);

  const refetch = useCallback(async (ids: readonly string[]) => {
    if (ids.length === 0) return;
    const { data: rows, error } = await createClient()
      .from('live_event')
      .select('match_slot_id, seq, kind, payload, client_at')
      .in('match_slot_id', ids)
      .order('seq');
    if (error || !rows) return;
    const fresh: Record<string, TimedLiveEvent[]> = {};
    for (const row of rows) (fresh[row.match_slot_id] ??= []).push(toTimedEvent(row));
    latest.current = mergeLogs(latest.current, fresh);
    setLocal((current) => mergeLogs(current, fresh));
  }, []);

  useEffect(() => {
    const ids = slotIds.split(',');
    const supabase = createClient();
    const channel = supabase
      .channel(`public-live-${ids[0]}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_event', filter: `match_slot_id=in.(${slotIds})` },
        (message) => {
          const row = message.new as {
            match_slot_id: string;
            seq: number;
            kind: LiveEventKind;
            payload: unknown;
            client_at: string;
          };
          const id = row.match_slot_id;
          const base = latest.current[id] ?? [];
          const next = appendLiveEvent(base, toTimedEvent(row));
          if (next.gap) {
            void refetch([id]);
          } else if (next.log !== base) {
            latest.current = { ...latest.current, [id]: next.log };
            setLocal((current) => mergeLogs(current, { [id]: next.log }));
          }
          if (RELOAD.has(row.kind)) {
            clearTimeout(reload.current);
            reload.current = setTimeout(() => router.refresh(), RELOAD_DELAY_MS);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          // Catch up once subscribed: the page's data comes from a cache that can be a few seconds
          // old, and events written while the channel was down never come through it.
          void refetch(ids);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false);
        }
      });
    return () => {
      clearTimeout(reload.current);
      void supabase.removeChannel(channel);
    };
  }, [slotIds, refetch, router]);

  // While the channel is down, the 30 s refresh brings the server's logs; read them directly as well,
  // since the page's own data can be a few seconds behind.
  useEffect(() => {
    if (connected) return;
    const ids = slotIds.split(',');
    const timer = setInterval(() => void refetch(ids), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, slotIds, refetch]);

  return { logs, connected };
}

/** The clock, ticking every second while `on`; `null` until mounted, so the server render has no time in it. */
function useNow(on: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/**
 * P4 live panel (spec-phase-2 §8.2): the score, the server, the change of ends or the timeout, and
 * the rally timeline of the set or leg being played. Renders nothing between two sets, while still
 * listening, so the next set shows as soon as it starts.
 */
export function LivePanel({
  data,
  teams,
  names,
}: {
  data: LivePanelData;
  teams: Record<Side, Team | undefined>;
  /** Player names by id, for the pairs on court. */
  names: Record<string, string>;
}) {
  const t = useTranslations('Public.live');
  const { logs, connected } = useLiveLogs(data);
  const current = currentLiveSlot(data, logs);
  const timeoutEvent = current?.state.timeout
    ? current.log.find((e) => e.seq === current.state.timeout!.seq)
    : undefined;
  const now = useNow(Boolean(timeoutEvent));

  if (!current || !current.slot.setup) {
    return connected ? null : <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />;
  }
  const { slot, state } = current;
  const setup = slot.setup!;
  const relay = data.relay;
  const nameOf = (id: string | null) => (id ? (names[id] ?? '—') : '—');
  const teamName = (side: Side) => teams[side]?.name ?? '—';

  let chip;
  if (state.retired) {
    chip = <span className={cn(CHIP, 'border-loss/40 bg-loss/10 text-loss')}>{t('retired')}</span>;
  } else if (state.timeout) {
    chip = (
      <span className={cn(CHIP, 'border-warn/40 bg-warn/10 text-warn')}>
        {t('medical', { player: nameOf(state.timeout.player) })}
        {timeoutEvent && now !== null && (
          <span className="tabular-nums">
            {' · '}
            {mmss(timeoutLeft(timeoutEvent.at, data.settings.medical_timeout_minutes, now))}
          </span>
        )}
      </span>
    );
  } else if (state.changeEndsDue) {
    chip = <span className={cn(CHIP, 'bg-brand-soft text-primary border-transparent')}>{t('endsChange')}</span>;
  } else if (state.ended) {
    chip = <span className={cn(CHIP, 'border-win/40 bg-win/10 text-win')}>{t(relay ? 'endedLeg' : 'ended')}</span>;
  } else {
    chip = <LiveChip />;
  }

  return (
    <div className="mb-6 flex flex-col gap-4">
      <section aria-label={t('title')} className={cn(PANEL, 'p-4')}>
        <div className="flex flex-wrap items-center gap-2">
          {chip}
          <span className={cn(CHIP, 'border-border bg-surface-2 text-muted-foreground')}>
            {t(relay ? 'legN' : 'setN', { n: slot.slotNo })}
          </span>
          {!relay &&
            SIDES.filter((side) => setup.start[side] > 0).map((side) => (
              <span
                key={side}
                className="font-display bg-shuttle/15 text-warn rounded px-1.5 text-[13px] font-semibold"
              >
                {teamName(side)} +{setup.start[side]}
              </span>
            ))}
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <TeamScore side="home" team={teams.home} state={state} names={nameOf} pair={setup.pairs.home} />
          <div className="flex flex-col items-center gap-0.5 px-0.5">
            <span className={EYEBROW}>{relay ? t('milestone') : t('setsWon')}</span>
            <span className="font-display text-[28px] leading-none font-bold tabular-nums">
              {relay ? state.target : `${data.setsWon.home}–${data.setsWon.away}`}
            </span>
          </div>
          <TeamScore side="away" team={teams.away} state={state} names={nameOf} pair={setup.pairs.away} />
        </div>
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className={cn('size-[7px] rounded-full', connected ? 'bg-win motion-safe:animate-pulse' : 'bg-warn')}
          />
          {connected ? t('note') : t('noteFallback', { seconds: REFRESH_INTERVAL_MS / 1000 })}
        </p>
        <p className="sr-only" aria-live="polite">
          {t('scoreAria', {
            home: teamName('home'),
            homeScore: state.score.home,
            away: teamName('away'),
            awayScore: state.score.away,
          })}
        </p>
        {!connected && <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />}
      </section>

      <section className={cn(PANEL, 'p-4')}>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-display text-2xl font-bold uppercase">
            {t(relay ? 'wormLeg' : 'worm', { n: slot.slotNo })}
          </h2>
          <span className="text-muted-foreground text-sm">{t('wormSub')}</span>
        </div>
        <WormChart
          worm={wormOf(setup, state.rallies, data.settings.set_target)}
          teams={teams}
          label={t(relay ? 'wormLeg' : 'worm', { n: slot.slotNo })}
        />
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {SIDES.map((side) => (
            <span key={side} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: teams[side]?.color }} />
              {teamName(side)}
            </span>
          ))}
          {!relay && (
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="border-primary inline-block w-4 border-t-2 border-dashed" />
              {t('endsChange')}
            </span>
          )}
          {SIDES.filter((side) => setup.start[side] > 0).map((side) => (
            <span key={side} className="font-display bg-shuttle/15 text-warn rounded px-1.5 text-[13px] font-semibold">
              {t('startPoints', { team: teamName(side), n: setup.start[side] })}
            </span>
          ))}
          <span>{t('rallies', { n: state.rallies.length })}</span>
        </div>
      </section>
    </div>
  );
}

function TeamScore({
  side,
  team,
  state,
  names,
  pair,
}: {
  side: Side;
  team: Team | undefined;
  state: LiveState;
  names: (id: string | null) => string;
  pair: readonly [string, string];
}) {
  const t = useTranslations('Public.live');
  const serving = state.servingSide === side;
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl border-t-4 px-1.5 py-2.5 text-center"
      style={{
        borderTopColor: serving ? team?.color : 'transparent',
        backgroundColor: team ? `color-mix(in srgb, ${team.color} 8%, var(--surface))` : undefined,
      }}
    >
      <span className="inline-flex max-w-full items-center gap-1.5 text-[15px] font-bold">
        <span aria-hidden className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: team?.color }} />
        <span className="leading-tight text-balance">{team?.name ?? '—'}</span>
      </span>
      <span className="text-muted-foreground flex max-w-full flex-col text-xs sm:flex-row sm:gap-1">
        {pair.map((id, i) => (
          <span key={id} className="truncate">
            {i > 0 && <span className="hidden sm:inline">· </span>}
            {names(id)}
          </span>
        ))}
      </span>
      <span className="font-display text-[clamp(64px,17vw,128px)] leading-[0.95] font-extrabold tabular-nums">
        {state.score[side]}
      </span>
      <span className="text-warn inline-flex min-h-[22px] max-w-full items-center justify-center gap-1.5 text-xs font-semibold">
        {serving && (
          <>
            <ShuttleIcon className="shrink-0" />
            <span className="line-clamp-2">{t('servingName', { name: names(state.server) })}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** The score worm: the lead after every rally, above the line for home, below for away. */
function WormChart({ worm, teams, label }: { worm: Worm; teams: Record<Side, Team | undefined>; label: string }) {
  const t = useTranslations('Public.live');
  const W = 520;
  const H = 270;
  const [pl, pr, pt, pb] = [34, 10, 18, 26];
  const n = worm.sides.length;
  const xmax = Math.max(40, n + 6);
  const ymax = Math.max(12, Math.ceil(Math.max(...worm.diffs.map(Math.abs)) / 4) * 4);
  const sx = (x: number) => pl + (x / xmax) * (W - pl - pr);
  const sy = (d: number) => pt + ((ymax - d) / (2 * ymax)) * (H - pt - pb);
  const y0 = sy(0);
  const points = worm.diffs.map((d, i) => `${sx(i).toFixed(1)},${sy(d).toFixed(1)}`);
  const area = `M${sx(0)},${y0} L${points.join(' L')} L${sx(n)},${y0}Z`;
  const last = worm.diffs.length - 1;
  const homeColor = teams.home?.color ?? 'currentColor';
  const awayColor = teams.away?.color ?? 'currentColor';
  const id = useId();
  const clipUp = `${id}-up`;
  const clipDown = `${id}-down`;
  const grid = [];
  for (let d = -ymax; d <= ymax; d += 4) grid.push(d);
  const ticks = [];
  for (let x = 0; x <= xmax; x += 10) ticks.push(x);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="mx-auto mt-2 block h-auto w-full max-w-[620px]"
    >
      <defs>
        <clipPath id={clipUp}>
          <rect x="0" y="0" width={W} height={y0} />
        </clipPath>
        <clipPath id={clipDown}>
          <rect x="0" y={y0} width={W} height={H} />
        </clipPath>
      </defs>
      <g className="fill-muted-foreground text-[12.5px]">
        {grid.map((d) => (
          <g key={d}>
            <line
              x1={pl}
              x2={W - pr}
              y1={sy(d)}
              y2={sy(d)}
              className={d === 0 ? 'stroke-foreground/50' : 'stroke-border'}
              strokeWidth={d === 0 ? 1.2 : 1}
            />
            <text x={pl - 6} y={sy(d) + 3.5} textAnchor="end">
              {d > 0 ? `+${d}` : d}
            </text>
          </g>
        ))}
        {ticks.map((x) => (
          <text key={x} x={sx(x)} y={H - 8} textAnchor="middle">
            {x}
          </text>
        ))}
      </g>
      <path d={area} clipPath={`url(#${clipUp})`} fill={homeColor} fillOpacity={0.16} />
      <path d={area} clipPath={`url(#${clipDown})`} fill={awayColor} fillOpacity={0.16} />
      {worm.endsAt !== null && (
        <g className="stroke-primary fill-primary">
          <line x1={sx(worm.endsAt)} x2={sx(worm.endsAt)} y1={pt} y2={H - pb} strokeWidth={1.3} strokeDasharray="4 3" />
          <text x={sx(worm.endsAt) + 4} y={pt + 10} stroke="none" className="text-[12.5px] font-bold">
            {t('endsChange')}
          </text>
        </g>
      )}
      {worm.diffs[0] !== 0 && (
        <circle cx={sx(0)} cy={sy(worm.diffs[0])} r={4} fill="none" className="stroke-primary" strokeWidth={1.6} />
      )}
      {worm.sides.map((side, i) => (
        <line
          key={i}
          x1={sx(i).toFixed(1)}
          y1={sy(worm.diffs[i]).toFixed(1)}
          x2={sx(i + 1).toFixed(1)}
          y2={sy(worm.diffs[i + 1]).toFixed(1)}
          stroke={side === 'home' ? homeColor : awayColor}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      ))}
      <circle cx={sx(last)} cy={sy(worm.diffs[last])} r={4.5} className="fill-foreground" />
      <text x={pl + 4} y={pt - 3} fill={homeColor} className="text-[12.5px] font-bold">
        ↑ {t('wormUp', { team: teams.home?.name ?? '—' })}
      </text>
      <text x={pl + 4} y={H - pb - 4} fill={awayColor} className="text-[12.5px] font-bold">
        ↓ {t('wormUp', { team: teams.away?.name ?? '—' })}
      </text>
    </svg>
  );
}
