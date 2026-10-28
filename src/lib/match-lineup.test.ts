import { describe, expect, it } from 'vitest';
import type { LineupViolation } from '../domain/lineup';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import {
  handicapPreview,
  lineupEditable,
  lockSnapshot,
  overridable,
  parseLineupForm,
  slotOptions,
  unresolvedViolations,
  type LineupPlayer,
  type LineupSlotPicks,
} from './match-lineup';

const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';

function form(values: [string, string][]): FormData {
  const formData = new FormData();
  for (const [key, value] of values) formData.append(key, value);
  return formData;
}

describe('parseLineupForm', () => {
  it('reads the picks in slot order, with empty picks as null and a trimmed reason', () => {
    expect(
      parseLineupForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
          ['slot-2-p1', P2],
          ['slot-2-p2', ''],
          ['slot-1-p1', P1],
          ['slot-1-p2', P2],
          ['overrideReason', '  late arrival  '],
        ]),
      ),
    ).toEqual({
      matchId: MATCH,
      teamId: TEAM,
      slots: [
        { slot_no: 1, p1: P1, p2: P2 },
        { slot_no: 2, p1: P2, p2: null },
      ],
      overrideReason: 'late arrival',
    });
  });

  it('defaults the reason to empty', () => {
    expect(
      parseLineupForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
          ['slot-1-p1', P1],
        ]),
      )?.overrideReason,
    ).toBe('');
  });

  it('rejects bad ids and a form without slots', () => {
    expect(parseLineupForm(form([['matchId', MATCH]]))).toBeNull();
    expect(
      parseLineupForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
          ['slot-1-p1', 'nope'],
        ]),
      ),
    ).toBeNull();
    expect(
      parseLineupForm(
        form([
          ['matchId', MATCH],
          ['teamId', TEAM],
        ]),
      ),
    ).toBeNull();
  });
});

describe('lineupEditable', () => {
  it('is open only while the match is scheduled', () => {
    expect(lineupEditable('scheduled')).toBe(true);
    expect(lineupEditable('lineup_locked')).toBe(false);
    expect(lineupEditable('completed')).toBe(false);
  });
});

describe('slotOptions', () => {
  const players: LineupPlayer[] = [1, 2, 3, 4, 5, 6, 7].map((rank) => ({
    id: `p${rank}`,
    name: `Player ${rank}`,
    rank,
    skillPoints: 40 - rank,
  }));
  const ids = (list: LineupPlayer[]) => list.map((p) => p.id);

  it('offers every present player in an open slot', () => {
    expect(ids(slotOptions(players, 'open', DEFAULT_SEASON_SETTINGS, [null, null]))).toHaveLength(7);
  });

  it('filters low and high slots by their rank range', () => {
    expect(ids(slotOptions(players, 'low', DEFAULT_SEASON_SETTINGS, [null, null]))).toEqual(['p4', 'p5', 'p6', 'p7']);
    expect(ids(slotOptions(players, 'high', DEFAULT_SEASON_SETTINGS, [null, null]))).toEqual(['p1', 'p2', 'p3']);
  });

  it('keeps a current pick that no longer fits', () => {
    expect(ids(slotOptions(players, 'high', DEFAULT_SEASON_SETTINGS, ['p6', null]))).toEqual(['p1', 'p2', 'p3', 'p6']);
  });
});

describe('unresolvedViolations and overridable', () => {
  const maxSets: LineupViolation = { code: 'MAX_SETS', message_key: 'Lineup.violations.MAX_SETS' };
  const consecutive: LineupViolation = { code: 'CONSECUTIVE', slotNo: 2, message_key: 'Lineup.violations.CONSECUTIVE' };
  const minPresent: LineupViolation = { code: 'MIN_PRESENT', message_key: 'Lineup.violations.MIN_PRESENT' };

  it('drops the overridden rules', () => {
    expect(unresolvedViolations([maxSets, consecutive], new Set(['MAX_SETS']))).toEqual([consecutive]);
    expect(unresolvedViolations([maxSets], new Set())).toEqual([maxSets]);
  });

  it('never lets MIN_PRESENT through', () => {
    expect(unresolvedViolations([minPresent], new Set(['MIN_PRESENT']))).toEqual([minPresent]);
    expect(overridable([maxSets, consecutive])).toBe(true);
    expect(overridable([maxSets, minPresent])).toBe(false);
  });
});

