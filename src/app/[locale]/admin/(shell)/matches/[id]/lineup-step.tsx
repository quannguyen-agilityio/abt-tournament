'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useMemo, useState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import {
  validateLineup,
  type LineupRuleCode,
  type LineupSettings,
  type LineupViolation,
  type Side,
} from '@/domain/lineup';
import type { SeasonSettings, SlotType } from '@/domain/settings';
import {
  handicapPreview,
  overridable,
  slotOptions,
  unresolvedViolations,
  type LineupPlayer,
  type SlotPair,
} from '@/lib/match-lineup';
import { cn } from '@/lib/utils';
import { lockLineups, saveLineup, type LineupState, type LockState } from './actions';

export type LineupTeam = {
  team: { id: string; name: string; color: string };
  side: Side;
  /** Present players, by rank. */
  present: LineupPlayer[];
  /** Saved picks, in slot order. */
  saved: SlotPair[];
  /** Rules the BTC overrode for the saved lineup. */
  overridden: LineupRuleCode[];
};

export type LineupStepSettings = LineupSettings &
  Pick<SeasonSettings, 'group_handicap_cap' | 'ko_handicap_cap' | 'low_rank_range' | 'high_rank_range'>;

type Props = {
  matchId: string;
  stage: string;
  imported: boolean;
  slots: { slotNo: number; slotType: SlotType }[];
  /** Home first. */
  teams: [LineupTeam, LineupTeam];
  settings: LineupStepSettings;
  editable: boolean;
  isBtc: boolean;
};

const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 aria-invalid:border-loss aria-invalid:bg-loss/10 h-9 w-full min-w-0 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3 disabled:opacity-70';

const samePicks = (a: SlotPair[], b: SlotPair[]) => a.every((pair, i) => pair[0] === b[i][0] && pair[1] === b[i][1]);

