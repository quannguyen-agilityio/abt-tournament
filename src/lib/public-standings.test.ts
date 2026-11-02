import { describe, expect, it } from 'vitest';
import type { MatchStage, MatchStatus, StandingsMatch } from '../domain';
import { DEFAULT_SEASON_SETTINGS } from '../domain';
import { buildStandingsView, type PublicTeam } from './public-standings';

const settings = DEFAULT_SEASON_SETTINGS;

let seq = 0;

/** A match where home wins `homeSets` of 5 sets, each won 31–20. */
function match(
  home: string,
  away: string,
  homeSets: number,
  extra: { status?: MatchStatus; stage?: MatchStage; forfeit?: string; sets?: [number, number][] } = {},
): StandingsMatch {
  const sets =
    extra.sets ?? Array.from({ length: 5 }, (_, i): [number, number] => (i < homeSets ? [31, 20] : [20, 31]));
  return {
    id: `m${++seq}`,
    stage: extra.stage ?? 'group',
    status: extra.status ?? 'completed',
    home_team_id: home,
    away_team_id: away,
    forfeit_team_id: extra.forfeit ?? null,
    slots: sets.map(([h, a], i) => ({ slot_no: i + 1, score_home: h, score_away: a })),
  };
}

const team = (id: string, extra: Partial<PublicTeam> = {}): PublicTeam => ({
  id,
  name: `Team ${id}`,
  color: '#112233',
  disqualified: false,
  disqualifiedReason: null,
  ...extra,
});

const ids = (view: ReturnType<typeof buildStandingsView>) => view.rows.map((r) => r.teamId);

// A beats everyone, B beats C, D and E, C beats D and E, D beats E.
const ladder = [
  match('A', 'B', 3),
  match('A', 'C', 3),
  match('A', 'D', 3),
  match('A', 'E', 3),
  match('B', 'C', 3),
  match('B', 'D', 3),
  match('B', 'E', 3),
  match('C', 'D', 3),
  match('C', 'E', 3),
  match('D', 'E', 3),
];

describe('buildStandingsView', () => {
  it('orders the table and carries the columns and the team', () => {
    const teams = ['E', 'D', 'C', 'B', 'A'].map((id) => team(id));
    const view = buildStandingsView({ teams, matches: ladder, settings, finalOrder: null });
    expect(ids(view)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(view.rows[0]).toMatchObject({
      rank: 1,
      played: 4,
      won: 4,
      lost: 0,
      points: 4,
      setsWon: 12,
      setsLost: 8,
      setDiff: 4,
      hint: null,
      team: { id: 'A', name: 'Team A' },
    });
    expect(view.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks the top knockout_teams as qualifying', () => {
    const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => team(id));
    const view = buildStandingsView({ teams, matches: ladder, settings, finalOrder: null });
    expect(view.qualifyingCount).toBe(4);
    expect(view.rows.map((r) => r.qualifies)).toEqual([true, true, true, true, false]);
  });

  it('removes a disqualified team, lists it and ignores its annulled matches', () => {
    const teams = [team('A'), team('B'), team('C', { disqualified: true, disqualifiedReason: 'No show' })];
    const matches = [
      match('A', 'B', 3),
      match('A', 'C', 3, { status: 'annulled' }),
      match('C', 'B', 5, { status: 'annulled' }),
    ];
    const view = buildStandingsView({ teams, matches, settings, finalOrder: null });
    expect(ids(view)).toEqual(['A', 'B']);
    expect(view.disqualified.map((t) => t.id)).toEqual(['C']);
    expect(view.disqualified[0].disqualifiedReason).toBe('No show');
    expect(view.rows[0]).toMatchObject({ played: 1, points: 1 });
    expect(view.groupPlayed).toBe(1);
    expect(view.groupTotal).toBe(1);
  });

  it('hints head-to-head for teams level two by two on points', () => {
    const teams = ['A', 'B', 'C', 'D'].map((id) => team(id));
    // A and D win two each, B and C one each; D beat A and B beat C.
    const matches = [
      match('A', 'B', 3),
      match('A', 'C', 3),
      match('D', 'A', 3),
      match('D', 'B', 3),
      match('B', 'C', 3),
      match('C', 'D', 3),
    ];
    const view = buildStandingsView({ teams, matches, settings, finalOrder: null });
    expect(ids(view)).toEqual(['D', 'A', 'B', 'C']);
    expect(view.rows.map((r) => r.hint)).toEqual(['head_to_head', 'head_to_head', 'head_to_head', 'head_to_head']);
  });

  it('is provisional until the group is closed', () => {
    const teams = ['A', 'B'].map((id) => team(id));
    expect(buildStandingsView({ teams, matches: [], settings, finalOrder: null }).closed).toBe(false);
    expect(buildStandingsView({ teams, matches: [], settings, finalOrder: ['A', 'B'] }).closed).toBe(true);
  });

  it('hints draw_pending until closed, then draw', () => {
    const teams = ['A', 'B'].map((id) => team(id));
    const open = buildStandingsView({ teams, matches: [], settings, finalOrder: null });
    expect(open.rows.map((r) => r.hint)).toEqual(['draw_pending', 'draw_pending']);
    const closed = buildStandingsView({ teams, matches: [], settings, finalOrder: ['B', 'A'] });
    expect(closed.rows.map((r) => r.hint)).toEqual(['draw', 'draw']);
  });

  it('follows the final order once closed and renumbers the ranks', () => {
    const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => team(id));
    const view = buildStandingsView({ teams, matches: ladder, settings, finalOrder: ['C', 'A', 'B'] });
    // D and E are missing from the final order: they keep their computed order, after the rest.
    expect(ids(view)).toEqual(['C', 'A', 'B', 'D', 'E']);
    expect(view.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(view.rows.map((r) => r.qualifies)).toEqual([true, true, true, true, false]);
  });

  it('counts played and total group matches, leaving out annulled and knock-out ones', () => {
    const teams = ['A', 'B', 'C'].map((id) => team(id));
    const matches = [
      match('A', 'B', 3),
      match('A', 'C', 0, { status: 'forfeit', forfeit: 'C', sets: [] }),
      match('B', 'C', 0, { status: 'scheduled', sets: [] }),
      match('B', 'A', 3, { status: 'in_progress' }),
      match('C', 'A', 3, { status: 'annulled' }),
      match('A', 'B', 3, { stage: 'semi_final' }),
    ];
    const view = buildStandingsView({ teams, matches, settings, finalOrder: null });
    expect(view.groupPlayed).toBe(2);
    expect(view.groupTotal).toBe(4);
  });
});
