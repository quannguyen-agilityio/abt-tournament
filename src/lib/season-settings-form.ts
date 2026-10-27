// The season settings form (spec §2): FormData → raw object for parseSeasonSettings, and back.
// The same functions run in the browser (to block a bad submit) and in the server action (which is
// authoritative), so both sides report the same errors.
import { DEFAULT_SEASON_SETTINGS, type SettingsError } from '../domain/settings';

/** Form field names; the inputs of the form and `settingsFromForm` agree on these. */
export const SETTINGS_FIELDS = {
  setTarget: 'set_target',
  setsPerMatch: 'sets_per_match',
  slotTypes: 'slot_types',
  lowMin: 'low_rank_min',
  lowMax: 'low_rank_max',
  highMin: 'high_rank_min',
  highMax: 'high_rank_max',
  maxRank: 'max_rank',
  groupHandicapCap: 'group_handicap_cap',
  koHandicapCap: 'ko_handicap_cap',
  relayMilestones: 'relay_milestones',
  minSetsPerPlayer: 'min_sets_per_player',
  maxSetsPerPlayer: 'max_sets_per_player',
  minPlayersPresent: 'min_players_present',
  feeEmployee: 'fee_employee',
  feeIntern: 'fee_intern',
  feeGuest: 'fee_guest',
  timezone: 'timezone',
} as const;

const F = SETTINGS_FIELDS;

/** Paths (as in `SettingsError.path`) that have an input in the form. */
export const SETTINGS_FORM_PATHS = [
  'set_target',
  'sets_per_match',
  'slot_types',
  'low_rank_range.min',
  'low_rank_range.max',
  'high_rank_range.min',
  'high_rank_range.max',
  'max_rank',
  'group_handicap_cap',
  'ko_handicap_cap',
  'relay_milestones',
  'min_sets_per_player',
  'max_sets_per_player',
  'min_players_present',
  'fees.employee',
  'fees.intern',
  'fees.guest',
  'timezone',
] as const;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** A blank field is NaN, which the schema reports as "enter a whole number". */
function numberOf(value: string): number {
  const trimmed = value.trim();
  return trimmed === '' ? NaN : Number(trimmed);
}

function num(formData: FormData, name: string): number {
  return numberOf(text(formData, name));
}

/** Builds the raw settings object from the form. Nothing is validated here: see parseSeasonSettings. */
export function settingsFromForm(formData: FormData): Record<string, unknown> {
  return {
    set_target: num(formData, F.setTarget),
    sets_per_match: num(formData, F.setsPerMatch),
    slot_types: formData.getAll(F.slotTypes).map(String),
    low_rank_range: { min: num(formData, F.lowMin), max: num(formData, F.lowMax) },
    high_rank_range: { min: num(formData, F.highMin), max: num(formData, F.highMax) },
    max_rank: num(formData, F.maxRank),
    group_handicap_cap: num(formData, F.groupHandicapCap),
    ko_handicap_cap: num(formData, F.koHandicapCap),
    relay_milestones: text(formData, F.relayMilestones)
      .split(/[\s,]+/)
      .filter((part) => part !== '')
      .map(numberOf),
    min_sets_per_player: num(formData, F.minSetsPerPlayer),
    max_sets_per_player: num(formData, F.maxSetsPerPlayer),
    min_players_present: num(formData, F.minPlayersPresent),
    knockout_teams: DEFAULT_SEASON_SETTINGS.knockout_teams,
    fees: {
      employee: num(formData, F.feeEmployee),
      intern: num(formData, F.feeIntern),
      guest: num(formData, F.feeGuest),
    },
    timezone: text(formData, F.timezone).trim(),
  };
}

export interface SettingsFormValues {
  set_target: string;
  sets_per_match: string;
  slot_types: string[];
  low_rank_min: string;
  low_rank_max: string;
  high_rank_min: string;
  high_rank_max: string;
  max_rank: string;
  group_handicap_cap: string;
  ko_handicap_cap: string;
  relay_milestones: string;
  min_sets_per_player: string;
  max_sets_per_player: string;
  min_players_present: string;
  fee_employee: string;
  fee_intern: string;
  fee_guest: string;
  timezone: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * Initial form values from the stored settings. Missing keys take the defaults, and a stored value
 * of the wrong shape shows as blank so the BTC sees what to fix.
 */
export function settingsToFormValues(stored: unknown): SettingsFormValues {
  const s: Record<string, unknown> = { ...DEFAULT_SEASON_SETTINGS, ...(isRecord(stored) ? stored : {}) };
  const range = (key: string, fallback: { min: number; max: number }) => {
    const v = isRecord(s[key]) ? s[key] : fallback;
    return { min: str(v.min), max: str(v.max) };
  };
  const low = range('low_rank_range', DEFAULT_SEASON_SETTINGS.low_rank_range);
  const high = range('high_rank_range', DEFAULT_SEASON_SETTINGS.high_rank_range);
  const fees = isRecord(s.fees) ? s.fees : DEFAULT_SEASON_SETTINGS.fees;
  return {
    set_target: str(s.set_target),
    sets_per_match: str(s.sets_per_match),
    slot_types: Array.isArray(s.slot_types) ? s.slot_types.map(String) : [],
    low_rank_min: low.min,
    low_rank_max: low.max,
    high_rank_min: high.min,
    high_rank_max: high.max,
    max_rank: str(s.max_rank),
    group_handicap_cap: str(s.group_handicap_cap),
    ko_handicap_cap: str(s.ko_handicap_cap),
    relay_milestones: Array.isArray(s.relay_milestones) ? s.relay_milestones.map(str).join(', ') : '',
    min_sets_per_player: str(s.min_sets_per_player),
    max_sets_per_player: str(s.max_sets_per_player),
    min_players_present: str(s.min_players_present),
    fee_employee: str(fees.employee),
    fee_intern: str(fees.intern),
    fee_guest: str(fees.guest),
    timezone: str(s.timezone),
  };
}

/** Errors for one field: its own path and sub-paths (`relay_milestones.2` belongs to `relay_milestones`). */
export function settingsErrorsFor(errors: SettingsError[], path: string): SettingsError[] {
  return errors.filter((e) => e.path === path || e.path.startsWith(`${path}.`));
}

/** Errors that no input in the form shows (the root, `knockout_teams`, unknown keys). */
export function unmatchedSettingsErrors(errors: SettingsError[]): SettingsError[] {
  return errors.filter((e) => !SETTINGS_FORM_PATHS.some((p) => e.path === p || e.path.startsWith(`${p}.`)));
}
