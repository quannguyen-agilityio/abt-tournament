'use client';

import { useLocale, useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import type { MemberType } from '@/domain/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { MAX_FEE_AMOUNT, MAX_PLAYER_NAME_LENGTH, MAX_SKILL_POINTS, type PlayerEditError } from '@/lib/season-players';
import {
  setPlayerFeePaid,
  setPlayerStatus,
  updateSeasonPlayer,
  type PlayerActionState,
  type PlayerEditState,
} from './actions';

export type PlayerRow = {
  id: string;
  fullName: string;
  gender: 'male' | 'female';
  rank: number;
  skillPoints: number;
  status: 'active' | 'withdrawn';
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  /** `null` when the player has no private row yet. */
  memberType: MemberType | null;
  feeAmount: number | null;
  paid: boolean;
};

type Team = { id: string; name: string; color: string };

const MEMBER_TYPES: MemberType[] = ['employee', 'intern', 'guest'];

const SELECT_CLASS =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-3 aria-invalid:ring-3';

const CELL = 'px-3 py-2 align-middle';

function errorsOf(state: PlayerEditState): PlayerEditError[] {
  return state && 'errors' in state ? state.errors : [];
}

function Hidden({ seasonId, playerId }: { seasonId: string; playerId: string }) {
  return (
    <>
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="seasonPlayerId" value={playerId} />
    </>
  );
}

function TeamChip({ name, color }: { name: string | null; color: string | null }) {
  const t = useTranslations('Admin.players');
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <span aria-hidden="true" className="size-2 rounded-full" style={color ? { backgroundColor: color } : undefined} />
      <span className="sr-only">{t('columns.team')}: </span>
      {name}
    </span>
  );
}

