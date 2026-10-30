import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import { forfeitable, forfeitResult, forfeitSlots, parseForfeitForm } from './match-forfeit';

const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.append(key, value);
  return formData;
}

const settings = DEFAULT_SEASON_SETTINGS;
const target = settings.set_target;
const sets = settings.sets_per_match;
const final = settings.relay_milestones.at(-1) ?? 0;

describe('parseForfeitForm', () => {
  it('reads the ids and a trimmed reason', () => {
    expect(parseForfeitForm(form({ matchId: MATCH, teamId: TEAM, reason: '  no show ' }))).toEqual({
      matchId: MATCH,
      teamId: TEAM,
      reason: 'no show',
    });
  });

  it('returns an empty reason for the action to refuse', () => {
    expect(parseForfeitForm(form({ matchId: MATCH, teamId: TEAM }))).toMatchObject({ reason: '' });
  });

  it.each([
    ['a bad match id', { matchId: 'x', teamId: TEAM, reason: 'r' }],
    ['a bad team id', { matchId: MATCH, teamId: '', reason: 'r' }],
    ['no ids', { reason: 'r' }],
  ])('refuses %s', (_name, values) => {
    expect(parseForfeitForm(form(values))).toBeNull();
  });
});

describe('forfeitable', () => {
  it.each([
    ['scheduled', true],
    ['lineup_locked', true],
    ['in_progress', true],
    ['completed', false],
    ['forfeit', false],
    ['annulled', false],
  ])('%s -> %s', (status, expected) => {
    expect(forfeitable(status)).toBe(expected);
  });
});

describe('forfeitSlots', () => {
  const groupNos = Array.from({ length: sets }, (_, i) => i + 1);
  const koNos = settings.relay_milestones.map((_, i) => i + 1);

  it.each([
    ['home', { score_home: 0, score_away: target }],
    ['away', { score_home: target, score_away: 0 }],
  ] as const)('group: %s forfeits, every set goes to the other side', (side, score) => {
    expect(forfeitSlots('group', side, settings, groupNos)).toEqual(groupNos.map((slot_no) => ({ slot_no, ...score })));
  });

  it.each([
    ['home', 0, 'away'],
    ['away', 0, 'home'],
  ] as const)('knock-out: %s forfeits, the legs go to the other side', (side, zero, winner) => {
    const slots = forfeitSlots('semi_final', side, settings, koNos);
    expect(slots).toHaveLength(koNos.length);
    expect(slots?.map((s) => s.slot_no)).toEqual(koNos);
    for (const slot of slots ?? []) {
      expect(slot[`score_${side}`]).toBe(zero);
      expect(slot[`score_${winner}`]).toBeGreaterThan(0);
    }
    expect(slots?.at(-1)?.[`score_${winner}`]).toBe(final);
  });

  it('orders the slots by number', () => {
    expect(forfeitSlots('group', 'home', settings, [3, 1, 2])?.map((s) => s.slot_no)).toEqual([1, 2, 3]);
  });

  it('returns null when a slot has no forfeit score', () => {
    expect(forfeitSlots('group', 'home', settings, [...groupNos, sets + 1])).toBeNull();
    expect(forfeitSlots('final', 'away', settings, [koNos.length + 1])).toBeNull();
  });
});

describe('forfeitResult', () => {
  it.each([
    ['home', 'away', { home: 0, away: sets }, { home: 0, away: target }],
    ['away', 'home', { home: sets, away: 0 }, { home: target, away: 0 }],
  ] as const)('group: %s forfeits', (side, winner, score, perSlot) => {
    expect(forfeitResult('group', side, settings)).toEqual({ winner, score, perSlot });
  });

  it.each([
    ['semi_final', 'home', 'away', { home: 0, away: final }],
    ['third_place', 'away', 'home', { home: final, away: 0 }],
    ['final', 'home', 'away', { home: 0, away: final }],
  ] as const)('%s: %s forfeits', (stage, side, winner, score) => {
    expect(forfeitResult(stage, side, settings)).toEqual({ winner, score, perSlot: null });
  });
});
