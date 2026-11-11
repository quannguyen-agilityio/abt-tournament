import { describe, expect, it } from 'vitest';
import type { LiveEvent } from '../domain/live';
import type { LiveEntrySlot } from './live-entry';
import { liveSummary, servingSideOf } from './public-live';

const GROUP = { stage: 'group', relay_handicap_home: null, relay_handicap_away: null };
const RELAY = { stage: 'final', relay_handicap_home: 0, relay_handicap_away: 6 };

const setup = (seq: number, serving_side?: 'home' | 'away'): LiveEvent => ({
  seq,
  kind: 'setup',
  payload: { ...(serving_side ? { serving_side } : {}), server: 'h1', receiver: 'a1', ends: { left: 'home' } },
});
const point = (seq: number, side: 'home' | 'away'): LiveEvent => ({ seq, kind: 'point', payload: { side } });

function slot(slot_no: number, extra: Partial<LiveEntrySlot> = {}): LiveEntrySlot {
  return {
    slot_no,
    live_status: 'pending',
    score_home: null,
    score_away: null,
    handicap_home: 0,
    handicap_away: 0,
    ...extra,
  };
}

describe('servingSideOf', () => {
  it('is the side that won the last counted rally', () => {
    const events = [setup(1, 'home'), point(2, 'home'), point(3, 'away')];
    expect(servingSideOf(events, { home: 0, away: 0 }, null)).toBe('away');
  });

  it('skips an undone rally', () => {
    const events: LiveEvent[] = [
      setup(1, 'home'),
      point(2, 'home'),
      point(3, 'away'),
      { seq: 4, kind: 'undo', payload: { seq: 3 } },
    ];
    expect(servingSideOf(events, { home: 0, away: 0 }, null)).toBe('home');
  });

  it('before the first rally, takes the toss, then the handicap rule', () => {
    expect(servingSideOf([setup(1, 'away')], { home: 0, away: 0 }, null)).toBe('away');
    expect(servingSideOf([setup(1)], { home: 0, away: 4 }, null)).toBe('home');
    expect(servingSideOf([], { home: 3, away: 0 }, null)).toBe('away');
    expect(servingSideOf([], { home: 0, away: 0 }, null)).toBeNull();
  });

  it('takes the carried side at a relay leg change', () => {
    expect(servingSideOf([setup(1)], { home: 25, away: 20 }, 'away')).toBe('away');
  });
});

describe('liveSummary', () => {
  it('is null before the first live event', () => {
    expect(liveSummary(GROUP, [slot(1), slot(2)], () => [])).toBeNull();
  });

  it('gives the current set with its score, start points included', () => {
    const slots = [
      slot(1, { live_status: 'finished', score_home: 31, score_away: 20 }),
      slot(2, { live_status: 'live', handicap_away: 3 }),
      slot(3),
    ];
    const logs: Record<number, LiveEvent[]> = { 2: [setup(1), point(2, 'home'), point(3, 'away')] };
    expect(liveSummary(GROUP, slots, (n) => logs[n] ?? [])).toEqual({
      slotNo: 2,
      relay: false,
      score: { home: 1, away: 4 },
      servingSide: 'away',
    });
  });

  it('between two sets, gives the next set at its start', () => {
    const slots = [slot(1, { live_status: 'finished', score_home: 31, score_away: 20 }), slot(2, { handicap_home: 2 })];
    expect(liveSummary(GROUP, slots, () => [])).toEqual({
      slotNo: 2,
      relay: false,
      score: { home: 2, away: 0 },
      servingSide: 'away',
    });
  });

  it('relay: a leg starts from the previous leg and the last rally winner serves first', () => {
    const slots = [
      slot(1, { live_status: 'finished', score_home: 25, score_away: 22 }),
      slot(2, { live_status: 'live' }),
    ];
    const logs: Record<number, LiveEvent[]> = { 1: [setup(1), point(2, 'away')], 2: [setup(1)] };
    expect(liveSummary(RELAY, slots, (n) => logs[n] ?? [])).toEqual({
      slotNo: 2,
      relay: true,
      score: { home: 25, away: 22 },
      servingSide: 'away',
    });
  });
});
