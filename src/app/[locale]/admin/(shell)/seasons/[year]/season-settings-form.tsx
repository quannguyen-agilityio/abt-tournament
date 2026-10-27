'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseSeasonSettings, type SettingsError } from '@/domain/settings';
import {
  SETTINGS_FIELDS as F,
  settingsErrorsFor,
  settingsFromForm,
  settingsToFormValues,
  unmatchedSettingsErrors,
  type SettingsFormValues,
} from '@/lib/season-settings-form';
import { saveSeasonSettings } from './actions';

type FieldExtra = { hint?: string; type?: 'number' | 'text' };

const SLOT_TYPES = ['open', 'low', 'high'] as const;
// Guards the set-type list against a typo like 500 sets; the schema has no upper bound.
const MAX_SLOTS = 12;

function initialErrors(stored: unknown): SettingsError[] {
  const result = parseSeasonSettings(stored);
  return result.ok ? [] : result.errors;
}

function SettingsField({
  id,
  name,
  label,
  hint,
  type = 'number',
  value,
  errors,
  onChange,
}: FieldExtra & {
  id: string;
  name: string;
  label: string;
  value: string;
  errors: string[];
  onChange: (value: string) => void;
}) {
  const describedBy = [errors.length > 0 && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-invalid={errors.length > 0 || undefined}
        aria-describedby={describedBy || undefined}
        className="h-9"
      />
      {hint && (
        <span id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </span>
      )}
      {errors.length > 0 && (
        <span id={`${id}-error`} className="text-destructive flex flex-col text-xs">
          {errors.map((e, i) => (
            <span key={i}>{e}</span>
          ))}
        </span>
      )}
    </div>
  );
}

