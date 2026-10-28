import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import {
  matchOutcome,
  parseScoreForm,
  scoreState,
  scoresEditable,
  slotScoreViolations,
  withScore,
  type ScoreSlot,
} from './match-scores';

const MATCH = '11111111-1111-4111-8111-111111111111';

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
    expect(slotScoreViolations(slots, 1, DEFAULT_SEASON_SETTINGS).map((v) => v.code)).toEqual(['BELOW_HANDICAP']);
    expect(slotScoreViolations(slots, 2, DEFAULT_SEASON_SETTINGS).map((v) => v.code)).toEqual(['SET_TARGET']);
    expect(slotScoreViolations(withScore(slots, 1, { home: 31, away: 9 }), 1, DEFAULT_SEASON_SETTINGS)).toEqual([]);
  });
});

describe('matchOutcome', () => {
  const played = [set(1, [31, 20]), set(2, [25, 31]), set(3, [31, 30]), set(4, [10, 31]), set(5, [31, 29])];

  it('gives the match to the side with more sets once all five are in', () => {
    expect(matchOutcome(played, DEFAULT_SEASON_SETTINGS)).toEqual({ winner: 'home', score: { home: 3, away: 2 } });
  });

  it('has no winner while a set is missing or invalid', () => {
    expect(matchOutcome(withScore(played, 5, { home: 30, away: 29 }), DEFAULT_SEASON_SETTINGS).winner).toBeNull();
    expect(matchOutcome([...played.slice(0, 4), set(5, null)], DEFAULT_SEASON_SETTINGS)).toEqual({
      winner: null,
      score: { home: 2, away: 2 },
    });
  });
});
