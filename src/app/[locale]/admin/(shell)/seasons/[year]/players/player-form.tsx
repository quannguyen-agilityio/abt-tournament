'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, useState, type ReactElement, type ReactNode } from 'react';
import type { MemberType } from '@/domain/settings';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MAX_FEE_AMOUNT, MAX_PLAYER_NAME_LENGTH, MAX_SKILL_POINTS } from '@/lib/season-players';
import {
  createSeasonPlayer,
  updateSeasonPlayer,
  type PersonMatch,
  type PlayerCreateError,
  type PlayerCreateState,
} from './actions';
import type { PlayerRow } from './players-table';

export type Team = { id: string; name: string; color: string };

const MEMBER_TYPES: MemberType[] = ['employee', 'intern', 'guest'];

const SELECT_CLASS =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-3 aria-invalid:ring-3';

type FormProps = {
  seasonId: string;
  teams: Team[];
  maxRank: number;
  defaultFees: Record<MemberType, number>;
};

function errorMax(field: PlayerCreateError): number {
  if (field === 'fullName') return MAX_PLAYER_NAME_LENGTH;
  if (field === 'skillPoints') return MAX_SKILL_POINTS;
  return MAX_FEE_AMOUNT;
}

/** A labelled field with its error underneath, tied to the control by `aria-describedby`. */
function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error: string | null;
  className?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>
      {label}
      {children(error ? id : undefined)}
      {error && (
        <span id={id} className="text-destructive text-sm font-normal">
          {error}
        </span>
      )}
    </label>
  );
}

