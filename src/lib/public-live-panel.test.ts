import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import type { SlotSetup } from '../domain/live';
import {
  appendLiveEvent,
  currentLiveSlot,
  mergeLogs,
  timeoutLeft,
  toTimedEvent,
  wormOf,
  type LivePanelSlot,
  type TimedLiveEvent,
} from './public-live-panel';

const AT = '2027-01-09T03:00:00.000Z';
const settings = { ...DEFAULT_SEASON_SETTINGS, medical_timeout_minutes: 5 };
const GROUP: SlotSetup = {
  kind: 'group',
  slot_no: 1,
  start: { home: 0, away: 3 },
  pairs: { home: ['h1', 'h2'], away: ['a1', 'a2'] },
};

const setup = (seq: number): TimedLiveEvent => ({
  seq,
  kind: 'setup',
  payload: { server: 'h1', receiver: 'a1', ends: { left: 'home' } },
  at: AT,
});
const point = (seq: number, side: 'home' | 'away'): TimedLiveEvent => ({
  seq,
  kind: 'point',
  payload: { side },
  at: AT,
});
const confirmed = (seq: number): TimedLiveEvent => ({ seq, kind: 'end_confirmed', at: AT });

/** A full set: home wins every rally from 0–3 to 31–3, with the change of ends at 16. */
const fullSet = (): TimedLiveEvent[] => [
  setup(1),
  ...Array.from({ length: 16 }, (_, i) => point(i + 2, 'home')),
  { seq: 18, kind: 'ends_changed', at: AT },
  ...Array.from({ length: 15 }, (_, i) => point(i + 19, 'home')),
];

describe('toTimedEvent', () => {
  it('keeps the payload of the kinds that have one, and the tap time', () => {
    expect(toTimedEvent({ seq: 2, kind: 'point', payload: { side: 'away' }, client_at: AT })).toEqual(point(2, 'away'));
    expect(toTimedEvent({ seq: 9, kind: 'end_confirmed', payload: {}, client_at: AT })).toEqual(confirmed(9));
  });
});

describe('appendLiveEvent', () => {
  const log = [setup(1), point(2, 'home')];

  it('appends the next event', () => {
    expect(appendLiveEvent(log, point(3, 'away'))).toEqual({ log: [...log, point(3, 'away')], gap: false });
  });

  it('ignores an event it already holds', () => {
    expect(appendLiveEvent(log, point(2, 'home'))).toEqual({ log, gap: false });
  });

  it('reports a gap when events are missing', () => {
    expect(appendLiveEvent(log, point(5, 'away'))).toEqual({ log, gap: true });
  });
});

describe('mergeLogs', () => {
  it('keeps, per slot, the copy that goes further', () => {
    const a = { s1: [setup(1), point(2, 'home')], s2: [setup(1)] };
    const b = { s1: [setup(1)], s2: [setup(1), point(2, 'away')], s3: [setup(1)] };
    expect(mergeLogs(a, b)).toEqual({ s1: a.s1, s2: b.s2, s3: b.s3 });
  });
});

describe('currentLiveSlot', () => {
  const slots: LivePanelSlot[] = [
    { id: 's1', slotNo: 1, setup: GROUP },
    { id: 's2', slotNo: 2, setup: { ...GROUP, slot_no: 2, start: { home: 0, away: 0 } } },
  ];

  it('is the first slot with events whose end is not confirmed', () => {
    const current = currentLiveSlot({ slots, settings }, { s1: [setup(1), point(2, 'away')] });
    expect(current?.slot.id).toBe('s1');
    expect(current?.state.score).toEqual({ home: 0, away: 4 });
  });

  it('keeps an ended set until its end is confirmed', () => {
    expect(currentLiveSlot({ slots, settings }, { s1: fullSet() })?.state.ended).toBe(true);
    expect(currentLiveSlot({ slots, settings }, { s1: [...fullSet(), confirmed(34)] })).toBeNull();
  });

  it('skips a slot without a setup or without events', () => {
    expect(currentLiveSlot({ slots: [{ id: 's1', slotNo: 1, setup: null }], settings }, { s1: [setup(1)] })).toBeNull();
    expect(currentLiveSlot({ slots, settings }, {})).toBeNull();
  });
});

describe('wormOf', () => {
  it('gives the lead from the start points, and marks the change of ends', () => {
    const current = currentLiveSlot({ slots: [{ id: 's1', slotNo: 1, setup: GROUP }], settings }, { s1: fullSet() });
    const worm = wormOf(GROUP, current!.state.rallies, settings.set_target);
    expect(worm.diffs.slice(0, 3)).toEqual([-3, -2, -1]);
    expect(worm.diffs).toHaveLength(32);
    expect(worm.sides.every((s) => s === 'home')).toBe(true);
    // Home started at 0 and reaches 16 on its 16th rally.
    expect(worm.endsAt).toBe(16);
  });

  it('has no change of ends in a relay leg', () => {
    const relay: SlotSetup = { ...GROUP, kind: 'relay', start: { home: 0, away: 0 } };
    const rallies = Array.from({ length: 16 }, (_, i) => ({
      seq: i + 2,
      side: 'home' as const,
      score: { home: i + 1, away: 0 },
    }));
    expect(wormOf(relay, rallies, settings.set_target).endsAt).toBeNull();
  });
});

describe('timeoutLeft', () => {
  it('counts down from the tap and stops at 0', () => {
    const start = Date.parse(AT);
    expect(timeoutLeft(AT, 5, start + 48_000)).toBe(252_000);
    expect(timeoutLeft(AT, 5, start + 10 * 60_000)).toBe(0);
  });
});
