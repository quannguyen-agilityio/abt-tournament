import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS, type StandingsMatch } from '../domain';
import type { ScheduleMatchInput } from './public-matches';
import type { PublicTeam } from './public-standings';
import { buildTeamCards, buildTeamDetail, sortPlayers, type PublicPlayer } from './public-teams';

const settings = DEFAULT_SEASON_SETTINGS;

const team = (id: string, extra: Partial<PublicTeam> = {}): PublicTeam => ({
  id,
  name: `Team ${id}`,
  color: '#112233',
  disqualified: false,
  disqualifiedReason: null,
  ...extra,
});

const player = (id: string, extra: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id,
  personId: `person-${id}`,
  slug: `player-${id}`,
  name: `Player ${id}`,
  gender: 'male',
  avatarUrl: null,
  teamId: 'A',
  rank: 1,
  skill: 10,
  status: 'active',
  ...extra,
});

/** A completed group match where home wins `homeSets` of 5 sets, each 31–20. */
const result = (id: string, home: string, away: string, homeSets: number): StandingsMatch => ({
  id,
  stage: 'group',
  status: 'completed',
  home_team_id: home,
  away_team_id: away,
  forfeit_team_id: null,
  slots: Array.from({ length: 5 }, (_, i) => ({
    slot_no: i + 1,
    score_home: i < homeSets ? 31 : 20,
    score_away: i < homeSets ? 20 : 31,
  })),
});

const scheduled = (code: string, home: string, away: string, at: string | null): ScheduleMatchInput => ({
  id: code,
  code,
  stage: 'group',
  round: 1,
  status: 'scheduled',
  home_team_id: home,
  away_team_id: away,
  forfeit_team_id: null,
  winner_team_id: null,
  scheduled_at: at,
  court_id: null,
  slots: [],
});

describe('sortPlayers', () => {
  it('orders by rank, then skill (high first), then name, with withdrawn players last', () => {
    const players = [
      player('w', { rank: 1, status: 'withdrawn' }),
      player('r2', { rank: 2 }),
      player('r1low', { rank: 1, skill: 5 }),
      player('r1b', { rank: 1, skill: 9, name: 'B' }),
      player('r1a', { rank: 1, skill: 9, name: 'A' }),
    ];
    expect(sortPlayers(players).map((p) => p.id)).toEqual(['r1a', 'r1b', 'r1low', 'r2', 'w']);
  });
});

describe('buildTeamCards', () => {
  it('lists teams in standings order with record, captain and position', () => {
    const cards = buildTeamCards({
      teams: [team('A'), team('B'), team('C')],
      captains: new Map([
        ['A', 'pa'],
        ['B', null],
      ]),
      players: [player('pa')],
      matches: [result('m1', 'B', 'A', 3), result('m2', 'B', 'C', 4), result('m3', 'C', 'A', 5)],
      settings,
      finalOrder: null,
    });

    expect(cards.map((c) => [c.team.id, c.position])).toEqual([
      ['B', 1],
      ['C', 2],
      ['A', 3],
    ]);
    const b = cards[0];
    expect(b.stats).toMatchObject({ won: 2, lost: 0, setsWon: 7, setsLost: 3, setDiff: 4, pointDiff: 44 });
    expect(b.captain).toBeNull();
    expect(cards[2].captain?.id).toBe('pa');
  });

  it('puts disqualified teams last without a position, and gives teams without a match zero stats', () => {
    const cards = buildTeamCards({
      teams: [team('A', { disqualified: true }), team('B')],
      captains: new Map(),
      players: [],
      matches: [],
      settings,
      finalOrder: null,
    });
    expect(cards.map((c) => [c.team.id, c.position])).toEqual([
      ['B', 1],
      ['A', null],
    ]);
    expect(cards[0].stats).toMatchObject({ played: 0, won: 0, setDiff: 0 });
  });
});

describe('buildTeamDetail', () => {
  it('keeps the team roster, strongest first', () => {
    const { roster } = buildTeamDetail({
      teamId: 'A',
      players: [player('x', { rank: 3 }), player('y', { teamId: 'B' }), player('z', { rank: 1 })],
      schedule: [],
      settings,
    });
    expect(roster.map((p) => p.id)).toEqual(['z', 'x']);
  });

  it("lists the team's matches by time, unscheduled ones last, with their score", () => {
    const { matches } = buildTeamDetail({
      teamId: 'A',
      players: [],
      schedule: [
        scheduled('V03', 'A', 'C', null),
        scheduled('V02', 'B', 'C', '2027-01-09T01:00:00+00:00'),
        scheduled('V05', 'C', 'A', '2027-01-09T03:00:00+00:00'),
        {
          ...scheduled('V01', 'A', 'B', '2027-01-09T01:00:00+00:00'),
          status: 'completed',
          winner_team_id: 'A',
          slots: [
            { slot_no: 1, score_home: 31, score_away: 20 },
            { slot_no: 2, score_home: 20, score_away: 31 },
            { slot_no: 3, score_home: 31, score_away: 25 },
          ],
        },
      ],
      settings,
    });
    expect(matches.map((m) => m.code)).toEqual(['V01', 'V05', 'V03']);
    expect(matches[0].score).toEqual({ home: 2, away: 1, winner: 'home' });
    expect(matches[1].score).toBeNull();
  });
});