/** Asks whether the new player is one of the persons who share the name, or someone new. */
function PersonChoice({ matches }: { matches: PersonMatch[] }) {
  const t = useTranslations('Admin.players.match');
  return (
    <fieldset className="border-border flex flex-col gap-2 rounded-[10px] border p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-semibold">{t('title')}</legend>
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      {matches.map((match) => (
        <label key={match.id} className="flex items-start gap-2 text-sm">
          <input type="radio" name="personId" value={match.id} required disabled={match.inSeason} className="mt-1" />
          <span className={match.inSeason ? 'text-muted-foreground' : undefined}>
            <span className="font-medium">{match.fullName}</span> · {match.slug}
            <br />
            <span className="text-muted-foreground">
              {match.inSeason
                ? t('inSeason')
                : match.years.length > 0
                  ? t('played', { years: match.years.join(', ') })
                  : t('noSeasons')}
            </span>
          </span>
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="radio" name="personId" value="new" required />
        {t('new')}
      </label>
    </fieldset>
  );
}

/**
 * The player fields, for a new player or an existing one. It mounts with its dialog, so every opening
 * starts from the player (or the defaults), and it calls `onDone` once the action succeeds.
 */
function PlayerForm({
  seasonId,
  player,
  teams,
  maxRank,
  defaultFees,
  onDone,
}: FormProps & { player?: PlayerRow; onDone: () => void }) {
  const t = useTranslations('Admin.players');
  const [state, action, pending] = useActionState<PlayerCreateState, FormData>(async (_prev, formData) => {
    const next = player ? await updateSeasonPlayer(undefined, formData) : await createSeasonPlayer(undefined, formData);
    if (next && 'ok' in next && next.ok) onDone();
    return next;
  }, undefined);
  const initialType = player?.memberType ?? 'employee';
  const [values, setValues] = useState({
    fullName: player?.fullName ?? '',
    gender: player?.gender ?? 'male',
    rank: player ? String(player.rank) : '',
    skillPoints: player ? String(player.skillPoints) : '',
    teamId: player?.teamId ?? '',
    memberType: initialType,
    feeAmount: String(player?.feeAmount ?? defaultFees[initialType]),
  });
  const field = (key: keyof typeof values) => ({
    name: key,
    value: values[key],
    onChange: (e: { currentTarget: { value: string } }) => {
      const value = e.currentTarget.value;
      setValues((v) => ({ ...v, [key]: value }));
    },
  });
  const errors: PlayerCreateError[] = state && 'errors' in state ? state.errors : [];
  // The name the server last checked: its matches no longer apply once the name is edited.
  const [checkedName, setCheckedName] = useState('');
  const matches = state && 'matches' in state && values.fullName === checkedName ? state.matches : undefined;
  const errorOf = (key: PlayerCreateError) =>
    errors.includes(key) ? t(`errors.${key}`, { max: errorMax(key), maxRank }) : null;
  const nameError = errorOf('fullName') ?? errorOf('inSeason');

  return (
    <form
      // Not `action`: React resets a form after its action, which would drop a failed edit.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setCheckedName(values.fullName);
        startTransition(() => action(formData));
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      {player && <input type="hidden" name="seasonPlayerId" value={player.id} />}
      <Field label={t('fields.fullName')} error={nameError} className="sm:col-span-2">
        {(describedBy) => (
          <Input
            {...field('fullName')}
            required
            maxLength={MAX_PLAYER_NAME_LENGTH}
            autoComplete="off"
            aria-invalid={!!nameError || undefined}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      {matches && <PersonChoice matches={matches} />}
      <Field label={t('fields.gender')} error={errorOf('gender')}>
        {(describedBy) => (
          <select
            {...field('gender')}
            aria-invalid={errors.includes('gender') || undefined}
            aria-describedby={describedBy}
            className={SELECT_CLASS}
          >
            {(['male', 'female'] as const).map((g) => (
              <option key={g} value={g}>
                {t(`gender.${g}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('fields.team')} error={errorOf('team')}>
        {(describedBy) => (
          <select
            {...field('teamId')}
            aria-invalid={errors.includes('team') || undefined}
            aria-describedby={describedBy}
            className={SELECT_CLASS}
          >
            <option value="">{t('noTeam')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('fields.rank', { maxRank })} error={errorOf('rank')}>
        {(describedBy) => (
          <Input
            {...field('rank')}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxRank}
            step={1}
            required
            aria-invalid={errors.includes('rank') || undefined}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <Field label={t('fields.skillPoints')} error={errorOf('skillPoints')}>
        {(describedBy) => (
          <Input
            {...field('skillPoints')}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SKILL_POINTS}
            step={1}
            required
            aria-invalid={errors.includes('skillPoints') || undefined}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <Field label={t('fields.memberType')} error={errorOf('memberType')}>
        {(describedBy) => (
          <select
            name="memberType"
            value={values.memberType}
            aria-invalid={errors.includes('memberType') || undefined}
            aria-describedby={describedBy}
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
        )}
      </Field>
      <Field label={t('fields.feeAmount')} error={errorOf('feeAmount')}>
        {(describedBy) => (
          <Input
            {...field('feeAmount')}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_FEE_AMOUNT}
            step={1}
            required
            aria-invalid={errors.includes('feeAmount') || undefined}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      {!player && (
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input type="checkbox" name="paid" className="size-4" />
          {t('fields.paid')}
        </label>
      )}
      {state && 'error' in state && (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {t('errors.failed')}
        </p>
      )}
      <DialogFooter className="sm:col-span-2">
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>{t('cancel')}</DialogClose>
        <Button type="submit" pending={pending}>
          {pending ? t('saving') : player ? t('save') : t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PlayerDialog({
  title,
  trigger,
  children,
}: {
  title: string;
  trigger: ReactElement;
  children: (close: () => void) => ReactNode;
}) {
  const t = useTranslations('Admin.players');
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent closeLabel={t('close')} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}

export function AddPlayerDialog(props: FormProps) {
  const t = useTranslations('Admin.players');
  return (
    <PlayerDialog title={t('addTitle')} trigger={<Button type="button">+ {t('add')}</Button>}>
      {(close) => <PlayerForm {...props} onDone={close} />}
    </PlayerDialog>
  );
}

export function EditPlayerDialog({
  player,
  disabled,
  ...props
}: FormProps & { player: PlayerRow; disabled?: boolean }) {
  const t = useTranslations('Admin.players');
  return (
    <PlayerDialog
      title={t('editTitle')}
      trigger={
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          {t('edit')}
          <span className="sr-only"> {player.fullName}</span>
        </Button>
      }
    >
      {(close) => <PlayerForm {...props} player={player} onDone={close} />}
    </PlayerDialog>
  );
}
