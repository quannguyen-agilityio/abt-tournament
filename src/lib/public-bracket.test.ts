import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain';
import { buildBracketView, type KnockoutMatchInput } from './public-bracket';

const settings = DEFAULT_SEASON_SETTINGS;
const ORDER = ['t1', 't2', 't3', 't4', 't5'];

const relay = (...legs: [number, number][]) =>
  legs.map(([h, a], i) => ({ slot_no: i + 1, score_home: h, score_away: a }));

function row(code: string, extra: Partial<KnockoutMatchInput> = {}): KnockoutMatchInput {
  return {
    code,
    status: 'scheduled',
    home_team_id: null,
    away_team_id: null,
    forfeit_team_id: null,
    forfeit_reason: null,
    scheduled_at: null,
    court: null,
    winner_team_id: null,
    slots: [],
    ...extra,
  };
}

const semis = [
  row('SF1', { home_team_id: 't1', away_team_id: 't4' }),
  row('SF2', { home_team_id: 't2', away_team_id: 't3' }),
];
const slot = (view: ReturnType<typeof buildBracketView>, code: string) => view.slots.find((s) => s.code === code)!;

describe('buildBracketView', () => {
  it('lists SF1, SF2, 3RD and F in that order with their sources', () => {
    const view = buildBracketView({ matches: [], finalOrder: null, settings });
    expect(view.slots.map((s) => s.code)).toEqual(['SF1', 'SF2', '3RD', 'F']);
    expect(view.slots.map((s) => [s.home.source, s.away.source])).toEqual([
      [
        { kind: 'seed', seed: 1 },
        { kind: 'seed', seed: 4 },
      ],
      [
        { kind: 'seed', seed: 2 },
        { kind: 'seed', seed: 3 },
      ],
      [
        { kind: 'loser', of: 'SF1' },
        { kind: 'loser', of: 'SF2' },
      ],
      [
        { kind: 'winner', of: 'SF1' },
        { kind: 'winner', of: 'SF2' },
      ],
    ]);
  });

  it('shows every team as TBD, without scores, until the group is closed', () => {
    const matches = [
      row('SF1', {
        status: 'in_progress',
        home_team_id: 't1',
        away_team_id: 't4',
        winner_team_id: 't1',
        slots: relay([25, 20]),
      }),
    ];
    const view = buildBracketView({ matches, finalOrder: null, settings });
    expect(view.closed).toBe(false);
    for (const s of view.slots) {
      expect([s.home.teamId, s.away.teamId, s.home.seed, s.home.score, s.away.score]).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
      expect(s.home.won || s.away.won).toBe(false);
    }
    expect(slot(view, 'SF1')).toMatchObject({ status: 'in_progress', exists: true });
  });

  it('takes the teams from the rows and the seeds from the final order once closed', () => {
    const view = buildBracketView({ matches: semis, finalOrder: ORDER, settings });
    expect(view.closed).toBe(true);
    expect(slot(view, 'SF1').home).toMatchObject({ teamId: 't1', seed: 1 });
    expect(slot(view, 'SF1').away).toMatchObject({ teamId: 't4', seed: 4 });
    expect(slot(view, 'SF2').home).toMatchObject({ teamId: 't2', seed: 2 });
    expect(slot(view, 'SF2').away).toMatchObject({ teamId: 't3', seed: 3 });
  });

  it('leaves the seed empty for a team missing from the final order', () => {
    const view = buildBracketView({ matches: semis, finalOrder: ['t1', 't2', 't3'], settings });
    expect(slot(view, 'SF1').away).toMatchObject({ teamId: 't4', seed: null });
  });

  it('reads a completed relay score from the last leg and marks the winner', () => {
    const matches = [
      row('SF1', {
        status: 'completed',
        home_team_id: 't1',
        away_team_id: 't4',
        winner_team_id: 't1',
        slots: relay([25, 20], [50, 41], [75, 66], [100, 90], [125, 111]),
      }),
    ];
    const sf1 = slot(buildBracketView({ matches, finalOrder: ORDER, settings }), 'SF1');
    expect([sf1.home.score, sf1.away.score]).toEqual([125, 111]);
    expect([sf1.home.won, sf1.away.won]).toEqual([true, false]);
  });

  it('shows the running score of a match in progress from the last scored leg', () => {
    const matches = [
      row('SF2', {
        status: 'in_progress',
        home_team_id: 't2',
        away_team_id: 't3',
        slots: [...relay([25, 20], [50, 55]), { slot_no: 3, score_home: null, score_away: null }],
      }),
    ];
    const sf2 = slot(buildBracketView({ matches, finalOrder: ORDER, settings }), 'SF2');
    expect([sf2.home.score, sf2.away.score]).toEqual([50, 55]);
    expect([sf2.home.won, sf2.away.won]).toEqual([false, false]);
  });

  it('scores a forfeit 125-0 for the side that did not forfeit', () => {
    const matches = [
      row('SF1', {
        status: 'forfeit',
        home_team_id: 't1',
        away_team_id: 't4',
        forfeit_team_id: 't1',
        forfeit_reason: 'No show',
        winner_team_id: 't4',
      }),
    ];
    const sf1 = slot(buildBracketView({ matches, finalOrder: ORDER, settings }), 'SF1');
    expect([sf1.home.score, sf1.away.score]).toEqual([0, 125]);
    expect([sf1.home.won, sf1.away.won]).toEqual([false, true]);
    expect(sf1.forfeitReason).toBe('No show');
  });

  it('marks a code with no row as missing', () => {
    const view = buildBracketView({ matches: semis, finalOrder: ORDER, settings });
    expect(slot(view, 'F')).toMatchObject({ status: null, exists: false, scheduledAt: null, court: null });
    expect(slot(view, 'F').home).toMatchObject({ teamId: null, score: null, won: false });
  });

  it('carries the schedule and court', () => {
    const matches = [row('F', { scheduled_at: '2026-06-20T09:00:00Z', court: 'Court 1' })];
    expect(slot(buildBracketView({ matches, finalOrder: null, settings }), 'F')).toMatchObject({
      scheduledAt: '2026-06-20T09:00:00Z',
      court: 'Court 1',
      exists: true,
    });
  });
});
