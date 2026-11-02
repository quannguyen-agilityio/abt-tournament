import { describe, expect, it } from 'vitest';
import type { Handicap } from './handicap';
import {
  groupMatchResult,
  validateGroupSet,
  validateRelayLegs,
  type GroupSetScore,
  type ScoreViolation,
  type SlotScore,
} from './score';
import { DEFAULT_SEASON_SETTINGS } from './settings';

const settings = DEFAULT_SEASON_SETTINGS;

const key = (v: ScoreViolation<string>) => `${v.code}@${v.slotNo ?? ''}:${v.side ?? ''}`;

type Pair = [number | null, number | null];

const set = ([home, away]: Pair, handicap: Handicap = { home: 0, away: 0 }, slotNo = 1): GroupSetScore => ({
  slot_no: slotNo,
  score_home: home,
  score_away: away,
  handicap_home: handicap.home,
  handicap_away: handicap.away,
});

describe('validateGroupSet', () => {
  it.each<[string, Pair, Handicap, 'home' | 'away']>([
    ['home reaches 31', [31, 29], { home: 0, away: 0 }, 'home'],
    ['away reaches 31 from a 9-point start', [20, 31], { home: 0, away: 9 }, 'away'],
    ['no 2-point lead is needed', [30, 31], { home: 0, away: 0 }, 'away'],
    ['the side with a start may score nothing more', [31, 9], { home: 0, away: 9 }, 'home'],
  ])('passes: %s', (_name, score, handicap, winner) => {
    expect(validateGroupSet(set(score, handicap), settings)).toEqual({ winner, violations: [] });
  });

  it.each<[string, Pair, Handicap, string[]]>([
    ['neither side at 31', [30, 28], { home: 0, away: 0 }, ['SET_TARGET@1:']],
    ['both sides at 31', [31, 31], { home: 0, away: 0 }, ['SET_TARGET@1:']],
    ['a side above 31', [33, 31], { home: 0, away: 0 }, ['SET_TARGET@1:']],
    ['away below its start points', [31, 5], { home: 0, away: 9 }, ['BELOW_HANDICAP@1:away']],
    ['home below its start points', [3, 31], { home: 4, away: 0 }, ['BELOW_HANDICAP@1:home']],
    ['only one score entered', [31, null], { home: 0, away: 0 }, ['SCORE_INCOMPLETE@1:']],
    ['a negative score', [31, -1], { home: 0, away: 0 }, ['SCORE_INVALID@1:away']],
    ['a fractional score', [30.5, 31], { home: 0, away: 0 }, ['SCORE_INVALID@1:home']],
  ])('fails: %s', (_name, score, handicap, expected) => {
    const result = validateGroupSet(set(score, handicap), settings);
    expect(result.winner).toBeNull();
    expect(result.violations.map(key)).toEqual(expected);
  });

  it('returns nothing for a set not entered yet', () => {
    expect(validateGroupSet(set([null, null]), settings)).toEqual({ winner: null, violations: [] });
  });

  it('builds the message key and passes ICU params', () => {
    expect(validateGroupSet(set([31, 5], { home: 0, away: 9 }, 3), settings).violations).toEqual([
      {
        code: 'BELOW_HANDICAP',
        slotNo: 3,
        side: 'away',
        message_key: 'Score.violations.BELOW_HANDICAP',
        params: { handicap: 9 },
      },
    ]);
  });

  it('uses the season set_target', () => {
    expect(validateGroupSet(set([21, 19]), { set_target: 21 }).winner).toBe('home');
  });
});

/** Cumulative leg scores, leg i in slot i + 1. */
const legs = (scores: Pair[]): SlotScore[] =>
  scores.map(([home, away], i) => ({ slot_no: i + 1, score_home: home, score_away: away }));

const noStart: Handicap = { home: 0, away: 0 };

/** A complete relay that away wins 125–118 from a 10-point start. */
const fullRelay = (): Pair[] => [
  [25, 21],
  [50, 44],
  [68, 75],
  [100, 97],
  [118, 125],
];

