'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SUB_RANK_TOLERANCE, type Side } from '@/domain/lineup';
import type { SlotPair } from '@/lib/match-lineup';
import { substitutePlayer, type SubstitutionState } from './actions';

export type SubstitutePlayerOption = { id: string; name: string; rank: number; present: boolean };

export type SubstituteTeam = {
  team: { id: string; name: string };
  side: Side;
  /** The active and the present players of the team. */
  players: SubstitutePlayerOption[];
};

export type SubstituteSlot = {
  slotNo: number;
  scored: boolean;
  /** The effective players, substitutions applied. */
  home: SlotPair;
  away: SlotPair;
};

type Props = {
  matchId: string;
  relay: boolean;
  slots: SubstituteSlot[];
  /** Home first. */
  teams: [SubstituteTeam, SubstituteTeam];
  isBtc: boolean;
};

const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full min-w-0 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3 disabled:opacity-70';
const INPUT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm font-normal outline-none focus-visible:ring-3';

/** Replaces a player of a set or leg that is not scored yet (spec §4.1, D18). */
export function SubstituteForm({ matchId, relay, slots, teams, isBtc }: Props) {
  const t = useTranslations('Admin.match.substitute');
  const tl = useTranslations('Admin.match.lineup');
  const tv = useTranslations('Lineup.violations');
  const [state, action, pending] = useActionState<SubstitutionState, FormData>(substitutePlayer, undefined);
  const [picked, setPicked] = useState({ teamId: teams[0].team.id, slotNo: 0, out: '', in: '' });
  const [reason, setReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const team = teams.find((x) => x.team.id === picked.teamId) ?? teams[0];
  const openSlots = slots.filter((s) => !s.scored);
  const slot = openSlots.find((s) => s.slotNo === picked.slotNo);
  const pair = slot ? slot[team.side] : null;
  const outIds = pair ? pair.filter((id): id is string => id !== null) : [];
  const playerOf = (id: string) => team.players.find((p) => p.id === id);
  const inOptions = team.players.filter((p) => !outIds.includes(p.id) && (p.present || isBtc));
  // After a saved substitution the page refreshes and the old picks no longer fit: they fall back to empty.
  const out = outIds.includes(picked.out) ? picked.out : '';
  const incoming = inOptions.some((p) => p.id === picked.in) ? picked.in : '';

  const outRank = playerOf(out)?.rank;
  const inRank = playerOf(incoming)?.rank;
  const rankBreak = outRank !== undefined && inRank !== undefined && Math.abs(outRank - inRank) > SUB_RANK_TOLERANCE;
  const blocked = rankBreak && (!isBtc || overrideReason.trim() === '');
  const ready = slot !== undefined && out !== '' && incoming !== '';

  return (
    <form
      // Not `action`: React resets a form after an action, which would undo the controlled picks.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      aria-labelledby="substitute-title"
      className="border-border bg-surface flex flex-col gap-3 rounded-[10px] border p-4"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <div>
        <h2 id="substitute-title" className="font-display text-lg font-bold uppercase">
          {t('title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('hint')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('team')}
          <select
            name="teamId"
            value={team.team.id}
            onChange={(e) => setPicked({ teamId: e.target.value, slotNo: 0, out: '', in: '' })}
            className={SELECT}
          >
            {teams.map((x) => (
              <option key={x.team.id} value={x.team.id}>
                {x.team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('slot')}
          <select
            name="slotNo"
            value={slot ? slot.slotNo : ''}
            onChange={(e) => setPicked({ ...picked, slotNo: Number(e.target.value), out: '', in: '' })}
            className={SELECT}
          >
            <option value="">{t('pickSlot')}</option>
            {openSlots.map((s) => (
              <option key={s.slotNo} value={s.slotNo}>
                {tl(relay ? 'leg' : 'set', { no: s.slotNo })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('out')}
          <select
            name="replacedId"
            value={out}
            disabled={!slot}
            onChange={(e) => setPicked({ ...picked, out: e.target.value })}
            className={SELECT}
          >
            <option value="">{t('pickPlayer')}</option>
            {outIds.map((id) => (
              <option key={id} value={id}>
                {playerOf(id) ? `R${playerOf(id)!.rank} · ${playerOf(id)!.name}` : '—'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('in')}
          <select
            name="substituteId"
            value={incoming}
            disabled={!slot}
            onChange={(e) => setPicked({ ...picked, in: e.target.value })}
            className={SELECT}
          >
            <option value="">{t('pickPlayer')}</option>
            {inOptions.map((p) => (
              <option key={p.id} value={p.id}>
                R{p.rank} · {p.name}
                {p.present ? '' : ` ${tl('absent')}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          {t('reason')}
          <input
            name="reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            className={INPUT}
          />
        </label>
      </div>

      {rankBreak &&
        (isBtc ? (
          <div className="border-warn/40 bg-warn/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <p>
              <code className="text-muted-foreground text-xs">SUB_RANK</code>{' '}
              {tv('SUB_RANK', { tolerance: SUB_RANK_TOLERANCE })}
            </p>
            <label className="flex flex-col gap-1 font-medium">
              {t('overrideReason')}
              <input
                name="overrideReason"
                value={overrideReason}
                maxLength={500}
                onChange={(e) => setOverrideReason(e.target.value)}
                className={INPUT}
              />
            </label>
          </div>
        ) : (
          <p className="border-warn/40 bg-warn/10 rounded-lg border p-3 text-sm">
            <code className="text-muted-foreground text-xs">SUB_RANK</code>{' '}
            {tv('SUB_RANK', { tolerance: SUB_RANK_TOLERANCE })} {t('refereeBlocked')}
          </p>
        ))}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {state && 'error' in state && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${state.error}`)}
          </p>
        )}
        {state && 'ok' in state && (
          <p role="status" className="text-sm">
            <span className="text-win font-semibold">✓</span> {t('saved')}
          </p>
        )}
        <Button type="submit" disabled={pending || !ready || blocked}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
