'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_TEAM_NAME_LENGTH, type TeamFormError } from '@/lib/teams';
import { createTeam, deleteTeam, updateTeam, type TeamActionState, type TeamFormState } from './actions';

function errorsOf(state: TeamFormState): TeamFormError[] {
  return state && 'errors' in state ? state.errors : [];
}

function FormErrors({ state }: { state: TeamFormState }) {
  const t = useTranslations('Admin.teams.errors');
  const errors = errorsOf(state);
  if (state && 'error' in state) {
    return (
      <p role="alert" className="text-destructive basis-full text-sm">
        {t('failed')}
      </p>
    );
  }
  if (errors.length === 0) return null;
  return (
    <ul role="alert" className="text-destructive basis-full text-sm">
      {errors.map((error) => (
        <li key={error}>{t(error, { max: MAX_TEAM_NAME_LENGTH })}</li>
      ))}
    </ul>
  );
}

function deleteError(state: TeamActionState) {
  return state && 'error' in state ? state.error : null;
}

/** Color and name of a team, saved together; delete is offered only for a team without players. */
export function TeamHeader({
  seasonId,
  team,
  empty,
}: {
  seasonId: string;
  team: { id: string; name: string; color: string };
  empty: boolean;
}) {
  const t = useTranslations('Admin.teams');
  const [state, action, saving] = useActionState(updateTeam, undefined);
  const [deleteState, deleteAction, deleting] = useActionState(deleteTeam, undefined);
  const errors = errorsOf(state);
  const removeError = deleteError(deleteState);

  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b p-3">
      <form action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="teamId" value={team.id} />
        <input
          // Remounts with the saved values after a refresh.
          key={`c-${team.color}`}
          type="color"
          name="color"
          defaultValue={team.color}
          aria-label={t('colorOf', { name: team.name })}
          aria-invalid={errors.includes('color') || undefined}
          className="border-border size-8 shrink-0 cursor-pointer rounded border bg-transparent"
        />
        <Input
          key={`n-${team.name}`}
          name="name"
          defaultValue={team.name}
          required
          maxLength={MAX_TEAM_NAME_LENGTH}
          autoComplete="off"
          aria-label={t('nameOf', { name: team.name })}
          aria-invalid={errors.includes('name') || undefined}
          className="h-8 min-w-32 flex-1 font-semibold"
        />
        <Button type="submit" size="sm" variant="outline" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <FormErrors state={state} />
      </form>
      {empty && (
        <form action={deleteAction}>
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="teamId" value={team.id} />
          <Button type="submit" size="sm" variant="destructive" disabled={deleting}>
            {t('delete')}
            <span className="sr-only"> {team.name}</span>
          </Button>
        </form>
      )}
      {removeError && (
        <p role="alert" className="text-destructive basis-full text-sm">
          {t(`errors.${removeError}`)}
        </p>
      )}
    </div>
  );
}

export function CreateTeamForm({ seasonId, defaultColor }: { seasonId: string; defaultColor: string }) {
  const t = useTranslations('Admin.teams');
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: TeamFormState, formData: FormData) => {
    const next = await createTeam(prev, formData);
    if (next && 'ok' in next && next.ok) setOpen(false);
    return next;
  }, undefined);
  const errors = errorsOf(state);

  return (
    <div className="contents">
      <Button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        + {t('add')}
      </Button>
      {open && (
        <form
          action={action}
          aria-label={t('addTitle')}
          className="border-border bg-surface order-last flex basis-full flex-wrap items-end gap-3 rounded-[10px] border p-4"
        >
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('color')}
            <input
              key={defaultColor}
              type="color"
              name="color"
              defaultValue={defaultColor}
              aria-invalid={errors.includes('color') || undefined}
              className="border-border h-8 w-12 cursor-pointer rounded border bg-transparent"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
            {t('name')}
            <Input
              name="name"
              required
              maxLength={MAX_TEAM_NAME_LENGTH}
              autoComplete="off"
              aria-invalid={errors.includes('name') || undefined}
              className="h-8"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('create')}
          </Button>
          <FormErrors state={state} />
        </form>
      )}
    </div>
  );
}