describe('handicapPreview', () => {
  const skillOf = new Map([
    ['h1', 33],
    ['h2', 30],
    ['h3', 20],
    ['h4', 20],
    ['a1', 30],
    ['a2', 24],
    ['a3', 25],
    ['a4', 25],
  ]);
  const slot = (slotNo: number, home: [string | null, string | null], away: [string | null, string | null]) =>
    ({ slotNo, slotType: 'open', home, away }) satisfies LineupSlotPicks;

  it('gives the weaker group pair its capped start, null until both pairs are picked', () => {
    // 63 v 54: the away pair starts with 9 (spec §4.2).
    expect(
      handicapPreview(
        'group',
        [slot(2, ['h1', null], ['a1', 'a2']), slot(1, ['h1', 'h2'], ['a1', 'a2'])],
        skillOf,
        DEFAULT_SEASON_SETTINGS,
      ),
    ).toEqual({ kind: 'group', slots: [{ home: 0, away: 9 }, null] });
  });

  it('sums the relay legs once every leg is picked', () => {
    // Leg 1 nets +9 for home, leg 2 nets −10: home starts leg 1 with 1 (spec §4.3, A1).
    expect(
      handicapPreview(
        'final',
        [slot(1, ['h1', 'h2'], ['a1', 'a2']), slot(2, ['h3', 'h4'], ['a3', 'a4'])],
        skillOf,
        DEFAULT_SEASON_SETTINGS,
      ),
    ).toEqual({ kind: 'relay', start: { home: 1, away: 0 }, net: -1 });
    expect(
      handicapPreview(
        'final',
        [slot(1, ['h1', 'h2'], ['a1', 'a2']), slot(2, ['h3', null], ['a3', 'a4'])],
        skillOf,
        DEFAULT_SEASON_SETTINGS,
      ),
    ).toEqual({ kind: 'relay', start: null, net: null });
  });

  it('treats an unknown player as not picked', () => {
    expect(handicapPreview('group', [slot(1, ['h1', 'x'], ['a1', 'a2'])], skillOf, DEFAULT_SEASON_SETTINGS)).toEqual({
      kind: 'group',
      slots: [null],
    });
  });
});

describe('lockSnapshot', () => {
  const skillOf = new Map([
    ['h1', 33],
    ['h2', 30],
    ['h3', 20],
    ['h4', 20],
    ['a1', 30],
    ['a2', 24],
    ['a3', 25],
    ['a4', 25],
  ]);
  const slot = (slotNo: number, home: [string | null, string | null], away: [string | null, string | null]) =>
    ({ slotNo, slotType: 'open', home, away }) satisfies LineupSlotPicks;

  it('stores the group start points with the players they were computed from', () => {
    expect(
      lockSnapshot(
        'group',
        [slot(2, ['h3', 'h4'], ['a3', 'a4']), slot(1, ['h1', 'h2'], ['a1', 'a2'])],
        skillOf,
        DEFAULT_SEASON_SETTINGS,
      ),
    ).toEqual({
      slots: [
        { slot_no: 1, home_p1: 'h1', home_p2: 'h2', away_p1: 'a1', away_p2: 'a2', handicap_home: 0, handicap_away: 9 },
        { slot_no: 2, home_p1: 'h3', home_p2: 'h4', away_p1: 'a3', away_p2: 'a4', handicap_home: 10, handicap_away: 0 },
      ],
      relay: undefined,
    });
  });

  it('stores the relay start once, with 0–0 per leg', () => {
    const snapshot = lockSnapshot(
      'semi_final',
      [slot(1, ['h1', 'h2'], ['a1', 'a2']), slot(2, ['h3', 'h4'], ['a3', 'a4'])],
      skillOf,
      DEFAULT_SEASON_SETTINGS,
    );
    expect(snapshot?.relay).toEqual({ home: 1, away: 0 });
    expect(snapshot?.slots.map((s) => [s.handicap_home, s.handicap_away])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('is null while a pair is incomplete', () => {
    expect(lockSnapshot('group', [slot(1, ['h1', null], ['a1', 'a2'])], skillOf, DEFAULT_SEASON_SETTINGS)).toBeNull();
    expect(lockSnapshot('final', [slot(1, ['h1', 'h2'], [null, 'a2'])], skillOf, DEFAULT_SEASON_SETTINGS)).toBeNull();
  });
});
