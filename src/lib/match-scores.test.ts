import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import {
  matchOutcome,
  parseScoreForm,
  scoreState,
  scoreRules,
  scoresEditable,
  slotEnterable,
  slotScoreViolations,
  withScore,
  type ScoreRules,
  type ScoreSlot,
} from './match-scores';

const MATCH = '11111111-1111-4111-8111-111111111111';
const GROUP: ScoreRules = { relay: false };
const relay = (home: number, away: number): ScoreRules => ({ relay: true, start: { home, away } });

function form(values: [string, string][]): FormData {
  const formData = new FormData();
  for (const [key, value] of values) formData.append(key, value);
  return formData;
}

function set(slot_no: number, score: [number, number] | null, start: [number, number] = [0, 0]): ScoreSlot {
  return {
    slot_no,
    score_home: score?.[0] ?? null,
    score_away: score?.[1] ?? null,
    handicap_home: start[0],
    handicap_away: start[1],
  };
}

describe('parseScoreForm', () => {
  it('reads the match, slot and both scores', () => {
    expect(
      parseScoreForm(
        form([
          ['matchId', MATCH],
          ['slotNo', '2'],
          ['home', ' 31 '],
          ['away', '0'],
        ]),
      ),
    ).toEqual({ matchId: MATCH, slotNo: 2, score: { home: 31, away: 0 } });
  });

  it.each([
    ['a missing score', [['home', '31']]],
    [
      'an empty score',
      [
        ['home', '31'],
        ['away', ''],
      ],
    ],
    [
      'a negative score',
      [
        ['home', '31'],
        ['away', '-1'],
      ],
    ],
    [
      'a decimal score',
      [
        ['home', '31'],
        ['away', '2.5'],
      ],
    ],
    [
      'a score that does not fit',
      [
        ['home', '31'],
        ['away', '99999'],
      ],
    ],
  ] as [string, [string, string][]][])('refuses %s', (_, scores) => {
    expect(parseScoreForm(form([['matchId', MATCH], ['slotNo', '1'], ...scores]))).toBeNull();
  });

  it('refuses a bad match id or slot number', () => {
    const scores: [string, string][] = [
      ['home', '31'],
      ['away', '20'],
    ];
    expect(parseScoreForm(form([['matchId', 'x'], ['slotNo', '1'], ...scores]))).toBeNull();
    expect(parseScoreForm(form([['matchId', MATCH], ['slotNo', '0'], ...scores]))).toBeNull();
    expect(parseScoreForm(form([['matchId', MATCH], ['slotNo', '1.5'], ...scores]))).toBeNull();
  });
});

describe('scoresEditable', () => {
  it('allows scores from the lock until completion', () => {
    expect(scoresEditable('lineup_locked')).toBe(true);
    expect(scoresEditable('in_progress')).toBe(true);
    for (const status of ['scheduled', 'completed', 'forfeit', 'annulled']) expect(scoresEditable(status)).toBe(false);
  });
});

describe('scoreState', () => {
  it('lists the scores and start points in slot order, without other fields', () => {
    const slots = [{ ...set(2, [31, 20], [0, 4]), slot_type: 'low' }, set(1, null)];
    expect(scoreState(slots)).toEqual([
      { slot_no: 1, score_home: null, score_away: null, handicap_home: 0, handicap_away: 0 },
      { slot_no: 2, score_home: 31, score_away: 20, handicap_home: 0, handicap_away: 4 },
    ]);
  });
});

describe('withScore', () => {
  it('replaces only the given slot', () => {
    const slots = [set(1, [31, 10]), set(2, null)];
    expect(withScore(slots, 2, { home: 12, away: 31 })).toEqual([set(1, [31, 10]), set(2, [12, 31])]);
    expect(slots[1].score_home).toBeNull();
  });
});

describe('slotScoreViolations', () => {
  it('checks the target and the start points of the set', () => {
    const slots = [set(1, [31, 5], [0, 9]), set(2, [30, 29])];
    expect(slotScoreViolations(GROUP, slots, 1, DEFAULT_SEASON_SETTINGS).map((v) => v.code)).toEqual([
      'BELOW_HANDICAP',
    ]);
    expect(slotScoreViolations(GROUP, slots, 2, DEFAULT_SEASON_SETTINGS).map((v) => v.code)).toEqual(['SET_TARGET']);
    expect(slotScoreViolations(GROUP, withScore(slots, 1, { home: 31, away: 9 }), 1, DEFAULT_SEASON_SETTINGS)).toEqual(
      [],
    );
  });
});

