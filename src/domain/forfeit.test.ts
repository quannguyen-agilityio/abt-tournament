import { describe, expect, it } from 'vitest';
import {
  disqualifyTeam,
  groupForfeit,
  knockoutForfeit,
  reinstateTeam,
  type ForfeitMatch,
  type MatchStage,
  type MatchStatus,
} from './forfeit';
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

let nextId = 0;
const m = (
  stage: MatchStage,
  home: string | null,
  away: string | null,
  status: MatchStatus = 'scheduled',
  before: ForfeitMatch['status_before_annul'] = null,
): ForfeitMatch => ({
  id: `m${++nextId}`,
  stage,
  status,
  status_before_annul: before,
  home_team_id: home,
  away_team_id: away,
});

describe('disqualifyTeam: group stage (A4)', () => {
  const played = m('group', 'A', 'B', 'completed');
  const forfeited = m('group', 'C', 'A', 'forfeit');
  const live = m('group', 'A', 'D', 'in_progress');
  const upcoming = m('group', 'E', 'A', 'lineup_locked');
  const others = m('group', 'B', 'C', 'completed');
  const matches = [played, forfeited, live, upcoming, others];

  it('annuls every group match of the team, played ones included', () => {
    expect(disqualifyTeam('A', matches, false)).toEqual({
      ok: true,
      changes: [
        { id: played.id, status: 'annulled', status_before_annul: 'completed' },
        { id: forfeited.id, status: 'annulled', status_before_annul: 'forfeit' },
        { id: live.id, status: 'annulled', status_before_annul: 'in_progress' },
        { id: upcoming.id, status: 'annulled', status_before_annul: 'lineup_locked' },
      ],
    });
  });

  it('leaves a match already annulled by an earlier disqualification as it is', () => {
    const annulled = m('group', 'A', 'F', 'annulled', 'completed');
    const result = disqualifyTeam('A', [annulled, played], false);
    expect(result).toEqual({
      ok: true,
      changes: [{ id: played.id, status: 'annulled', status_before_annul: 'completed' }],
    });
  });

  it('refuses a team with no matches', () => {
    expect(disqualifyTeam('Z', matches, false)).toEqual({
      ok: false,
      code: 'NOT_IN_SEASON',
      message_key: 'Disqualification.errors.NOT_IN_SEASON',
    });
  });
});

describe('disqualifyTeam: knock-out', () => {
  const group = m('group', 'A', 'B', 'completed');
  const sf1 = m('semi_final', 'A', 'D', 'completed');
  const sf2 = m('semi_final', 'B', 'C', 'completed');
  const third = m('third_place', 'D', 'C');
  const final = m('final', 'A', 'B', 'lineup_locked');
  const matches = [group, sf1, sf2, third, final];

  it('forfeits the next match and leaves group results as they are', () => {
    expect(disqualifyTeam('B', matches, true)).toEqual({
      ok: true,
      changes: [{ id: final.id, status: 'forfeit', forfeit_team_id: 'B', forfeitSide: 'away' }],
    });
  });

  it('picks the semi-final before a later match', () => {
    const sf = m('semi_final', 'A', 'D');
    const placeholder = m('final', null, 'A');
    expect(disqualifyTeam('A', [placeholder, sf], true)).toEqual({
      ok: true,
      changes: [{ id: sf.id, status: 'forfeit', forfeit_team_id: 'A', forfeitSide: 'home' }],
    });
  });

  it('refuses when the team has no match left to play', () => {
    expect(disqualifyTeam('C', [group, sf2, m('third_place', 'D', 'C', 'completed')], true)).toMatchObject({
      ok: false,
      code: 'NO_NEXT_MATCH',
    });
  });
});

describe('reinstateTeam', () => {
  const played = m('group', 'A', 'B', 'annulled', 'completed');
  const upcoming = m('group', 'C', 'A', 'annulled', 'scheduled');
  const forfeited = m('group', 'A', 'D', 'annulled', 'forfeit');
  const others = m('group', 'B', 'C', 'completed');

  it('restores status_before_annul on every annulled group match of the team', () => {
    expect(reinstateTeam('A', [played, upcoming, forfeited, others], false)).toEqual({
      ok: true,
      changes: [
        { id: played.id, status: 'completed', status_before_annul: null },
        { id: upcoming.id, status: 'scheduled', status_before_annul: null },
        { id: forfeited.id, status: 'forfeit', status_before_annul: null },
      ],
    });
  });

  it('undoes disqualifyTeam', () => {
    const matches = [m('group', 'A', 'B', 'completed'), m('group', 'C', 'A', 'in_progress')];
    const disqualified = disqualifyTeam('A', matches, false);
    if (!disqualified.ok) throw new Error('expected ok');
    const annulled = matches.map((match) => ({ ...match, ...disqualified.changes.find((c) => c.id === match.id) }));
    const reinstated = reinstateTeam('A', annulled as ForfeitMatch[], false);
    if (!reinstated.ok) throw new Error('expected ok');
    const restored = annulled.map((match) => ({ ...match, ...reinstated.changes.find((c) => c.id === match.id) }));
    expect(restored).toEqual(matches);
  });

  it('keeps a match annulled while its opponent is still disqualified', () => {
    expect(reinstateTeam('A', [played, upcoming], false, ['A', 'B'])).toEqual({
      ok: true,
      changes: [{ id: upcoming.id, status: 'scheduled', status_before_annul: null }],
    });
  });

  it('is refused once the group is closed', () => {
    expect(reinstateTeam('A', [played, upcoming], true)).toEqual({
      ok: false,
      code: 'GROUP_CLOSED',
      message_key: 'Disqualification.errors.GROUP_CLOSED',
    });
  });
});