/** Both lineups with live violations (spec §4.1) and a live handicap preview (§4.2, §4.3): A5 step 2. */
export function LineupStep({ matchId, stage, imported, slots, teams, settings, editable, isBtc }: Props) {
  const t = useTranslations('Admin.match.lineup');
  const [home, away] = teams;
  const [picks, setPicks] = useState<Record<Side, SlotPair[]>>(() => ({ home: home.saved, away: away.saved }));
  const relay = stage !== 'group';

  const slotPicks = useMemo(
    () => slots.map((s, i) => ({ ...s, home: picks.home[i], away: picks.away[i] })),
    [slots, picks],
  );
  const violations = useMemo(() => {
    const attendance = { home: home.present, away: away.present };
    const rows = slotPicks.map((s) => ({
      slot_no: s.slotNo,
      slot_type: s.slotType,
      home_p1: s.home[0],
      home_p2: s.home[1],
      away_p1: s.away[0],
      away_p2: s.away[1],
    }));
    return {
      home: validateLineup({ imported }, 'home', attendance, rows, settings),
      away: validateLineup({ imported }, 'away', attendance, rows, settings),
    };
  }, [slotPicks, home.present, away.present, imported, settings]);
  const preview = useMemo(() => {
    const skillOf = new Map([...home.present, ...away.present].map((p) => [p.id, p.skillPoints]));
    return handicapPreview(stage, slotPicks, skillOf, settings);
  }, [stage, slotPicks, home.present, away.present, settings]);

  // The saved lineup's overrides only cover it while it is unchanged.
  const dirty = { home: !samePicks(picks.home, home.saved), away: !samePicks(picks.away, away.saved) };
  const openOf = (team: LineupTeam) =>
    dirty[team.side] ? violations[team.side] : unresolvedViolations(violations[team.side], new Set(team.overridden));
  const open = { home: openOf(home), away: openOf(away) };
  const lockable = !dirty.home && !dirty.away && open.home.length === 0 && open.away.length === 0;

  const setPick = (side: Side, slotIndex: number, position: 0 | 1, playerId: string | null) =>
    setPicks((prev) => ({
      ...prev,
      [side]: prev[side].map((pair, i) => {
        if (i !== slotIndex) return pair;
        const next: SlotPair = [...pair];
        next[position] = playerId;
        return next;
      }),
    }));

  return (
    <div className="flex flex-col gap-4">
      {preview.kind === 'relay' && (
        <p role="status" className="border-border bg-surface rounded-[10px] border p-3 text-sm">
          {t('previewHandicap')}:{' '}
          {preview.start ? (
            <>
              <b className="font-display text-lg tabular-nums">
                {preview.start.home}–{preview.start.away}
              </b>{' '}
              <span className="text-muted-foreground tabular-nums">
                {t('relayNet', {
                  net: `${(preview.net ?? 0) > 0 ? '+' : ''}${preview.net}`,
                  cap: settings.ko_handicap_cap,
                })}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('relayPending')}</span>
          )}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {teams.map((team) => (
          <TeamLineupForm
            key={team.team.id}
            matchId={matchId}
            team={team}
            slots={slots}
            relay={relay}
            picks={picks[team.side]}
            starts={preview.kind === 'group' ? preview.slots.map((h) => (h ? h[team.side] : 0)) : slots.map(() => 0)}
            violations={violations[team.side]}
            open={open[team.side]}
            dirty={dirty[team.side]}
            settings={settings}
            editable={editable}
            isBtc={isBtc}
            onPick={(slotIndex, position, playerId) => setPick(team.side, slotIndex, position, playerId)}
          />
        ))}
      </div>
      {editable && <LockForm matchId={matchId} lockable={lockable} />}
    </div>
  );
}

/** A5 step 3: lock both lineups once each is saved and valid or overridden. */
function LockForm({ matchId, lockable }: { matchId: string; lockable: boolean }) {
  const t = useTranslations('Admin.match.lock');
  const [state, action, pending] = useActionState<LockState, FormData>(lockLineups, undefined);
  return (
    <form
      action={action}
      className="border-border bg-surface flex flex-wrap items-center justify-end gap-3 rounded-[10px] border p-4"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-muted-foreground mr-auto max-w-prose text-sm">{lockable ? t('hint') : t('notReady')}</p>
      {state?.error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <Button type="submit" disabled={pending || !lockable}>
        {pending ? t('locking') : t('lock')}
      </Button>
    </form>
  );
}

type FormProps = {
  matchId: string;
  team: LineupTeam;
  slots: Props['slots'];
  relay: boolean;
  picks: SlotPair[];
  /** This side's group start points per slot. */
  starts: number[];
  violations: LineupViolation[];
  /** The violations not covered by a BTC override. */
  open: LineupViolation[];
  /** The picks differ from the saved lineup. */
  dirty: boolean;
  settings: LineupStepSettings;
  editable: boolean;
  isBtc: boolean;
  onPick: (slotIndex: number, position: 0 | 1, playerId: string | null) => void;
};

function TeamLineupForm({
  matchId,
  team,
  slots,
  relay,
  picks,
  starts,
  violations,
  open,
  dirty,
  settings,
  editable,
  isBtc,
  onPick,
}: FormProps) {
  const t = useTranslations('Admin.match.lineup');
  const tv = useTranslations('Lineup.violations');
  const [state, action, pending] = useActionState<LineupState, FormData>(saveLineup, undefined);
  const [reason, setReason] = useState('');
  const headingId = `lineup-${team.team.id}`;
  const nameOf = new Map(team.present.map((p) => [p.id, p.name]));

  const accepted = !dirty && violations.length > 0 && open.length === 0;
  const canOverride = isBtc && overridable(violations);
  const blocked = violations.length > 0 && (!canOverride || reason.trim() === '');
  const slotHasProblem = (slotNo: number, playerId: string | null) =>
    open.some((v) => v.slotNo === slotNo && (!v.playerId || v.playerId === playerId));

  return (
    <form
      // Not `action`: React resets a form after an action, which would undo the controlled picks.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      aria-labelledby={headingId}
      className="border-border bg-surface flex min-w-0 flex-col rounded-[10px] border"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="teamId" value={team.team.id} />
      <div className="border-border flex items-center gap-2 border-b p-4">
        <h3 id={headingId} className="min-w-0">
          <TeamChip name={team.team.name} color={team.team.color} />
        </h3>
        <span
          role="status"
          className={cn(
            'ml-auto rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            open.length > 0
              ? 'text-loss border-loss/35 bg-loss/10'
              : accepted
                ? 'text-warn border-warn/35 bg-warn/10'
                : 'text-win border-win/35 bg-win/10',
          )}
        >
          {open.length > 0 ? t('violationCount', { count: open.length }) : accepted ? t('accepted') : t('valid')}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {slots.map((slot, i) => (
          <div
            key={slot.slotNo}
            className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-2 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_48px]"
          >
            <div className="flex flex-col">
              <b className="font-display">{t(relay ? 'leg' : 'set', { no: slot.slotNo })}</b>
              <span className={cn('text-xs', slot.slotType === 'open' ? 'text-muted-foreground' : 'text-primary')}>
                {t(`slotType.${slot.slotType}`)}
              </span>
            </div>
            {([0, 1] as const).map((position) => {
              const value = picks[i][position];
              const options = slotOptions(team.present, slot.slotType, settings, picks[i]);
              return (
                <select
                  key={position}
                  name={`slot-${slot.slotNo}-p${position + 1}`}
                  value={value ?? ''}
                  disabled={!editable}
                  aria-label={t('pickLabel', { slot: slot.slotNo, position: position + 1 })}
                  aria-invalid={slotHasProblem(slot.slotNo, value) || undefined}
                  onChange={(e) => onPick(i, position, e.target.value || null)}
                  className={SELECT}
                >
                  <option value="">{t('pick')}</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      R{p.rank} · {p.name} ({p.skillPoints})
                    </option>
                  ))}
                  {/* A saved pick of a player who is no longer present. */}
                  {value && !nameOf.has(value) && <option value={value}>{t('absent')}</option>}
                </select>
              );
            })}
            <span className="text-right">
              {starts[i] > 0 && (
                <span
                  title={t('startHint')}
                  className="font-display bg-shuttle/15 text-warn rounded px-1.5 text-[13px] font-semibold tabular-nums"
                >
                  +{starts[i]}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {open.length > 0 && (
        <div className="border-border flex flex-col gap-3 border-t p-4">
          <p className="text-loss text-xs font-semibold tracking-wide uppercase">{t('violations')}</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {open.map((v, i) => (
              <li key={`${v.code}-${v.slotNo ?? ''}-${v.playerId ?? ''}-${i}`} className="flex gap-2">
                <code className="text-muted-foreground shrink-0 pt-0.5 text-xs">{v.code}</code>
                <span>
                  {[
                    v.slotNo ? t(relay ? 'leg' : 'set', { no: v.slotNo }) : null,
                    v.playerId ? (nameOf.get(v.playerId) ?? t('absent')) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {(v.slotNo || v.playerId) && ': '}
                  {tv(v.code, v.params)}
                </span>
              </li>
            ))}
          </ul>
          {editable &&
            (canOverride ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t('overrideReason')}
                <textarea
                  name="overrideReason"
                  value={reason}
                  rows={2}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm font-normal outline-none focus-visible:ring-3"
                />
                <span className="text-muted-foreground text-xs font-normal">{t('overrideHint')}</span>
              </label>
            ) : (
              <p className="border-warn/40 bg-warn/10 rounded-lg border p-3 text-sm">
                {isBtc ? t('notOverridable') : t('refereeBlocked')}
              </p>
            ))}
        </div>
      )}

      {editable && (
        <div className="border-border mt-auto flex flex-wrap items-center justify-end gap-3 border-t p-4">
          {state && 'error' in state && (
            <p role="alert" className="text-destructive text-sm">
              {t(`errors.${state.error}`)}
            </p>
          )}
          {state && 'ok' in state && !dirty && (
            <p role="status" className="text-sm">
              <span className="text-win font-semibold">✓</span> {t('saved')}
            </p>
          )}
          <Button type="submit" disabled={pending || blocked || (!dirty && !reason)}>
            {pending ? t('saving') : violations.length > 0 && canOverride ? t('saveOverride') : t('save')}
          </Button>
        </div>
      )}
    </form>
  );
}