describe('matchOutcome', () => {
  const played = [set(1, [31, 20]), set(2, [25, 31]), set(3, [31, 30]), set(4, [10, 31]), set(5, [31, 29])];

  it('gives the match to the side with more sets once all five are in', () => {
    expect(matchOutcome(GROUP, played, DEFAULT_SEASON_SETTINGS)).toEqual({
      winner: 'home',
      score: { home: 3, away: 2 },
      warnings: [],
    });
  });

  it('has no winner while a set is missing or invalid', () => {
    expect(
      matchOutcome(GROUP, withScore(played, 5, { home: 30, away: 29 }), DEFAULT_SEASON_SETTINGS).winner,
    ).toBeNull();
    expect(matchOutcome(GROUP, [...played.slice(0, 4), set(5, null)], DEFAULT_SEASON_SETTINGS)).toEqual({
      winner: null,
      score: { home: 2, away: 2 },
      warnings: [],
    });
  });
});

describe('scoreRules', () => {
  it('scores group sets, or relay legs from the snapshot start', () => {
    expect(scoreRules({ stage: 'group', relay_handicap_home: null, relay_handicap_away: null })).toEqual(GROUP);
    expect(scoreRules({ stage: 'final', relay_handicap_home: 0, relay_handicap_away: 12 })).toEqual(relay(0, 12));
    expect(scoreRules({ stage: 'semi_final', relay_handicap_home: null, relay_handicap_away: null })).toEqual(
      relay(0, 0),
    );
  });
});

describe('relay legs', () => {
  const legs = [set(1, [25, 18]), set(2, [41, 50]), set(3, [45, 75]), set(4, [100, 92]), set(5, [118, 125])];
  const empty = [1, 2, 3, 4, 5].map((n) => set(n, null));

  it('checks a leg against the start, the milestone and the legs before it', () => {
    const first = (score: [number, number]) =>
      slotScoreViolations(
        relay(0, 9),
        withScore(empty, 1, { home: score[0], away: score[1] }),
        1,
        DEFAULT_SEASON_SETTINGS,
      );
    expect(first([25, 9])).toEqual([]);
    expect(first([25, 8]).map((v) => v.code)).toEqual(['LEG_DECREASING']);
    expect(first([24, 20]).map((v) => v.code)).toEqual(['LEG_MILESTONE']);
  });

  it('refuses a leg entered before the one it builds on', () => {
    const skipped = withScore(withScore(empty, 1, { home: 25, away: 18 }), 3, { home: 75, away: 60 });
    expect(slotScoreViolations(relay(0, 0), skipped, 3, DEFAULT_SEASON_SETTINGS)).toEqual([
      expect.objectContaining({ code: 'LEG_OUT_OF_ORDER', slotNo: 3, params: { leg: 2 } }),
    ]);
  });

  it('refuses a change that no longer fits a later saved leg', () => {
    const changed = withScore(legs, 2, { home: 50, away: 30 });
    expect(slotScoreViolations(relay(0, 0), changed, 2, DEFAULT_SEASON_SETTINGS)).toEqual([
      expect.objectContaining({ code: 'LEG_DECREASING', slotNo: 3, side: 'home', params: { previous: 50 } }),
    ]);
  });

  it('opens a leg once the leg before it is saved', () => {
    expect(slotEnterable(relay(0, 0), empty, 1)).toBe(true);
    expect(slotEnterable(relay(0, 0), empty, 2)).toBe(false);
    expect(slotEnterable(relay(0, 0), withScore(empty, 1, { home: 25, away: 3 }), 2)).toBe(true);
    expect(slotEnterable(GROUP, empty, 4)).toBe(true);
  });

  it('gives the match to the side at the final milestone', () => {
    expect(matchOutcome(relay(0, 0), legs, DEFAULT_SEASON_SETTINGS)).toEqual({
      winner: 'away',
      score: { home: 118, away: 125 },
      warnings: [],
    });
    expect(matchOutcome(relay(4, 0), legs.slice(0, 3), DEFAULT_SEASON_SETTINGS)).toMatchObject({
      winner: null,
      score: { home: 45, away: 75 },
    });
    expect(matchOutcome(relay(0, 7), empty, DEFAULT_SEASON_SETTINGS).score).toEqual({ home: 0, away: 7 });
  });

  it('warns when the cap reaches the first milestone', () => {
    const settings = { ...DEFAULT_SEASON_SETTINGS, ko_handicap_cap: 25 };
    expect(matchOutcome(relay(0, 0), empty, settings).warnings.map((w) => w.code)).toEqual([
      'KO_CAP_REACHES_MILESTONE',
    ]);
  });
});
