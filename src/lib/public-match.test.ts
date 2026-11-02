import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain';
import {
  buildMatchDetail,
  lineupIsPublic,
  type MatchDetailInput,
  type MatchPlayer,
  type MatchSlotInput,
} from './public-match';

const settings = DEFAULT_SEASON_SETTINGS;
const TYPES = ['open', 'low', 'open', 'high', 'open'] as const;

const players = new Map<string, MatchPlayer>(
  ['h1', 'h2', 'h3', 'a1', 'a2'].map((id, i) => [id, { id, name: `Player ${id}`, slug: id, rank: i + 1, skill: 30 }]),
);

function slot(no: number, extra: Partial<MatchSlotInput> = {}): MatchSlotInput {
  return {
    slot_no: no,
    slot_type: TYPES[no - 1],
    home_p1: 'h1',
    home_p2: 'h2',
    away_p1: 'a1',
    away_p2: 'a2',
    handicap_home: 0,
    handicap_away: 0,
    score_home: null,
    score_away: null,
    substitutions: [],
    ...extra,
  };
}

function match(extra: Partial<MatchDetailInput> = {}): MatchDetailInput {
  return {
    id: 'm1',
    code: 'V01',
    stage: 'group',
    round: 1,
    status: 'lineup_locked',
    status_before_annul: null,
    home_team_id: 't1',
    away_team_id: 't2',
    forfeit_team_id: null,
    forfeit_reason: null,
    winner_team_id: null,
    scheduled_at: null,
    relay_handicap_home: null,
    relay_handicap_away: null,
    slots: [1, 2, 3, 4, 5].map((no) => slot(no)),
    ...extra,
  };
}

describe('lineupIsPublic', () => {
  it('opens lineups from lineup_locked on (A6)', () => {
    expect(lineupIsPublic({ status: 'scheduled', status_before_annul: null })).toBe(false);
    for (const status of ['lineup_locked', 'in_progress', 'completed', 'forfeit'] as const) {
      expect(lineupIsPublic({ status, status_before_annul: null })).toBe(true);
    }
  });

  it('keeps the lineup of a match annulled before its lock hidden', () => {
    expect(lineupIsPublic({ status: 'annulled', status_before_annul: 'scheduled' })).toBe(false);
    expect(lineupIsPublic({ status: 'annulled', status_before_annul: 'completed' })).toBe(true);
  });
});

describe('buildMatchDetail: group', () => {
  it('hides slots until the lineup is locked, even when they were read', () => {
    const view = buildMatchDetail({ match: match({ status: 'scheduled' }), players, settings });
    expect(view.lineupVisible).toBe(false);
    expect(view.slots).toEqual([]);
    expect(view.relay).toBeNull();
  });

  it('shows 5 rows in order with type, pairs, handicap, score and winner', () => {
    const slots = [
      slot(2, { handicap_away: 9, score_home: 31, score_away: 20 }),
      slot(1, { handicap_home: 4, score_home: 18, score_away: 31 }),
      slot(3),
      slot(4),
      slot(5),
    ];
    const view = buildMatchDetail({ match: match({ status: 'in_progress', slots }), players, settings });
    expect(view.slots.map((s) => [s.slotNo, s.type])).toEqual([
      [1, 'open'],
      [2, 'low'],
      [3, 'open'],
      [4, 'high'],
      [5, 'open'],
    ]);
    const [first, second, third] = view.slots;
    expect(first.pairs.home.map((p) => p.id)).toEqual(['h1', 'h2']);
    expect(first.handicap).toEqual({ home: 4, away: 0 });
    expect(first.score).toEqual({ home: 18, away: 31 });
    expect(first.winner).toBe('away');
    expect(second.handicap).toEqual({ home: 0, away: 9 });
    expect(second.winner).toBe('home');
    expect(third.score).toBeNull();
    expect(third.winner).toBeNull();
    expect(view.score).toEqual({ home: 1, away: 1, winner: null });
  });

  it('applies substitutions to the pair and lists them', () => {
    const sub = { side: 'home' as const, replaced_id: 'h2', substitute_id: 'h3', reason: 'Injury' };
    const view = buildMatchDetail({
      match: match({ slots: [slot(1, { substitutions: [sub] })] }),
      players,
      settings,
    });
    expect(view.slots[0].pairs.home.map((p) => p.id)).toEqual(['h1', 'h3']);
    expect(view.slots[0].substitutions).toEqual([
      { side: 'home', out: players.get('h2'), in: players.get('h3'), reason: 'Injury' },
    ]);
  });

  it('records a group forfeit as 5–0', () => {
    const view = buildMatchDetail({
      match: match({ status: 'forfeit', forfeit_team_id: 't2', forfeit_reason: 'No show' }),
      players,
      settings,
    });
    expect(view.score).toEqual({ home: 5, away: 0, winner: 'home' });
  });

  it('keeps the rows of an annulled match that had been played', () => {
    const view = buildMatchDetail({
      match: match({
        status: 'annulled',
        status_before_annul: 'completed',
        slots: [slot(1, { score_home: 31, score_away: 5 })],
      }),
      players,
      settings,
    });
    expect(view.lineupVisible).toBe(true);
    expect(view.slots).toHaveLength(1);
    expect(view.score).toEqual({ home: 1, away: 0, winner: null });
  });
});

describe('buildMatchDetail: relay', () => {
  const legs = [
    slot(1, { score_home: 25, score_away: 21 }),
    slot(2, { score_home: 44, score_away: 50 }),
    slot(3),
    slot(4),
    slot(5),
  ];
  const relay = (extra: Partial<MatchDetailInput> = {}) =>
    buildMatchDetail({
      match: match({
        code: 'SF1',
        stage: 'semi_final',
        round: null,
        status: 'in_progress',
        relay_handicap_home: 0,
        relay_handicap_away: 12,
        slots: legs,
        ...extra,
      }),
      players,
      settings,
    });

  it('gives each leg its milestone and cumulative score, without per-set handicaps', () => {
    const view = relay();
    expect(view.slots.map((s) => s.milestone)).toEqual([25, 50, 75, 100, 125]);
    expect(view.slots[1].score).toEqual({ home: 44, away: 50 });
    expect(view.slots[1].winner).toBe('away');
    expect(view.slots.every((s) => s.handicap.home === 0 && s.handicap.away === 0)).toBe(true);
  });

  it('shows the start handicap and the scoreboard so far against the final milestone', () => {
    expect(relay().relay).toEqual({
      start: { home: 0, away: 12 },
      cap: 15,
      target: 125,
      milestones: [25, 50, 75, 100, 125],
      current: { home: 44, away: 50 },
    });
    expect(relay().score).toEqual({ home: 44, away: 50, winner: null });
  });

  it('starts the scoreboard at the handicap before the first leg', () => {
    expect(relay({ status: 'lineup_locked', slots: [slot(1)] }).relay?.current).toEqual({ home: 0, away: 12 });
  });

  it('has no start for a match without a snapshot', () => {
    const view = relay({ relay_handicap_home: null, relay_handicap_away: null, slots: [slot(1)] });
    expect(view.relay?.start).toBeNull();
    expect(view.relay?.current).toEqual({ home: 0, away: 0 });
  });

  it('records a knock-out forfeit as 125–0', () => {
    expect(relay({ status: 'forfeit', forfeit_team_id: 't1', slots: [] }).score).toEqual({
      home: 0,
      away: 125,
      winner: 'away',
    });
  });
});
