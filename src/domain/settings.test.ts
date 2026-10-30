import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings, type SettingsError } from './settings';

function errorsOf(input: unknown): SettingsError[] {
  const result = parseSeasonSettings(input);
  if (result.ok) throw new Error('expected settings to be invalid');
  return result.errors;
}

describe('DEFAULT_SEASON_SETTINGS', () => {
  it('matches the ABT 2026 rules (spec §2)', () => {
    expect(DEFAULT_SEASON_SETTINGS).toEqual({
      set_target: 31,
      sets_per_match: 5,
      slot_types: ['open', 'low', 'open', 'high', 'open'],
      low_rank_range: { min: 4, max: 7 },
      high_rank_range: { min: 1, max: 3 },
      max_rank: 7,
      group_handicap_cap: 20,
      ko_handicap_cap: 15,
      relay_milestones: [25, 50, 75, 100, 125],
      min_sets_per_player: 1,
      max_sets_per_player: 2,
      min_players_present: 5,
      knockout_teams: 4,
      fees: { employee: 300_000, intern: 150_000, guest: 300_000 },
      prizes: { champion: 0, runner_up: 0, third: 0 },
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('passes its own schema', () => {
    expect(parseSeasonSettings(DEFAULT_SEASON_SETTINGS)).toEqual({ ok: true, settings: DEFAULT_SEASON_SETTINGS });
  });
});

describe('parseSeasonSettings', () => {
  it('fills the column default {} with the ABT 2026 rules', () => {
    expect(parseSeasonSettings({})).toEqual({ ok: true, settings: DEFAULT_SEASON_SETTINGS });
  });

  it('keeps given values and defaults the rest', () => {
    const result = parseSeasonSettings({ group_handicap_cap: 18 });
    expect(result.ok && result.settings).toEqual({ ...DEFAULT_SEASON_SETTINGS, group_handicap_cap: 18 });
  });

  it('returns fresh default arrays, not shared ones', () => {
    const a = parseSeasonSettings({});
    const b = parseSeasonSettings({});
    if (!a.ok || !b.ok) throw new Error('expected valid settings');
    a.settings.slot_types.push('open');
    expect(b.settings.slot_types).toHaveLength(5);
    expect(DEFAULT_SEASON_SETTINGS.slot_types).toHaveLength(5);
  });

  describe('field checks', () => {
    it.each([
      ['a non-object', null, '', 'invalidType', {}],
      ['a wrong type', { set_target: '31' }, 'set_target', 'invalidType', {}],
      ['a fraction', { set_target: 30.5 }, 'set_target', 'notInteger', {}],
      ['a blank form field (NaN)', { set_target: NaN }, 'set_target', 'notInteger', {}],
      ['a zero target', { set_target: 0 }, 'set_target', 'tooSmall', { minimum: 1 }],
      ['a zero max sets', { max_sets_per_player: 0 }, 'max_sets_per_player', 'tooSmall', { minimum: 1 }],
      ['a negative cap', { ko_handicap_cap: -1 }, 'ko_handicap_cap', 'tooSmall', { minimum: 0 }],
      ['a negative fee', { fees: { employee: -1, intern: 0, guest: 0 } }, 'fees.employee', 'tooSmall', { minimum: 0 }],
      [
        'a negative prize',
        { prizes: { champion: 0, runner_up: -5, third: 0 } },
        'prizes.runner_up',
        'tooSmall',
        { minimum: 0 },
      ],
      [
        'an unknown slot type',
        { slot_types: ['open', 'mixed', 'open', 'high', 'open'] },
        'slot_types.1',
        'invalidValue',
        { values: 'open, low, high' },
      ],
      ['an empty slot list', { slot_types: [] }, 'slot_types', 'tooFewItems', { minimum: 1 }],
      ['an unsupported bracket size', { knockout_teams: 8 }, 'knockout_teams', 'invalidValue', { values: '4' }],
      ['an unknown setting', { set_targett: 31 }, '', 'unknownKeys', { keys: 'set_targett' }],
      ['an unknown time zone', { timezone: 'Mars/Olympus' }, 'timezone', 'invalidTimezone', {}],
    ])('rejects %s', (_, input, path, key, params) => {
      expect(errorsOf(input)).toEqual([{ path, message_key: `SeasonSettings.errors.${key}`, params }]);
    });
  });

  describe('cross-field checks', () => {
    it.each([
      [
        'a reversed low-rank range',
        { low_rank_range: { min: 7, max: 4 } },
        [{ path: 'low_rank_range.min', key: 'rankRangeReversed', params: {} }],
      ],
      [
        'a high-rank range above max_rank',
        { high_rank_range: { min: 1, max: 8 } },
        [{ path: 'high_rank_range.max', key: 'rankRangeAboveMaxRank', params: { maxRank: 7 } }],
      ],
      [
        'a max_rank below the low-rank range',
        { max_rank: 6 },
        [{ path: 'low_rank_range.max', key: 'rankRangeAboveMaxRank', params: { maxRank: 6 } }],
      ],
      [
        'slot types that do not match sets_per_match',
        { slot_types: ['open', 'low', 'high'] },
        [{ path: 'slot_types', key: 'slotCountMismatch', params: { count: 5 } }],
      ],
      [
        'milestones that do not match sets_per_match',
        { relay_milestones: [50, 100, 125] },
        [{ path: 'relay_milestones', key: 'milestoneCountMismatch', params: { count: 5 } }],
      ],
      [
        'milestones that do not increase',
        { relay_milestones: [25, 50, 50, 100, 90] },
        [
          { path: 'relay_milestones.2', key: 'milestonesNotIncreasing', params: {} },
          { path: 'relay_milestones.4', key: 'milestonesNotIncreasing', params: {} },
        ],
      ],
      [
        'min sets above max sets',
        { min_sets_per_player: 3, max_sets_per_player: 2 },
        [{ path: 'min_sets_per_player', key: 'setsPerPlayerReversed', params: {} }],
      ],
      [
        'a group cap that reaches the set target',
        { group_handicap_cap: 31 },
        [{ path: 'group_handicap_cap', key: 'groupHandicapTooLarge', params: { target: 31 } }],
      ],
      [
        'a relay cap that reaches the last milestone',
        { ko_handicap_cap: 125 },
        [{ path: 'ko_handicap_cap', key: 'koHandicapTooLarge', params: { target: 125 } }],
      ],
      [
        'too few required players to fill a lineup',
        { min_players_present: 4 },
        [{ path: 'min_players_present', key: 'minPlayersTooLow', params: { minimum: 5 } }],
      ],
    ])('rejects %s', (_, input, expected) => {
      expect(errorsOf(input)).toEqual(
        expected.map(({ path, key, params }) => ({ path, message_key: `SeasonSettings.errors.${key}`, params })),
      );
    });

    it('accepts a consistent non-default season', () => {
      const result = parseSeasonSettings({
        sets_per_match: 3,
        slot_types: ['open', 'low', 'high'],
        relay_milestones: [30, 60, 90],
        max_rank: 5,
        low_rank_range: { min: 3, max: 5 },
        high_rank_range: { min: 1, max: 2 },
        min_players_present: 3,
      });
      expect(result.ok).toBe(true);
    });
  });

  it('has a vi and en message for every key it can return', () => {
    const keys = [
      'invalid',
      'invalidType',
      'notInteger',
      'tooSmall',
      'tooBig',
      'tooFewItems',
      'invalidValue',
      'unknownKeys',
      'invalidTimezone',
      'rankRangeReversed',
      'rankRangeAboveMaxRank',
      'slotCountMismatch',
      'milestoneCountMismatch',
      'milestonesNotIncreasing',
      'setsPerPlayerReversed',
      'groupHandicapTooLarge',
      'koHandicapTooLarge',
      'minPlayersTooLow',
    ];
    for (const locale of ['vi', 'en']) {
      const messages = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8'));
      expect(Object.keys(messages.SeasonSettings.errors).sort()).toEqual([...keys].sort());
    }
  });
});
