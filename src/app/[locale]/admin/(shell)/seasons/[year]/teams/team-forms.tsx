'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MAX_TEAM_NAME_LENGTH, type TeamFormError } from '@/lib/teams';
import { createTeam, deleteTeam, updateTeam, type TeamActionState, type TeamFormState } from './actions';

type Team = { id: string; name: string; color: string };

function errorsOf(state: TeamFormState): TeamFormError[] {
  return state && 'errors' in state ? state.errors : [];
}

function FailedAlert() {
  const t = useTranslations('Admin.teams.errors');
  return (
    <p role="alert" className="text-destructive text-sm">
      {t('failed')}
    </p>
  );
}

function FieldError({ id, error }: { id: string; error: TeamFormError }) {
  const t = useTranslations('Admin.teams.errors');
  return (
    <span id={id} className="text-destructive text-sm font-normal">
      {t(error, { max: MAX_TEAM_NAME_LENGTH })}
    </span>
  );
}

/**
 * The create and edit form inside a dialog. It mounts with the dialog, so every opening starts
 * clean, and it calls `onDone` once the action succeeds.
 */
function TeamForm({
  seasonId,
  team,
  defaultColor,
  submitLabel,
  onDone,
}: {
  seasonId: string;
  /** The team being edited; a new team when left out. */
  team?: Team;
  defaultColor: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const t = useTranslations('Admin.teams');
  const id = useId();
  const [state, action, pending] = useActionState(async (prev: TeamFormState, formData: FormData) => {
    const next = await (team ? updateTeam : createTeam)(prev, formData);
    if (next && 'ok' in next && next.ok) onDone();
    return next;
  }, undefined);
  const errors = errorsOf(state);
  const nameError = errors.includes('name');
  const colorError = errors.includes('color');

  return (
    <form
      // Not `action`: React resets a form after its action, which would drop a failed edit.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      {team && <input type="hidden" name="teamId" value={team.id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('name')}
        <Input
          name="name"
          defaultValue={team?.name}
          required
          maxLength={MAX_TEAM_NAME_LENGTH}
          autoComplete="off"
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? `${id}-name` : undefined}
        />
        {nameError && <FieldError id={`${id}-name`} error="name" />}
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('color')}
        <input
          type="color"
          name="color"
          defaultValue={team?.color ?? defaultColor}
          aria-invalid={colorError || undefined}
          aria-describedby={colorError ? `${id}-color` : undefined}
          className="border-border h-9 w-16 cursor-pointer rounded border bg-transparent"
        />
        {colorError && <FieldError id={`${id}-color`} error="color" />}
      </label>
      {state && 'error' in state && <FailedAlert />}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>{t('cancel')}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateTeamForm({ seasonId, defaultColor }: { seasonId: string; defaultColor: string }) {
  const t = useTranslations('Admin.teams');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" />}>+ {t('add')}</DialogTrigger>
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('addTitle')}</DialogTitle>
        </DialogHeader>
        <TeamForm
          seasonId={seasonId}
          defaultColor={defaultColor}
          submitLabel={t('create')}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditTeamDialog({ seasonId, team }: { seasonId: string; team: Team }) {
  const t = useTranslations('Admin.teams');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {t('edit')}
        <span className="sr-only"> {team.name}</span>
      </DialogTrigger>
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>
        <TeamForm
          seasonId={seasonId}
          team={team}
          defaultColor={team.color}
          submitLabel={t('save')}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function deleteError(state: TeamActionState) {
  return state && 'error' in state ? state.error : null;
}

function DeleteTeamForm({ seasonId, team, onDone }: { seasonId: string; team: Team; onDone: () => void }) {
  const t = useTranslations('Admin.teams');
  const [state, action, deleting] = useActionState(async (prev: TeamActionState, formData: FormData) => {
    const next = await deleteTeam(prev, formData);
    if (next && 'ok' in next && next.ok) onDone();
    return next;
  }, undefined);
  const error = deleteError(state);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="teamId" value={team.id} />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${error}`)}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={deleting} />}>{t('cancel')}</DialogClose>
        <Button type="submit" variant="destructive" disabled={deleting}>
          {deleting ? t('deleting') : t('delete')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteTeamDialog({ seasonId, team }: { seasonId: string; team: Team }) {
  const t = useTranslations('Admin.teams');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="destructive" />}>
        {t('delete')}
        <span className="sr-only"> {team.name}</span>
      </DialogTrigger>
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('deleteTitle')}</DialogTitle>
          <DialogDescription>{t('deleteConfirm', { name: team.name })}</DialogDescription>
        </DialogHeader>
        <DeleteTeamForm seasonId={seasonId} team={team} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Color and name of a team, edited in a dialog; delete is offered only for a team without players. */
export function TeamHeader({ seasonId, team, empty }: { seasonId: string; team: Team; empty: boolean }) {
  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b p-3">
      <span aria-hidden="true" className="size-4 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
      <h2 className="min-w-0 flex-1 truncate font-semibold">{team.name}</h2>
      <EditTeamDialog seasonId={seasonId} team={team} />
      {empty && <DeleteTeamDialog seasonId={seasonId} team={team} />}
    </div>
  );
}
