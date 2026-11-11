import { describe, expect, it } from 'vitest';

import type { LiveEvent } from '../domain/live';
import { reopenOptions, type ReopenSlot } from './live-reopen';

const slot = (slot_no: number, over: Partial<ReopenSlot> = {}): ReopenSlot => ({
  slot_no,
  live_status: 'pending',
  score_home: null,
  score_away: null,
  home_p1: 'h1',
  home_p2: 'h2',
  away_p1: 'a1',
  away_p2: 'a2',
  retired_side: null,
  retired_player_id: null,
  forfeit_side: null,
  ...over,
});
const finished = (slot_no: number, home: number, away: number, over: Partial<ReopenSlot> = {}) =>
  slot(slot_no, { live_status: 'finished', score_home: home, score_away: away, ...over });

const setup: LiveEvent = { seq: 1, kind: 'setup', payload: { server: 'h1', receiver: 'a1', ends: { left: 'home' } } };
const point = (seq: number, side: 'home' | 'away'): LiveEvent => ({ seq, kind: 'point', payload: { side } });
const confirmed: LiveEvent[] = [setup, point(2, 'home'), { seq: 3, kind: 'end_confirmed' }];
const logs =
  (byNo: Record<number, LiveEvent[]>) =>
  (no: number): LiveEvent[] =>
    byNo[no] ?? [];

describe('reopenOptions: group', () => {
  it('offers every confirmed set, even while another set is live', () => {
    const slots = [finished(1, 31, 20), finished(2, 25, 31), slot(3, { live_status: 'live' }), slot(4), slot(5)];
    const options = reopenOptions(false, slots, logs({ 1: confirmed, 2: confirmed, 3: [setup, point(2, 'home')] }));
    expect(options.map((o) => [o.slotNo, o.blocked])).toEqual([
      [1, null],
      [2, null],
    ]);
  });

  it('takes the next seq from the slot log', () => {
    const [option] = reopenOptions(false, [finished(1, 31, 20)], logs({ 1: confirmed }));
    expect(option.expectedSeq).toBe(4);
  });

  it('skips sets entered as final scores and sets not confirmed', () => {
    const slots = [slot(1, { score_home: 31, score_away: 20 }), slot(2, { live_status: 'live' })];
    expect(reopenOptions(false, slots, logs({ 2: [setup] }))).toEqual([]);
  });
});

describe('reopenOptions: relay ordering', () => {
  it('offers only the last confirmed leg', () => {
    const slots = [finished(1, 25, 20), finished(2, 50, 44), slot(3), slot(4), slot(5)];
    const options = reopenOptions(true, slots, logs({ 1: confirmed, 2: confirmed }));
    expect(options.map((o) => [o.slotNo, o.blocked])).toEqual([
      [1, 'notLast'],
      [2, null],
    ]);
  });

  it('blocks the last confirmed leg once the next leg has a point', () => {
    const slots = [finished(1, 25, 20), slot(2, { live_status: 'live' }), slot(3)];
    const options = reopenOptions(true, slots, logs({ 1: confirmed, 2: [{ ...setup }, point(2, 'away')] }));
    expect(options[0].blocked).toBe('nextStarted');
  });

  it('allows it again once the next leg points are undone, or the next leg is only set up', () => {
    const slots = [finished(1, 25, 20), slot(2, { live_status: 'live' }), slot(3)];
    const undone = [setup, point(2, 'away'), { seq: 3, kind: 'undo', payload: { seq: 2 } } as LiveEvent];
    expect(reopenOptions(true, slots, logs({ 1: confirmed, 2: undone }))[0].blocked).toBeNull();
    expect(reopenOptions(true, slots, logs({ 1: confirmed, 2: [setup] }))[0].blocked).toBeNull();
  });

  it('counts a later leg entered as a final score as confirmed', () => {
    const slots = [finished(1, 25, 20), slot(2, { score_home: 50, score_away: 40 }), slot(3)];
    expect(reopenOptions(true, slots, logs({ 1: confirmed }))[0].blocked).toBe('notLast');
  });
});

describe('reopenOptions: retirement', () => {
  const retire: LiveEvent[] = [
    setup,
    { seq: 2, kind: 'timeout_start', payload: { player: 'h1' } },
    { seq: 3, kind: 'retire', payload: { player: 'h1' } },
  ];

  it('lists the retirement and the later forfeits it caused', () => {
    const slots = [
      finished(1, 18, 31, { retired_side: 'home', retired_player_id: 'h1' }),
      slot(2, { forfeit_side: 'home', score_home: 0, score_away: 31 }),
      // Played without the injured player.
      slot(3, { home_p1: 'h3', home_p2: 'h2', score_home: 31, score_away: 25 }),
      // Forfeited, but without the injured player: not caused by this retirement.
      slot(4, { home_p1: 'h3', home_p2: 'h4', forfeit_side: 'home', score_home: 0, score_away: 31 }),
      slot(5, { home_p1: 'h2', home_p2: 'h1', forfeit_side: 'home', score_home: 0, score_away: 31 }),
    ];
    const [option] = reopenOptions(false, slots, logs({ 1: retire }));
    expect(option).toEqual({
      slotNo: 1,
      expectedSeq: 4,
      blocked: null,
      retirement: { side: 'home', player: 'h1' },
      clearsForfeits: [2, 5],
    });
  });

  it('clears no forfeit for a set that did not end by retirement', () => {
    const slots = [finished(1, 31, 20), slot(2, { forfeit_side: 'home', score_home: 0, score_away: 31 })];
    const [option] = reopenOptions(false, slots, logs({ 1: confirmed }));
    expect(option.retirement).toBeNull();
    expect(option.clearsForfeits).toEqual([]);
  });

  it('a relay retirement leaves the later legs empty, so it can be reopened', () => {
    const slots = [
      finished(1, 25, 20),
      finished(2, 40, 125, { retired_side: 'home', retired_player_id: 'h1' }),
      slot(3),
    ];
    const options = reopenOptions(true, slots, logs({ 1: confirmed, 2: retire }));
    expect(options.map((o) => [o.slotNo, o.blocked])).toEqual([
      [1, 'notLast'],
      [2, null],
    ]);
    expect(options[1].retirement).toEqual({ side: 'home', player: 'h1' });
  });
});
