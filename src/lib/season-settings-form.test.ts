import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings, type SettingsError } from '../domain/settings';
import {
  SETTINGS_FIELDS,
  settingsErrorsFor,
  settingsFromForm,
  settingsToFormValues,
  unmatchedSettingsErrors,
} from './season-settings-form';

/** Builds the FormData the browser would send for these form values. */
function formOf(values: ReturnType<typeof settingsToFormValues>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((v) => data.append(key, v));
    else data.set(key, value);
  }
  return data;
}

const defaultForm = () => formOf(settingsToFormValues(DEFAULT_SEASON_SETTINGS));

describe('settingsFromForm', () => {
  it('round-trips the default settings', () => {
    expect(parseSeasonSettings(settingsFromForm(defaultForm()))).toEqual({
      ok: true,
      settings: DEFAULT_SEASON_SETTINGS,
    });
  });

  it('reads numbers, slot types and milestones', () => {
    const data = defaultForm();
    data.set(SETTINGS_FIELDS.setTarget, ' 21 ');
    data.set(SETTINGS_FIELDS.relayMilestones, '10, 20 30,40\n50');
    data.set(SETTINGS_FIELDS.feeIntern, '0');
    expect(settingsFromForm(data)).toMatchObject({
      set_target: 21,
      slot_types: ['open', 'low', 'open', 'high', 'open'],
      relay_milestones: [10, 20, 30, 40, 50],
      fees: { employee: 300_000, intern: 0, guest: 300_000 },
      knockout_teams: 4,
    });
  });

  it('turns blank and non-numeric fields into NaN so the schema reports them', () => {
    const data = defaultForm();
    data.set(SETTINGS_FIELDS.setTarget, '');
    data.set(SETTINGS_FIELDS.lowMax, 'abc');
    data.set(SETTINGS_FIELDS.relayMilestones, '25 x 75 100 125');
    const result = parseSeasonSettings(settingsFromForm(data));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.path, e.message_key])).toEqual(
      expect.arrayContaining([
        ['set_target', 'SeasonSettings.errors.invalidType'],
        ['low_rank_range.max', 'SeasonSettings.errors.invalidType'],
        ['relay_milestones.1', 'SeasonSettings.errors.invalidType'],
      ]),
    );
  });

  it('rejects decimals and a slot count that does not match the sets', () => {
    const data = defaultForm();
    data.set(SETTINGS_FIELDS.setsPerMatch, '4.5');
    expect(parseSeasonSettings(settingsFromForm(data)).ok).toBe(false);

    const fewer = defaultForm();
    fewer.set(SETTINGS_FIELDS.setsPerMatch, '3');
    const result = parseSeasonSettings(settingsFromForm(fewer));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.message_key)).toContain('SeasonSettings.errors.slotCountMismatch');
  });

  it('reports an invalid timezone', () => {
    const data = defaultForm();
    data.set(SETTINGS_FIELDS.timezone, 'Mars/Base');
    const result = parseSeasonSettings(settingsFromForm(data));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ path: 'timezone', message_key: 'SeasonSettings.errors.invalidTimezone' });
  });
});

describe('settingsToFormValues', () => {
  it('fills missing keys with the defaults', () => {
    expect(settingsToFormValues({ set_target: 21 })).toMatchObject({
      set_target: '21',
      sets_per_match: '5',
      slot_types: ['open', 'low', 'open', 'high', 'open'],
      low_rank_min: '4',
      high_rank_max: '3',
      relay_milestones: '25, 50, 75, 100, 125',
      fee_employee: '300000',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('treats a non-object as empty', () => {
    expect(settingsToFormValues(null)).toEqual(settingsToFormValues({}));
    expect(settingsToFormValues([1])).toEqual(settingsToFormValues({}));
  });

  it('shows values of the wrong shape as blank', () => {
    expect(settingsToFormValues({ set_target: { a: 1 }, relay_milestones: 'x', low_rank_range: 5 })).toMatchObject({
      set_target: '',
      relay_milestones: '',
      low_rank_min: '4',
    });
  });
});

describe('settingsErrorsFor / unmatchedSettingsErrors', () => {
  const error = (path: string): SettingsError => ({ path, message_key: 'SeasonSettings.errors.invalid', params: {} });
  const errors = [
    error('relay_milestones.2'),
    error('relay_milestones'),
    error('low_rank_range.max'),
    error('knockout_teams'),
    error(''),
  ];

  it('groups sub-paths under their field', () => {
    expect(settingsErrorsFor(errors, 'relay_milestones').map((e) => e.path)).toEqual([
      'relay_milestones.2',
      'relay_milestones',
    ]);
    expect(settingsErrorsFor(errors, 'low_rank_range.max')).toHaveLength(1);
    expect(settingsErrorsFor(errors, 'low_rank_range.min')).toHaveLength(0);
    expect(settingsErrorsFor(errors, 'relay')).toHaveLength(0);
  });

  it('lists what no input shows', () => {
    expect(unmatchedSettingsErrors(errors).map((e) => e.path)).toEqual(['knockout_teams', '']);
  });
});
