'use client';

import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState } from 'react';
import { TeamChip } from '@/components/team-chip';
import { Button } from '@/components/ui/button';
import { closeGroup, reopenGroup, type CloseGroupState, type ReopenGroupState } from './actions';

export type DrawTeam = { id: string; name: string; color: string };

const INPUT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none focus-visible:ring-3';
const DRAG_TYPE = 'application/x-abt-draw-team';

function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * One group of teams still level after step 5 (spec §4.6 step 6). The BTC orders it by the draw
 * result: by drag and drop, or with the move buttons on each row (the keyboard way).
 */
function DrawGroup({
  label,
  teams,
  disabled,
  onChange,
}: {
  label: string;
  teams: DrawTeam[];
  disabled: boolean;
  onChange: (teams: DrawTeam[]) => void;
}) {
  const t = useTranslations('Admin.closeGroup.draw');
  const [over, setOver] = useState<number | null>(null);

  return (
    <ol aria-label={label} className="flex max-w-md flex-col gap-2">
      {teams.map((team, i) => (
        <li
          key={team.id}
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, String(i));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (disabled || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(i);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const from = Number(e.dataTransfer.getData(DRAG_TYPE));
            if (Number.isInteger(from) && from !== i) onChange(moveTo(teams, from, i));
          }}
          className={`bg-surface flex items-center gap-3 rounded-[10px] border p-3 ${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${over === i ? 'border-primary ring-primary/30 ring-3' : 'border-border'}`}
        >
          <GripVertical aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          <b className="font-display w-5 text-lg">{i + 1}</b>
          <TeamChip name={team.name} color={team.color} />
          <span className="ml-auto flex gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled || i === 0}
              aria-label={t('moveUp', { team: team.name })}
              onClick={() => onChange(moveTo(teams, i, i - 1))}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disabled || i === teams.length - 1}
              aria-label={t('moveDown', { team: team.name })}
              onClick={() => onChange(moveTo(teams, i, i + 1))}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The draw and the Close-group button (spec §6 A6). Only the teams still level after step 5 can be
 * reordered, and a note is required when there are any. Closing locks the order, moves the season to
 * the knock-out and seeds the semi-finals, after a confirmation.
 */
export function CloseGroupForm({
  year,
  groups: initialGroups,
  unfinished,
  seeds,
}: {
  year: number;
  groups: DrawTeam[][];
  /** Group matches still to be played; the group cannot close until there are none. */
  unfinished: number;
  /** The top teams in the current order, for the confirmation: SF1 = #1 v #4, SF2 = #2 v #3. */
  seeds: DrawTeam[];
}) {
  const t = useTranslations('Admin.closeGroup');
  const [state, action, pending] = useActionState<CloseGroupState, FormData>(closeGroup, undefined);
  const [groups, setGroups] = useState(initialGroups);
  const [note, setNote] = useState('');

  const needsNote = groups.length > 0;
  const ready = unfinished === 0 && (!needsNote || note.trim() !== '');
  // The draw reorders tied teams only, so the seeds follow it without recomputing the standings.
  const drawn = new Map(initialGroups.flatMap((group, g) => group.map((team, i) => [team.id, groups[g][i]])));
  const order = seeds.map((team) => (drawn.get(team.id) ?? team).name);

  return (
    <form
      // Not `action`: React resets a form after an action, which would undo the drawn order.
      onSubmit={(e) => {
        e.preventDefault();
        const bracket = t('confirmBracket', { s1: order[0], s2: order[1], s3: order[2], s4: order[3] });
        if (!window.confirm(t('confirm', { bracket }))) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      aria-labelledby="draw-title"
      className="border-border bg-surface flex flex-col gap-4 rounded-[10px] border p-5"
    >
      <input type="hidden" name="year" value={year} />
      {groups.flat().map((team) => (
        <input key={team.id} type="hidden" name="draw" value={team.id} />
      ))}

      <div>
        <h2 id="draw-title" className="font-display text-2xl font-bold uppercase">
          {t('draw.title')}
        </h2>
        {needsNote ? (
          <p className="text-muted-foreground text-sm">{t('draw.hint')}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <span className="text-win font-semibold">✓</span> {t('draw.none')}
          </p>
        )}
      </div>

      {groups.map((group, g) => (
        <div key={initialGroups[g][0].id} className="flex flex-col gap-2">
          {groups.length > 1 && <h3 className="text-sm font-semibold">{t('draw.group', { n: g + 1 })}</h3>}
          <DrawGroup
            label={t('draw.group', { n: g + 1 })}
            teams={group}
            disabled={pending}
            onChange={(next) => setGroups((all) => all.map((x, i) => (i === g ? next : x)))}
          />
        </div>
      ))}

      <label className="flex max-w-md flex-col gap-1 text-sm font-medium">
        {t('draw.note')}
        <textarea
          name="note"
          value={note}
          rows={2}
          maxLength={500}
          required={needsNote}
          onChange={(e) => setNote(e.target.value)}
          className={INPUT}
        />
        <span className="text-muted-foreground text-xs font-normal">
          {needsNote ? t('draw.noteRequired') : t('draw.noteOptional')}
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {unfinished > 0 && <p className="text-muted-foreground text-sm">{t('unfinished', { count: unfinished })}</p>}
        {state && 'error' in state && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${state.error}`)}
          </p>
        )}
        <Button type="submit" disabled={pending || !ready}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}

/** Reopens the group while no bracket match has started (spec §6 A6), after a confirmation. */
export function ReopenGroupForm({ seasonId }: { seasonId: string }) {
  const t = useTranslations('Admin.closeGroup.reopen');
  const [state, action, pending] = useActionState<ReopenGroupState, FormData>(reopenGroup, undefined);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(t('confirm'))) return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
      <span className="text-muted-foreground text-sm">{t('hint')}</span>
      {state && 'error' in state && (
        <p role="alert" className="text-destructive w-full text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
