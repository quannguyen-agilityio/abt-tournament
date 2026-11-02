import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain';
import { buildBracketView, type KnockoutMatchInput } from './public-bracket';
import { buildHomeView, buildPodium } from './public-home';
import type { ScheduleMatchInput } from './public-matches';

const settings = DEFAULT_SEASON_SETTINGS;
const COURTS = [
  { id: 'c1', name: 'Sân 1' },
  { id: 'c2', name: 'Sân 2' },
  { id: 'c3', name: 'Sân 3' },
];

const slots = (...scores: [number, number][]) =>
  scores.map(([h, a], i) => ({ slot_no: i + 1, score_home: h, score_away: a }));

function match(code: string, extra: Partial<ScheduleMatchInput> = {}): ScheduleMatchInput {
  return {
    id: code,
    code,
    stage: 'group',
    round: 1,
    status: 'scheduled',
    home_team_id: 't1',
    away_team_id: 't2',
    forfeit_team_id: null,
    winner_team_id: null,
    scheduled_at: '2027-01-09T01:00:00Z',
    court_id: 'c1',
    slots: [],
    ...extra,
  };
}

const at = (hour: number) => `2027-01-09T${String(hour).padStart(2, '0')}:00:00Z`;

describe('buildHomeView', () => {
  it('has no schedule and nothing to show without matches', () => {
    expect(buildHomeView({ matches: [], courts: COURTS, settings })).toEqual({
      hasSchedule: false,
      courts: [],
      latest: [],
    });
  });

  it('shows per court the match in progress and the earliest one still to play', () => {
    const matches = [
      match('V03', { scheduled_at: at(4) }),
      match('V01', { status: 'completed', scheduled_at: at(1), winner_team_id: 't1' }),
      match('V02', { status: 'in_progress', scheduled_at: at(2), slots: slots([31, 20]) }),
      match('V04', { status: 'lineup_locked', scheduled_at: at(3) }),
      match('V05', { court_id: 'c2', scheduled_at: at(5) }),
      match('V06', { court_id: 'c3', status: 'completed', scheduled_at: at(1) }),
      match('V07', { court_id: null, scheduled_at: at(1) }),
    ];
    const view = buildHomeView({ matches, courts: COURTS, settings });
    expect(view.hasSchedule).toBe(true);
    expect(view.courts.map((c) => [c.court, c.now.map((m) => m.code), c.next?.code ?? null])).toEqual([
      ['Sân 1', ['V02'], 'V04'],
      ['Sân 2', [], 'V05'],
    ]);
    expect(view.courts[0].now[0].score).toEqual({ home: 1, away: 0, winner: null });
  });

  it('puts unscheduled matches after scheduled ones in "Next"', () => {
    const matches = [match('V01', { scheduled_at: null }), match('V02', { scheduled_at: at(6) })];
    expect(buildHomeView({ matches, courts: COURTS, settings }).courts[0].next?.code).toBe('V02');
  });

  it('lists the latest 5 decided matches, newest first, without annulled ones', () => {
    const matches = [
      ...[1, 2, 3, 4, 5, 6].map((h) => match(`V0${h}`, { status: 'completed', scheduled_at: at(h) })),
      match('V07', { status: 'forfeit', scheduled_at: at(7), forfeit_team_id: 't2', winner_team_id: 't1' }),
      match('V08', { status: 'annulled', scheduled_at: at(8) }),
    ];
    const view = buildHomeView({ matches, courts: COURTS, settings });
    expect(view.latest.map((m) => m.code)).toEqual(['V07', 'V06', 'V05', 'V04', 'V03']);
    expect(view.latest[0].score).toEqual({ home: 5, away: 0, winner: 'home' });
  });
});

describe('buildPodium', () => {
  const ORDER = ['t1', 't2', 't3', 't4'];
  const relay = (h: number, a: number) => [{ slot_no: 5, score_home: h, score_away: a }];
  function ko(code: string, home: string, away: string, extra: Partial<KnockoutMatchInput> = {}): KnockoutMatchInput {
    return {
      code,
      status: 'scheduled',
      home_team_id: home,
      away_team_id: away,
      forfeit_team_id: null,
      forfeit_reason: null,
      scheduled_at: null,
      court: null,
      winner_team_id: null,
      slots: [],
      ...extra,
    };
  }
  const semis = [ko('SF1', 't1', 't4'), ko('SF2', 't2', 't3')];
  const bracket = (matches: KnockoutMatchInput[]) =>
    buildBracketView({ matches: [...semis, ...matches], finalOrder: ORDER, settings }).slots;
  const prizes = { champion: 5_000_000, runner_up: 3_000_000, third: 0 };

  it('places the final winner, the final loser and the third-place winner, with their prizes', () => {
    const podium = buildPodium(
      bracket([
        ko('F', 't1', 't2', { status: 'completed', winner_team_id: 't2', slots: relay(110, 125) }),
        ko('3RD', 't4', 't3', { status: 'completed', winner_team_id: 't4', slots: relay(125, 90) }),
      ]),
      prizes,
    );
    expect(podium).toEqual([
      { placing: 'champion', teamId: 't2', prize: 5_000_000 },
      { placing: 'runner_up', teamId: 't1', prize: 3_000_000 },
      { placing: 'third', teamId: 't4', prize: null },
    ]);
  });

  it('takes the winner of a forfeit', () => {
    const podium = buildPodium(
      bracket([ko('F', 't1', 't2', { status: 'forfeit', forfeit_team_id: 't1', forfeit_reason: 'no show' })]),
      prizes,
    );
    expect(podium.map((p) => [p.placing, p.teamId])).toEqual([
      ['champion', 't2'],
      ['runner_up', 't1'],
    ]);
  });

  it('is empty while the final and third-place match are undecided', () => {
    expect(buildPodium(bracket([ko('F', 't1', 't2', { status: 'in_progress' })]), prizes)).toEqual([]);
    expect(buildPodium(buildBracketView({ matches: [], finalOrder: null, settings }).slots, prizes)).toEqual([]);
  });
});
