import { describe, expect, it } from 'vitest';
import type { LineupViolation } from '../domain/lineup';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import {
  addedViolations,
  parseSubstitutionForm,
  substitutionHandicap,
  substitutionsOpen,
  substitutionState,
} from './match-substitution';
import type { LineupSlotPicks } from './match-lineup';

const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const OUT = '33333333-3333-4333-8333-333333333333';
const IN = '44444444-4444-4444-8444-444444444444';

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.append(key, value);
  return formData;
}

const VALID = { matchId: MATCH, teamId: TEAM, slotNo: '2', replacedId: OUT, substituteId: IN };

describe('parseSubstitutionForm', () => {
  it('reads the fields, with trimmed reasons that may be empty', () => {
    expect(parseSubstitutionForm(form({ ...VALID, reason: '  injured ', overrideReason: '' }))).toEqual({
      matchId: MATCH,
      teamId: TEAM,
      slotNo: 2,
      replacedId: OUT,
      substituteId: IN,
      reason: 'injured',
      overrideReason: '',
    });
    expect(parseSubstitutionForm(form(VALID))).toMatchObject({ reason: '', overrideReason: '' });
  });

  it.each([
    ['a bad match id', { matchId: 'x' }],
    ['a bad team id', { teamId: '' }],
    ['a bad replaced id', { replacedId: 'nope' }],
    ['a bad substitute id', { substituteId: '' }],
    ['the same player in and out', { substituteId: OUT }],
    ['slot 0', { slotNo: '0' }],
    ['a fractional slot', { slotNo: '1.5' }],
    ['a missing slot', { slotNo: '' }],
  ])('rejects %s', (_name, override) => {
    expect(parseSubstitutionForm(form({ ...VALID, ...override }))).toBeNull();
  });
});

describe('substitutionsOpen', () => {
  it.each([
    ['scheduled', false],
    ['lineup_locked', true],
    ['in_progress', true],
    ['completed', false],
  ])('%s -> %s', (status, open) => {
    expect(substitutionsOpen(status)).toBe(open);
  });
});

describe('substitutionState', () => {
  it('orders the slots by number and the substitution ids', () => {
    const slot = (slot_no: number) => ({
      slot_no,
      score_home: null,
      score_away: null,
      handicap_home: 0,
      handicap_away: 3,
    });
    const state = substitutionState([slot(2), slot(1)], ['b', 'a', 'c']);
    expect(state.slots.map((s) => s.slot_no)).toEqual([1, 2]);
    expect(state.substitutions).toEqual(['a', 'b', 'c']);
  });
});

describe('addedViolations', () => {
  const v = (code: LineupViolation['code'], slotNo?: number, playerId?: string): LineupViolation => ({
    code,
    slotNo,
    playerId,
    message_key: `Lineup.violations.${code}`,
  });

  it('keeps only violations the lineup did not have by code, slot and player', () => {
    const before = [v('MAX_SETS', undefined, OUT), v('CONSECUTIVE', 2, OUT)];
    const after = [v('MAX_SETS', undefined, OUT), v('CONSECUTIVE', 2, IN), v('SUB_RANK', 2, IN)];
    expect(addedViolations(before, after)).toEqual([v('CONSECUTIVE', 2, IN), v('SUB_RANK', 2, IN)]);
  });

  it('is empty when nothing new broke', () => {
    expect(addedViolations([v('MIN_SETS', undefined, OUT)], [])).toEqual([]);
  });
});

describe('substitutionHandicap', () => {
  const settings = DEFAULT_SEASON_SETTINGS;
  const skillOf = new Map([
    ['h1', 30],
    ['h2', 33],
    ['a1', 27],
    ['a2', 27],
    ['a3', 20],
  ]);
  const slot = (slotNo: number, away: [string, string], scored = false): LineupSlotPicks & { scored: boolean } => ({
    slotNo,
    slotType: 'open',
    home: ['h1', 'h2'],
    away,
    scored,
  });

  it('gives a group set the start points of the weaker pair', () => {
    expect(substitutionHandicap('group', [slot(1, ['a1', 'a2'])], 1, skillOf, settings, null)).toEqual({
      kind: 'group',
      slot: { home: 0, away: 9 },
    });
  });

  it('picks the substituted slot out of several', () => {
    const slots = [slot(1, ['a1', 'a2']), slot(2, ['a1', 'a3'])];
    const result = substitutionHandicap('group', slots, 2, skillOf, settings, null);
    expect(result).toEqual({ kind: 'group', slot: { home: 0, away: Math.min(63 - 47, settings.group_handicap_cap) } });
  });

  it('is null while a skill is unknown', () => {
    expect(substitutionHandicap('group', [slot(1, ['a1', 'zz'])], 1, skillOf, settings, null)).toBeNull();
  });

  it('recomputes the relay start while no leg is scored', () => {
    const slots = [slot(1, ['a1', 'a2']), slot(2, ['a1', 'a3'])];
    const result = substitutionHandicap('knockout', slots, 1, skillOf, settings, { home: 0, away: 1 });
    expect(result).toEqual({
      kind: 'relay',
      start: { home: 0, away: Math.min(9 + 16, settings.ko_handicap_cap) },
    });
  });

  it('keeps the relay start once a leg is scored', () => {
    const slots = [slot(1, ['a1', 'a2'], true), slot(2, ['a1', 'a3'])];
    expect(substitutionHandicap('knockout', slots, 2, skillOf, settings, { home: 0, away: 4 })).toEqual({
      kind: 'relay',
      start: { home: 0, away: 4 },
    });
    expect(substitutionHandicap('knockout', slots, 2, skillOf, settings, null)).toEqual({
      kind: 'relay',
      start: { home: 0, away: 0 },
    });
  });

  it('is null for a relay with an incomplete leg', () => {
    const slots = [slot(1, ['a1', 'a2']), slot(2, ['a1', 'zz'])];
    expect(substitutionHandicap('knockout', slots, 2, skillOf, settings, null)).toBeNull();
  });
});