function ReadRow({
  seasonId,
  player,
  disabled,
  onEdit,
}: {
  seasonId: string;
  player: PlayerRow;
  disabled: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('Admin.players');
  const locale = useLocale() as 'vi' | 'en';
  const [paidState, paidAction, paidPending] = useActionState<PlayerActionState, FormData>(setPlayerFeePaid, undefined);
  const [statusState, statusAction, statusPending] = useActionState<PlayerActionState, FormData>(
    setPlayerStatus,
    undefined,
  );
  const withdrawn = player.status === 'withdrawn';
  const failed = (paidState && 'error' in paidState) || (statusState && 'error' in statusState);

  return (
    <>
      <tr className={`border-border border-t ${withdrawn ? 'text-muted-foreground' : ''}`}>
        <td className={`${CELL} font-medium`}>
          <span className="flex flex-wrap items-center gap-2">
            {player.fullName}
            {withdrawn && (
              <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                {t('withdrawn')}
              </span>
            )}
          </span>
        </td>
        <td className={CELL}>{t(`gender.${player.gender}`)}</td>
        <td className={`${CELL} tabular-nums`}>R{player.rank}</td>
        <td className={`${CELL} tabular-nums`}>{player.skillPoints}</td>
        <td className={CELL}>
          <TeamChip name={player.teamName} color={player.teamColor} />
        </td>
        <td className={CELL}>{player.memberType ? t(`memberType.${player.memberType}`) : '—'}</td>
        <td className={`${CELL} tabular-nums`}>
          {player.feeAmount === null ? '—' : formatMoney(player.feeAmount, locale)}
        </td>
        <td className={CELL}>
          <form action={paidAction}>
            <Hidden seasonId={seasonId} playerId={player.id} />
            <input type="hidden" name="paid" value={String(!player.paid)} />
            <input
              type="checkbox"
              className="size-4"
              checked={player.paid}
              disabled={disabled || paidPending}
              aria-label={t('paidLabel', { name: player.fullName })}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </form>
        </td>
        <td className={CELL}>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onEdit}>
              {t('edit')}
              <span className="sr-only"> {player.fullName}</span>
            </Button>
            <form action={statusAction}>
              <Hidden seasonId={seasonId} playerId={player.id} />
              <input type="hidden" name="status" value={withdrawn ? 'active' : 'withdrawn'} />
              <Button
                type="submit"
                size="sm"
                variant={withdrawn ? 'outline' : 'destructive'}
                disabled={disabled || statusPending}
              >
                {withdrawn ? t('reinstate') : t('withdraw')}
                <span className="sr-only"> {player.fullName}</span>
              </Button>
            </form>
          </div>
        </td>
      </tr>
      {failed && (
        <tr>
          <td colSpan={9} className="px-3 pb-2">
            <p role="alert" className="text-destructive text-sm">
              {t('errors.failed')}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function EditRow({
  seasonId,
  player,
  teams,
  maxRank,
  defaultFees,
  onDone,
}: {
  seasonId: string;
  player: PlayerRow;
  teams: Team[];
  maxRank: number;
  defaultFees: Record<MemberType, number>;
  onDone: () => void;
}) {
  const t = useTranslations('Admin.players');
  const formId = `edit-player-${player.id}`;
  const [state, action, pending] = useActionState<PlayerEditState, FormData>(async (prev, formData) => {
    const result = await updateSeasonPlayer(prev, formData);
    if (result && 'ok' in result && result.ok) onDone();
    return result;
  }, undefined);
  const [values, setValues] = useState({
    fullName: player.fullName,
    gender: player.gender,
    rank: String(player.rank),
    skillPoints: String(player.skillPoints),
    teamId: player.teamId ?? '',
    memberType: player.memberType ?? 'employee',
    feeAmount: String(player.feeAmount ?? defaultFees[player.memberType ?? 'employee']),
  });
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: { currentTarget: { value: string } }) => {
      const value = e.currentTarget.value;
      setValues((v) => ({ ...v, [key]: value }));
    },
  });
  const errors = errorsOf(state);
  const invalid = (field: PlayerEditError) => errors.includes(field) || undefined;
  const name = player.fullName;

  return (
    <>
      <tr className="border-border bg-muted/40 border-t">
        <td className={CELL}>
          <Input
            form={formId}
            name="fullName"
            {...field('fullName')}
            required
            maxLength={MAX_PLAYER_NAME_LENGTH}
            autoComplete="off"
            aria-label={t('aria.name', { name })}
            aria-invalid={invalid('fullName')}
            className="min-w-40"
          />
        </td>
        <td className={CELL}>
          <select
            form={formId}
            name="gender"
            {...field('gender')}
            aria-label={t('aria.gender', { name })}
            aria-invalid={invalid('gender')}
            className={SELECT_CLASS}
          >
            {(['male', 'female'] as const).map((g) => (
              <option key={g} value={g}>
                {t(`gender.${g}`)}
              </option>
            ))}
          </select>
        </td>
        <td className={CELL}>
          <Input
            form={formId}
            name="rank"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxRank}
            step={1}
            {...field('rank')}
            required
            aria-label={t('aria.rank', { name })}
            aria-invalid={invalid('rank')}
            className="w-16"
          />
        </td>
        <td className={CELL}>
          <Input
            form={formId}
            name="skillPoints"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SKILL_POINTS}
            step={1}
            {...field('skillPoints')}
            required
            aria-label={t('aria.skill', { name })}
            aria-invalid={invalid('skillPoints')}
            className="w-24"
          />
        </td>
        <td className={CELL}>
          <select
            form={formId}
            name="teamId"
            {...field('teamId')}
            aria-label={t('aria.team', { name })}
            aria-invalid={invalid('team')}
            className={SELECT_CLASS}
          >
            <option value="">{t('noTeam')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </td>
        <td className={CELL}>
          <select
            form={formId}
            name="memberType"
            value={values.memberType}
            aria-label={t('aria.memberType', { name })}
            aria-invalid={invalid('memberType')}
            className={SELECT_CLASS}
            // The fee follows the member type: start from the season's default for that type.
            onChange={(e) => {
              const memberType = e.currentTarget.value as MemberType;
              setValues((v) => ({ ...v, memberType, feeAmount: String(defaultFees[memberType] ?? 0) }));
            }}
          >
            {MEMBER_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`memberType.${type}`)}
              </option>
            ))}
          </select>
        </td>
        <td className={CELL}>
          <Input
            form={formId}
            name="feeAmount"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_FEE_AMOUNT}
            step={1}
            {...field('feeAmount')}
            required
            aria-label={t('aria.fee', { name })}
            aria-invalid={invalid('feeAmount')}
            className="w-32"
          />
        </td>
        <td className={CELL} />
        <td className={CELL}>
          <form
            id={formId}
            // Not `action`: React resets a form after its action, which would drop a failed edit.
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              startTransition(() => action(formData));
            }}
            className="flex items-center gap-2"
          >
            <Hidden seasonId={seasonId} playerId={player.id} />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t('saving') : t('save')}
              <span className="sr-only"> {name}</span>
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onDone}>
              {t('cancel')}
              <span className="sr-only"> {name}</span>
            </Button>
          </form>
        </td>
      </tr>
      {state && (errors.length > 0 || 'error' in state) && (
        <tr className="bg-muted/40">
          <td colSpan={9} className="px-3 pb-2">
            <ul role="alert" className="text-destructive flex flex-col gap-0.5 text-sm">
              {'error' in state ? (
                <li>{t('errors.failed')}</li>
              ) : (
                errors.map((field) => <li key={field}>{t(`errors.${field}`, { max: errorMax(field), maxRank })}</li>)
              )}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function errorMax(field: PlayerEditError): number {
  if (field === 'fullName') return MAX_PLAYER_NAME_LENGTH;
  if (field === 'skillPoints') return MAX_SKILL_POINTS;
  return MAX_FEE_AMOUNT;
}

export function PlayersTable({
  seasonId,
  players,
  teams,
  maxRank,
  defaultFees,
}: {
  seasonId: string;
  players: PlayerRow[];
  teams: Team[];
  maxRank: number;
  defaultFees: Record<MemberType, number>;
}) {
  const t = useTranslations('Admin.players');
  const [editingId, setEditingId] = useState<string | null>(null);

  if (players.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('empty')}</p>;
  }

  const columns = ['player', 'gender', 'rank', 'skill', 'team', 'memberType', 'fee', 'paid', 'actions'] as const;

  return (
    <div className="border-border bg-surface relative overflow-x-auto rounded-[10px] border">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm" aria-label={t('tableLabel')}>
        <thead>
          <tr className="text-muted-foreground text-xs uppercase">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2 font-medium">
                {t(`columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) =>
            editingId === player.id ? (
              <EditRow
                key={player.id}
                seasonId={seasonId}
                player={player}
                teams={teams}
                maxRank={maxRank}
                defaultFees={defaultFees}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <ReadRow
                key={player.id}
                seasonId={seasonId}
                player={player}
                disabled={editingId !== null}
                onEdit={() => setEditingId(player.id)}
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