export function SeasonSettingsForm({ seasonId, stored }: { seasonId: string; stored: unknown }) {
  const t = useTranslations();
  const s = useTranslations('Admin.seasons.settings');
  const [state, action, pending] = useActionState(saveSeasonSettings, undefined);
  const [values, setValues] = useState<SettingsFormValues>(() => settingsToFormValues(stored));
  // Errors from the browser-side check (blocks the submit); null until the first submit.
  const [clientErrors, setClientErrors] = useState<SettingsError[] | null>(null);
  // Stored settings that were already invalid show their errors until the first edit.
  const [storedErrors, setStoredErrors] = useState(() => initialErrors(stored));
  const uid = useId();

  const serverErrors = state && 'errors' in state ? state.errors : null;
  const errors = clientErrors === null ? storedErrors : clientErrors.length > 0 ? clientErrors : (serverErrors ?? []);
  const failed = state && 'error' in state;
  const saved = !!state && 'ok' in state && state.ok && clientErrors?.length === 0;

  function set<K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setClientErrors(null);
    setStoredErrors([]);
  }

  function setSetsPerMatch(value: string) {
    const count = Number(value);
    setValues((v) => {
      const slots =
        Number.isInteger(count) && count >= 1 && count <= MAX_SLOTS
          ? Array.from({ length: count }, (_, i) => v.slot_types[i] ?? 'open')
          : v.slot_types;
      return { ...v, sets_per_match: value, slot_types: slots };
    });
    setClientErrors(null);
    setStoredErrors([]);
  }

  // The same check the server action runs; a bad form never leaves the browser.
  function submit(formData: FormData) {
    const result = parseSeasonSettings(settingsFromForm(formData));
    if (!result.ok) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors([]);
    action(formData);
  }

  const message = (e: SettingsError) => t(e.message_key as Parameters<typeof t>[0], e.params);
  // Plain helper (not a component): a component defined here would remount and drop focus on every key.
  const field = (name: keyof SettingsFormValues, path: string, label: string, extra: FieldExtra = {}) => (
    <SettingsField
      id={`${uid}-${name}`}
      name={name}
      label={label}
      value={values[name] as string}
      errors={settingsErrorsFor(errors, path).map(message)}
      onChange={(v) => (name === F.setsPerMatch ? setSetsPerMatch(v) : set(name, v))}
      {...extra}
    />
  );

  const slotInvalid = settingsErrorsFor(errors, 'slot_types').length > 0;
  const unmatched = unmatchedSettingsErrors(errors);

  return (
    <form action={submit} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field(F.setTarget, 'set_target', s('setTarget'))}
        {field(F.setsPerMatch, 'sets_per_match', s('setsPerMatch'))}
        {field(F.maxRank, 'max_rank', s('maxRank'))}
        {field(F.groupHandicapCap, 'group_handicap_cap', s('groupHandicapCap'), { hint: s('perSet') })}
        {field(F.koHandicapCap, 'ko_handicap_cap', s('koHandicapCap'), { hint: s('perMatch') })}
        {field(F.minPlayersPresent, 'min_players_present', s('minPlayersPresent'))}
        {field(F.minSetsPerPlayer, 'min_sets_per_player', s('minSetsPerPlayer'))}
        {field(F.maxSetsPerPlayer, 'max_sets_per_player', s('maxSetsPerPlayer'))}
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby={`${uid}-slots-hint`}>
        <legend className="mb-1 text-sm font-medium">{s('slotTypes')}</legend>
        <div className="flex flex-wrap gap-3">
          {values.slot_types.map((type, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Label htmlFor={`${uid}-slot-${i}`} className="text-muted-foreground text-xs">
                {s('slotLabel', { number: i + 1 })}
              </Label>
              <select
                id={`${uid}-slot-${i}`}
                name={F.slotTypes}
                value={type}
                onChange={(e) =>
                  set(
                    'slot_types',
                    values.slot_types.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
                aria-invalid={slotInvalid || undefined}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 rounded-lg border bg-transparent px-2.5 text-base outline-none focus-visible:ring-3 md:text-sm"
              >
                {SLOT_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {s(`slot.${o}`)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <span id={`${uid}-slots-hint`} className="text-muted-foreground text-xs">
          {s('slotHint')}
        </span>
        {settingsErrorsFor(errors, 'slot_types').map((e, i) => (
          <span key={i} className="text-destructive text-xs">
            {message(e)}
          </span>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">{s('lowRange')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {field(F.lowMin, 'low_rank_range.min', s('rangeMin'))}
            {field(F.lowMax, 'low_rank_range.max', s('rangeMax'))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">{s('highRange')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {field(F.highMin, 'high_rank_range.min', s('rangeMin'))}
            {field(F.highMax, 'high_rank_range.max', s('rangeMax'))}
          </div>
        </fieldset>
      </div>

      {field(F.relayMilestones, 'relay_milestones', s('relayMilestones'), {
        hint: s('relayMilestonesHint'),
        type: 'text',
      })}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">{s('fees')}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field(F.feeEmployee, 'fees.employee', s('feeEmployee'))}
          {field(F.feeIntern, 'fees.intern', s('feeIntern'))}
          {field(F.feeGuest, 'fees.guest', s('feeGuest'))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        {field(F.timezone, 'timezone', s('timezone'), { type: 'text' })}
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${uid}-ko`}>{s('knockoutTeams')}</Label>
          <Input id={`${uid}-ko`} value={4} readOnly className="h-9" />
          <span className="text-muted-foreground text-xs">{s('knockoutTeamsHint')}</span>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">{s('appliesLater')}</p>

      {unmatched.length > 0 && (
        <ul role="alert" className="text-destructive list-disc pl-5 text-sm">
          {unmatched.map((e, i) => (
            <li key={i}>{message(e)}</li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {s('fixErrors', { count: errors.length })}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-destructive text-sm">
          {s('failed')}
        </p>
      )}
      {saved && (
        <p role="status" className="text-win text-sm">
          {s('saved')}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? s('saving') : s('save')}
        </Button>
      </div>
    </form>
  );
}
