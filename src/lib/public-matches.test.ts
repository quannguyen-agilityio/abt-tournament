import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain';
import {
  buildScheduleView,
  filtersToQuery,
  matchScore,
  parseMatchFilters,
  scheduleDays,
  type MatchFilters,
  type ScheduleMatchInput,
} from './public-matches';

const settings = DEFAULT_SEASON_SETTINGS;
const ALL: MatchFilters = { day: null, team: null, court: null, stage: null };
const T1 = '00000000-0000-4000-8000-000000000001';
const T2 = '00000000-0000-4000-8000-000000000002';
const T3 = '00000000-0000-4000-8000-000000000003';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const C2 = '00000000-0000-4000-8000-0000000000c2';

const slots = (...scores: [number | null, number | null][]) =>
  scores.map(([h, a], i) => ({ slot_no: i + 1, score_home: h, score_away: a }));

function match(code: string, extra: Partial<ScheduleMatchInput> = {}): ScheduleMatchInput {
  return {
    id: code,
    code,
    stage: 'group',
    round: 1,
    status: 'scheduled',
    home_team_id: T1,
    away_team_id: T2,
    forfeit_team_id: null,
    winner_team_id: null,
    // 08:00 ICT on 2027-01-09.
    scheduled_at: '2027-01-09T01:00:00Z',
    court_id: C1,
    slots: [],
    ...extra,
  };
}

describe('matchScore', () => {
  it('is null before the first score', () => {
    expect(matchScore(match('V01'), settings)).toBeNull();
    expect(matchScore(match('V01', { slots: slots([null, null], [null, null]) }), settings)).toBeNull();
  });

  it('counts the sets won so far in a group match', () => {
    const live = match('V01', { status: 'in_progress', slots: slots([31, 20], [18, 31], [31, 29], [null, null]) });
    expect(matchScore(live, settings)).toEqual({ home: 2, away: 1, winner: null });
  });

  it('names the winner of a completed match', () => {
    const done = match('V01', {
      status: 'completed',
      winner_team_id: T2,
      slots: slots([31, 20], [18, 31], [25, 31], [31, 29], [12, 31]),
    });
    expect(matchScore(done, settings)).toEqual({ home: 2, away: 3, winner: 'away' });
  });

  it('shows the relay scoreboard at the last scored leg', () => {
    const relay = match('SF1', {
      stage: 'semi_final',
      status: 'in_progress',
      slots: slots([25, 20], [44, 50], [null, null]),
    });
    expect(matchScore(relay, settings)).toEqual({ home: 44, away: 50, winner: null });
  });

  it('records a group forfeit as 5–0 in sets and a knock-out forfeit as 125–0', () => {
    expect(matchScore(match('V01', { status: 'forfeit', forfeit_team_id: T1 }), settings)).toEqual({
      home: 0,
      away: 5,
      winner: 'away',
    });
    expect(matchScore(match('F', { stage: 'final', status: 'forfeit', forfeit_team_id: T2 }), settings)).toEqual({
      home: 125,
      away: 0,
      winner: 'home',
    });
  });
});

describe('parseMatchFilters', () => {
  const known = { teamIds: [T1, T2], courtIds: [C1] };

  it('keeps valid values', () => {
    expect(parseMatchFilters({ day: '2027-01-09', team: T1, court: C1, stage: 'ko' }, known)).toEqual({
      day: '2027-01-09',
      team: T1,
      court: C1,
      stage: 'ko',
    });
  });

  it('falls back to "all" for unknown or malformed values', () => {
    expect(parseMatchFilters({ day: '2027-02-30', team: T3, court: 'x', stage: 'final' }, known)).toEqual(ALL);
    expect(parseMatchFilters({}, known)).toEqual(ALL);
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseMatchFilters({ stage: ['group', 'ko'] }, known).stage).toBe('group');
  });

  it('round-trips through the query string without the "all" filters', () => {
    expect(filtersToQuery({ ...ALL, team: T1, stage: 'group' })).toEqual({ team: T1, stage: 'group' });
    expect(filtersToQuery(ALL)).toEqual({});
  });
});

describe('scheduleDays', () => {
  it('merges season match days with the days that have a match', () => {
    const days = scheduleDays([match('V01'), match('V02', { scheduled_at: null })], ['2027-01-16'], 'Asia/Ho_Chi_Minh');
    expect(days).toEqual(['2027-01-09', '2027-01-16']);
  });
});

describe('buildScheduleView', () => {
  const matches = [
    match('V02', { home_team_id: T2, away_team_id: T3, court_id: C2 }),
    match('V01'),
    // 10:00 ICT on the same day.
    match('V03', { home_team_id: T1, away_team_id: T3, scheduled_at: '2027-01-09T03:00:00Z' }),
    // 23:30 UTC on the 15th is 06:30 on the 16th in ICT.
    match('V04', { scheduled_at: '2027-01-15T23:30:00Z' }),
    match('SF1', { stage: 'semi_final', round: null, home_team_id: null, away_team_id: null, scheduled_at: null }),
  ];
  const view = (filters: Partial<MatchFilters> = {}) =>
    buildScheduleView({ matches, filters: { ...ALL, ...filters }, settings });
  const codes = (v: ReturnType<typeof view>) =>
    v.days.map((d) => [d.date, d.times.map((t) => [t.time, t.matches.map((m) => m.code)])]);

  it('groups by local day, then time, with codes in order', () => {
    const v = view();
    expect(codes(v)).toEqual([
      [
        '2027-01-09',
        [
          ['08:00', ['V01', 'V02']],
          ['10:00', ['V03']],
        ],
      ],
      ['2027-01-16', [['06:30', ['V04']]]],
    ]);
    expect(v.unscheduled.map((m) => m.code)).toEqual(['SF1']);
    expect(v.count).toBe(5);
  });

  it('filters by team on either side', () => {
    const v = view({ team: T3 });
    expect(codes(v)).toEqual([
      [
        '2027-01-09',
        [
          ['08:00', ['V02']],
          ['10:00', ['V03']],
        ],
      ],
    ]);
    expect(v.unscheduled).toEqual([]);
  });

  it('filters by court, stage and day', () => {
    expect(codes(view({ court: C2 }))).toEqual([['2027-01-09', [['08:00', ['V02']]]]]);
    expect(view({ stage: 'ko' }).unscheduled.map((m) => m.code)).toEqual(['SF1']);
    expect(view({ stage: 'ko' }).days).toEqual([]);
    const day = view({ day: '2027-01-16' });
    expect(codes(day)).toEqual([['2027-01-16', [['06:30', ['V04']]]]]);
    expect(day.unscheduled).toEqual([]);
    expect(day.count).toBe(1);
  });

  it('attaches the score to each card', () => {
    const v = buildScheduleView({
      matches: [match('V01', { status: 'in_progress', slots: slots([31, 10], [null, null]) })],
      filters: ALL,
      settings,
    });
    expect(v.days[0].times[0].matches[0].score).toEqual({ home: 1, away: 0, winner: null });
  });
});
