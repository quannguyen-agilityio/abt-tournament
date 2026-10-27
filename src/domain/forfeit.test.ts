import { describe, expect, it } from 'vitest';
import { groupForfeit, knockoutForfeit } from './forfeit';
import { groupMatchResult, validateRelayLegs } from './score';
import { DEFAULT_SEASON_SETTINGS } from './settings';

const settings = DEFAULT_SEASON_SETTINGS;

describe('groupForfeit', () => {
  it('gives the home side 5–0 in sets and 31–0 in every set when away forfeits', () => {
    const result = groupForfeit('away', settings);
    expect(result.winner).toBe('home');
    expect(result.setsWon).toEqual({ home: 5, away: 0 });
    expect(result.points).toEqual({ home: 155, away: 0 });
    expect(result.sets).toHaveLength(5);
    for (const [i, set] of result.sets.entries()) {
      expect(set).toEqual({ slot_no: i + 1, score_home: 31, score_away: 0, handicap_home: 0, handicap_away: 0 });
    }
  });

  it('gives the away side the win when home forfeits', () => {
    const result = groupForfeit('home', settings);
    expect(result.winner).toBe('away');
    expect(result.setsWon).toEqual({ home: 0, away: 5 });
    expect(result.sets.every((s) => s.score_home === 0 && s.score_away === 31)).toBe(true);
  });

  it('produces sets the score validation accepts', () => {
    const { winner, setsWon, points, sets } = groupForfeit('away', settings);
    expect(groupMatchResult(sets, settings)).toEqual({ winner, setsWon, points, violations: [] });
  });

  it('follows the season settings', () => {
    const result = groupForfeit('away', { set_target: 21, sets_per_match: 3 });
    expect(result.setsWon).toEqual({ home: 3, away: 0 });
    expect(result.points).toEqual({ home: 63, away: 0 });
  });
});

describe('knockoutForfeit', () => {
  it('records 125–0 for the side that advances', () => {
    expect(knockoutForfeit('away', settings)).toMatchObject({ winner: 'home', score: { home: 125, away: 0 } });
    expect(knockoutForfeit('home', settings)).toMatchObject({ winner: 'away', score: { home: 0, away: 125 } });
  });

  it('produces cumulative legs the relay validation accepts', () => {
    const { winner, score, legs } = knockoutForfeit('home', settings);
    expect(legs.map((l) => l.score_away)).toEqual([25, 50, 75, 100, 125]);
    const result = validateRelayLegs(legs, { home: 0, away: 0 }, settings);
    expect(result).toMatchObject({ winner, score, violations: [] });
  });
});
