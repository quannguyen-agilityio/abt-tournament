'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import {
  AWARD_WINNER_KINDS,
  MAX_AWARD_CRITERIA_LENGTH,
  MAX_AWARD_NAME_LENGTH,
  MAX_AWARD_NOTE_LENGTH,
  MAX_AWARD_SPONSOR_LENGTH,
} from '@/lib/award-admin';
import type { AwardWinnerKind } from '@/lib/public-awards';
import { addAwardWinner, deleteAward, removeAwardWinner, saveAward, type AwardFormFields } from './actions';

const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full min-w-0 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3 disabled:opacity-70';
const TEXTAREA =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 min-h-16 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3';
const CHIP = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

type Team = { id: string; name: string; color: string };
type Player = { id: string; name: string; teamId: string | null };
type Match = { id: string; code: string; homeTeamId: string | null; awayTeamId: string | null };

/** The award's saved fields, as the form shows them. */
export type AwardFormValues = AwardFormFields & { id: string };

/** Creates or edits an award (spec §6 A7): name and criteria in VI with optional EN, sponsor, value, note. */
export function AwardForm({
  seasonId,
  year,
  award,
}: {
  seasonId: string;
  year: number;
  award: AwardFormValues | null;
}) {
  const t = useTranslations('Admin.awards.form');
  const [state, action, pending] = useActionState(saveAward, undefined);
  const error = state && 'error' in state ? state.error : undefined;
  // React resets the form after the action, so a failed submit refills it from the returned fields.
  const fields = state && 'fields' in state ? state.fields : award;
  const value = (name: keyof AwardFormFields) => fields?.[name] ?? '';

  return (
    <form action={action} aria-labelledby="award-form-title" className="flex flex-col gap-4">
      <h2 id="award-form-title" className="font-display text-2xl font-bold uppercase">
        {award ? t('editTitle') : t('newTitle')}
      </h2>
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="awardId" value={award?.id ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="award-name-vi">{t('nameVi')}</Label>
          <Input
            id="award-name-vi"
            name="nameVi"
            defaultValue={value('nameVi')}
            required
            maxLength={MAX_AWARD_NAME_LENGTH}
            autoComplete="off"
            aria-invalid={error === 'name' || undefined}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="award-name-en">{t('nameEn')}</Label>
          <Input
            id="award-name-en"
            name="nameEn"
            defaultValue={value('nameEn')}
            maxLength={MAX_AWARD_NAME_LENGTH}
            autoComplete="off"
            aria-describedby="award-en-hint"
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="award-criteria-vi">{t('criteriaVi')}</Label>
          <textarea
            id="award-criteria-vi"
            name="criteriaVi"
            defaultValue={value('criteriaVi')}
            rows={2}
            maxLength={MAX_AWARD_CRITERIA_LENGTH}
            className={TEXTAREA}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="award-criteria-en">{t('criteriaEn')}</Label>
          <textarea
            id="award-criteria-en"
            name="criteriaEn"
            defaultValue={value('criteriaEn')}
            rows={2}
            maxLength={MAX_AWARD_CRITERIA_LENGTH}
            aria-describedby="award-en-hint"
            className={TEXTAREA}
          />
        </div>
        <p id="award-en-hint" className="text-muted-foreground -mt-1 text-xs sm:col-span-2">
          {t('enHint')}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="award-sponsor">{t('sponsor')}</Label>
          <Input
            id="award-sponsor"
            name="sponsor"
            defaultValue={value('sponsor')}
            maxLength={MAX_AWARD_SPONSOR_LENGTH}
            autoComplete="off"
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="award-value">{t('value')}</Label>
          <Input
            id="award-value"
            name="value"
            defaultValue={value('value')}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={error === 'value' || undefined}
            aria-describedby="award-value-hint"
            className="h-9 tabular-nums"
          />
          <span id="award-value-hint" className="text-muted-foreground text-xs">
            {t('valueHint')}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="award-note">{t('note')}</Label>
        <textarea
          id="award-note"
          name="note"
          defaultValue={value('note')}
          rows={2}
          maxLength={MAX_AWARD_NOTE_LENGTH}
          aria-describedby="award-note-hint"
          className={TEXTAREA}
        />
        <span id="award-note-hint" className="text-muted-foreground text-xs">
          {t('noteHint')}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${error}`)}
          </p>
        )}
        {state && 'ok' in state && (
          <p role="status" className="text-win text-sm">
            {t('saved')}
          </p>
        )}
        {!award && (
          <Link href={`/admin/seasons/${year}/awards`} className={buttonVariants({ variant: 'outline' })}>
            {t('cancel')}
          </Link>
        )}
        <Button type="submit" pending={pending}>
          {pending ? t('saving') : award ? t('save') : t('create')}
        </Button>
      </div>
    </form>
  );
}

/** Deletes an award and its winners, after a confirmation. */
export function DeleteAwardForm({ awardId, year, name }: { awardId: string; year: number; name: string }) {
  const t = useTranslations('Admin.awards.form');
  const [state, action, pending] = useActionState(deleteAward, undefined);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(t('deleteConfirm', { name }))) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="awardId" value={awardId} />
      <input type="hidden" name="year" value={year} />
      <Button type="submit" variant="destructive" size="sm" pending={pending}>
        {pending ? t('deleting') : t('delete')}
      </Button>
      {state && 'error' in state && (
        <p role="alert" className="text-destructive text-sm">
          {t('deleteFailed')}
        </p>
      )}
    </form>
  );
}

export type WinnerItem = {
  id: string;
  kind: AwardWinnerKind;
  team: Team | null;
  players: string[];
  matchCode: string | null;
  note: string | null;
};

/** One winner with its Remove button. */
export function WinnerRow({ winner }: { winner: WinnerItem }) {
  const t = useTranslations('Admin.awards.winners');
  const [state, action, pending] = useActionState(removeAwardWinner, undefined);
  const label = winner.kind === 'team' ? (winner.team?.name ?? '?') : winner.players.join(' + ');

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
      <span className={`${CHIP} border-border text-muted-foreground`}>{t(`kinds.${winner.kind}`)}</span>
      {winner.kind === 'team' ? (
        winner.team && <TeamChip name={winner.team.name} color={winner.team.color} />
      ) : (
        <span className="font-semibold">{label}</span>
      )}
      {winner.kind !== 'team' && winner.team && (
        <TeamChip name={winner.team.name} color={winner.team.color} className="text-muted-foreground text-xs" />
      )}
      {winner.matchCode && (
        <span className="text-muted-foreground text-xs">{t('matchCode', { code: winner.matchCode })}</span>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!window.confirm(t('removeConfirm', { name: label }))) return;
          const formData = new FormData(e.currentTarget);
          startTransition(() => action(formData));
        }}
        className="ml-auto"
      >
        <input type="hidden" name="winnerId" value={winner.id} />
        <Button type="submit" size="sm" variant="outline" pending={pending}>
          {t('remove')}
          <span className="sr-only"> {label}</span>
        </Button>
      </form>
      {winner.note && <span className="text-muted-foreground w-full text-xs">{winner.note}</span>}
      {state && 'error' in state && (
        <p role="alert" className="text-destructive w-full text-sm">
          {t('errors.failed')}
        </p>
      )}
    </li>
  );
}

function PlayerOptions({ players, teams, noTeam }: { players: Player[]; teams: Team[]; noTeam: string }) {
  const groups = [
    ...teams.map((team) => ({ key: team.id, label: team.name, players: players.filter((p) => p.teamId === team.id) })),
    { key: 'none', label: noTeam, players: players.filter((p) => p.teamId === null) },
  ].filter((g) => g.players.length > 0);
  return groups.map((g) => (
    <optgroup key={g.key} label={g.label}>
      {g.players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </optgroup>
  ));
}

/**
 * Adds a winner (spec §6 A7): pick the kind, then 1 player, 2 players of one team, or a team, and an
 * optional related match among that team's matches.
 */
export function AddWinnerForm({
  awardId,
  players,
  teams,
  matches,
}: {
  awardId: string;
  players: Player[];
  teams: Team[];
  matches: Match[];
}) {
  const t = useTranslations('Admin.awards.winners');
  const [state, action, pending] = useActionState(addAwardWinner, undefined);
  const [kind, setKind] = useState<AwardWinnerKind>('player');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [team, setTeam] = useState('');
  const [match, setMatch] = useState('');

  const teamById = new Map(teams.map((x) => [x.id, x]));
  const firstPlayer = players.find((p) => p.id === first);
  // The team the winner counts for, which narrows the partner and the related match.
  const winnerTeam = kind === 'team' ? team || null : (firstPlayer?.teamId ?? null);
  const partners = firstPlayer ? players.filter((p) => p.id !== first && p.teamId === firstPlayer.teamId) : players;
  const matchOptions = winnerTeam
    ? matches.filter((m) => m.homeTeamId === winnerTeam || m.awayTeamId === winnerTeam)
    : matches;
  const matchValue = matchOptions.some((m) => m.id === match) ? match : '';
  const secondValue = partners.some((p) => p.id === second) ? second : '';
  const teamName = (id: string | null) => (id ? (teamById.get(id)?.name ?? '?') : '?');

  return (
    <form
      action={action}
      aria-label={t('add')}
      className="border-border flex flex-col gap-3 rounded-[10px] border border-dashed p-3"
    >
      <input type="hidden" name="awardId" value={awardId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="winner-kind">{t('kind')}</Label>
          <select
            id="winner-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AwardWinnerKind)}
            className={SELECT}
          >
            {AWARD_WINNER_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>

        {kind === 'team' ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="winner-team">{t('team')}</Label>
            <select
              id="winner-team"
              name="team"
              value={team}
              required
              onChange={(e) => setTeam(e.target.value)}
              className={SELECT}
            >
              <option value="">{t('choose')}</option>
              {teams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className={`flex flex-col gap-1.5 ${kind === 'player' ? 'sm:col-span-2' : ''}`}>
              <Label htmlFor="winner-member-1">{kind === 'pair' ? t('player1') : t('player')}</Label>
              <select
                id="winner-member-1"
                name="member"
                value={first}
                required
                onChange={(e) => setFirst(e.target.value)}
                className={SELECT}
              >
                <option value="">{t('choose')}</option>
                <PlayerOptions players={players} teams={teams} noTeam={t('noTeam')} />
              </select>
            </div>
            {kind === 'pair' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="winner-member-2">{t('player2')}</Label>
                <select
                  id="winner-member-2"
                  name="member"
                  value={secondValue}
                  required
                  onChange={(e) => setSecond(e.target.value)}
                  className={SELECT}
                >
                  <option value="">{t('choose')}</option>
                  <PlayerOptions players={partners} teams={teams} noTeam={t('noTeam')} />
                </select>
              </div>
            )}
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="winner-match">{t('match')}</Label>
          <select
            id="winner-match"
            name="match"
            value={matchValue}
            onChange={(e) => setMatch(e.target.value)}
            aria-describedby="winner-match-hint"
            className={SELECT}
          >
            <option value="">{t('noMatch')}</option>
            {matchOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.homeTeamId && m.awayTeamId
                  ? `${m.code} · ${teamName(m.homeTeamId)} – ${teamName(m.awayTeamId)}`
                  : m.code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="winner-note">{t('note')}</Label>
          <Input id="winner-note" name="note" maxLength={MAX_AWARD_NOTE_LENGTH} autoComplete="off" className="h-9" />
        </div>
        <p id="winner-match-hint" className="text-muted-foreground -mt-1 text-xs sm:col-span-3">
          {t('matchHint')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {state && 'error' in state && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${state.error}`)}
          </p>
        )}
        <Button type="submit" size="sm" pending={pending}>
          {pending ? t('adding') : t('add')}
        </Button>
      </div>
    </form>
  );
}