describe('validateRelayLegs', () => {
  it('passes a complete relay and names the side at the final milestone', () => {
    expect(validateRelayLegs(legs(fullRelay()), { home: 0, away: 10 }, settings)).toEqual({
      winner: 'away',
      score: { home: 118, away: 125 },
      violations: [],
      warnings: [],
    });
  });

  it('has no winner while legs are still to play', () => {
    const partial = legs([...fullRelay().slice(0, 2), [null, null], [null, null], [null, null]]);
    expect(validateRelayLegs(partial, noStart, settings)).toMatchObject({
      winner: null,
      score: { home: 50, away: 44 },
      violations: [],
    });
  });

  it('reports the start handicap as the score before leg 1', () => {
    expect(validateRelayLegs([], { home: 12, away: 0 }, settings).score).toEqual({ home: 12, away: 0 });
  });

  it('lets a side score nothing in a leg', () => {
    const scores: Pair[] = [
      [25, 10],
      [50, 10],
      [75, 10],
      [100, 10],
      [125, 10],
    ];
    expect(validateRelayLegs(legs(scores), { home: 0, away: 10 }, settings).winner).toBe('home');
  });

  it.each<[string, Pair[], Handicap, string[]]>([
    [
      'leg 2 ends short of its milestone',
      [
        [25, 20],
        [49, 44],
      ],
      noStart,
      ['LEG_MILESTONE@2:'],
    ],
    ['leg 1 runs past its milestone', [[26, 20]], noStart, ['LEG_MILESTONE@1:']],
    ['both sides at the milestone', [[25, 25]], noStart, ['LEG_MILESTONE@1:']],
    [
      'home goes down in leg 2',
      [
        [25, 20],
        [24, 50],
      ],
      noStart,
      ['LEG_DECREASING@2:home'],
    ],
    ['away below its start in leg 1', [[25, 8]], { home: 0, away: 10 }, ['LEG_DECREASING@1:away']],
    [
      'leg 3 entered before leg 2',
      [
        [25, 20],
        [null, null],
        [75, 60],
      ],
      noStart,
      ['LEG_OUT_OF_ORDER@3:'],
    ],
    [
      'leg 2 has only one score',
      [
        [25, 20],
        [50, null],
      ],
      noStart,
      ['SCORE_INCOMPLETE@2:'],
    ],
    ['a negative score', [[25, -1]], noStart, ['SCORE_INVALID@1:away']],
  ])('fails: %s', (_name, scores, start, expected) => {
    const result = validateRelayLegs(legs(scores), start, settings);
    expect(result.winner).toBeNull();
    expect(result.violations.map(key)).toEqual(expected);
  });

  it('flags a missing leg row as out of order', () => {
    const [first, , third] = legs(fullRelay());
    const result = validateRelayLegs([third, first], noStart, settings);
    expect(result.violations).toEqual([
      { code: 'LEG_OUT_OF_ORDER', slotNo: 3, message_key: 'Score.violations.LEG_OUT_OF_ORDER', params: { leg: 2 } },
    ]);
  });

  it('stops at the first bad leg and keeps the score before it', () => {
    const scores = fullRelay();
    scores[1] = [40, 44];
    const result = validateRelayLegs(legs(scores), noStart, settings);
    expect(result.violations.map(key)).toEqual(['LEG_MILESTONE@2:']);
    expect(result.score).toEqual({ home: 25, away: 21 });
  });

  it('checks legs in slot_no order whatever the input order', () => {
    const result = validateRelayLegs(legs(fullRelay()).reverse(), { home: 0, away: 10 }, settings);
    expect(result.violations).toEqual([]);
    expect(result.winner).toBe('away');
  });

  it('passes the milestone and previous score as ICU params', () => {
    const { violations } = validateRelayLegs(
      legs([
        [25, 20],
        [50, 15],
      ]),
      noStart,
      settings,
    );
    expect(violations).toEqual([
      {
        code: 'LEG_DECREASING',
        slotNo: 2,
        side: 'away',
        message_key: 'Score.violations.LEG_DECREASING',
        params: { previous: 20 },
      },
    ]);
  });

  describe('KO_CAP_REACHES_MILESTONE warning', () => {
    it('warns when the knock-out cap reaches the first milestone', () => {
      const result = validateRelayLegs([], noStart, { ...settings, ko_handicap_cap: 25 });
      expect(result.warnings).toEqual([
        {
          code: 'KO_CAP_REACHES_MILESTONE',
          message_key: 'Score.warnings.KO_CAP_REACHES_MILESTONE',
          params: { cap: 25, milestone: 25 },
        },
      ]);
    });

    it('does not warn below the first milestone (default 15 < 25)', () => {
      expect(validateRelayLegs([], noStart, settings).warnings).toEqual([]);
    });
  });
});

/** Group sets with their start points, slot i + 1. */
const groupSets = (rows: [Pair, Handicap?][]): GroupSetScore[] =>
  rows.map(([score, handicap], i) => set(score, handicap, i + 1));

describe('groupMatchResult', () => {
  it('decides on sets won and sums scoreboard points including the handicap (D14)', () => {
    const result = groupMatchResult(
      groupSets([
        [[31, 25]],
        [[20, 31], { home: 0, away: 9 }],
        [[31, 30]],
        [[31, 12], { home: 0, away: 12 }],
        [[18, 31], { home: 5, away: 0 }],
      ]),
      settings,
    );
    expect(result).toEqual({
      winner: 'home',
      setsWon: { home: 3, away: 2 },
      // The 12 away scored from a 12-point start counts as scoreboard points.
      points: { home: 131, away: 129 },
      violations: [],
    });
  });

  it('lets the side with fewer points win on sets', () => {
    const result = groupMatchResult(groupSets([[[31, 30]], [[31, 29]], [[31, 28]], [[0, 31]], [[0, 31]]]), settings);
    expect(result.winner).toBe('home');
    expect(result.points).toEqual({ home: 93, away: 149 });
  });

  it('has no winner until every set is entered', () => {
    const result = groupMatchResult(
      groupSets([[[31, 25]], [[31, 20]], [[31, 10]], [[null, null]], [[null, null]]]),
      settings,
    );
    expect(result).toEqual({
      winner: null,
      setsWon: { home: 3, away: 0 },
      points: { home: 93, away: 55 },
      violations: [],
    });
  });

  it('has no winner and skips the set when a set is invalid', () => {
    const result = groupMatchResult(
      groupSets([[[31, 25]], [[31, 31]], [[31, 10]], [[20, 31]], [[31, 5], { home: 0, away: 9 }]]),
      settings,
    );
    expect(result.winner).toBeNull();
    expect(result.violations.map(key)).toEqual(['SET_TARGET@2:', 'BELOW_HANDICAP@5:away']);
    expect(result.setsWon).toEqual({ home: 2, away: 1 });
    expect(result.points).toEqual({ home: 82, away: 66 });
  });

  it('uses the season sets_per_match', () => {
    const result = groupMatchResult(groupSets([[[31, 25]], [[20, 31]], [[31, 10]]]), {
      ...settings,
      sets_per_match: 3,
    });
    expect(result.winner).toBe('home');
  });
});
