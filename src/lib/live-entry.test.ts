import { describe, expect, it } from 'vitest';

import type { LiveEvent } from '../domain/live';
import {
  canSwitchToFinalEntry,
  isLiveScored,
  liveCardState,
  liveProgress,
  scoredLive,
  substitutionsOffered,
  type LiveEntrySlot,
} from './live-entry';
import { countedPoints, lastRallySide } from './live-scoring';

const ME = 'user-me';
const OTHER = 'user-other';
const on = { live_scoring: true };
const off = { live_scoring: false };

const slot = (slot_no: number, over: Partial<LiveEntrySlot> = {}): LiveEntrySlot => ({
  slot_no,
  live_status: 'pending',
  score_home: null,
  score_away: null,
  handicap_home: 0,
  handicap_away: 0,
  ...over,
});
const five = (over: Record<number, Partial<LiveEntrySlot>> = {}) => [1, 2, 3, 4, 5].map((no) => slot(no, over[no]));

const setup: LiveEvent = {
  seq: 1,
  kind: 'setup',
  payload: { server: 'h1', receiver: 'a1', ends: { left: 'home' } },
};
const point = (seq: number, side: 'home' | 'away'): LiveEvent => ({ seq, kind: 'point', payload: { side } });

describe('isLiveScored', () => {
  it('needs live_scoring on and no switch to final-score entry', () => {
    expect(isLiveScored(on, { final_entry: false })).toBe(true);
    expect(isLiveScored(on, { final_entry: true })).toBe(false);
    expect(isLiveScored(off, { final_entry: false })).toBe(false);
  });
});

describe('substitutionsOffered (L6)', () => {
  it('hides the substitution after the lock in a live-scored match', () => {
    expect(substitutionsOffered('lineup_locked', true)).toBe(false);
    expect(substitutionsOffered('in_progress', true)).toBe(false);
  });

  it('keeps the Phase 1 rule when the match is not scored live', () => {
    expect(substitutionsOffered('lineup_locked', false)).toBe(true);
    expect(substitutionsOffered('in_progress', false)).toBe(true);
    expect(substitutionsOffered('scheduled', false)).toBe(false);
    expect(substitutionsOffered('completed', false)).toBe(false);
  });
});

describe('liveCardState', () => {
  const base = { settings: on, finalEntry: false, scorerId: null, viewerId: ME, slots: five() };

  it('has no card when the season has live scoring off', () => {
    expect(liveCardState({ ...base, status: 'lineup_locked', settings: off })).toBeNull();
  });

  it('is disabled until the lineups are locked', () => {
    expect(liveCardState({ ...base, status: 'scheduled' })).toBe('unlocked');
  });

  it('offers to start once locked and nobody scores', () => {
    expect(liveCardState({ ...base, status: 'lineup_locked' })).toBe('ready');
    expect(liveCardState({ ...base, status: 'in_progress', slots: five({ 1: { live_status: 'live' } }) })).toBe(
      'ready',
    );
  });

  it('follows the scorer lock', () => {
    expect(liveCardState({ ...base, status: 'in_progress', scorerId: ME })).toBe('mine');
    expect(liveCardState({ ...base, status: 'lineup_locked', scorerId: OTHER })).toBe('other');
  });

  it('shows the final-entry state once the BTC switched the match', () => {
    expect(liveCardState({ ...base, status: 'lineup_locked', finalEntry: true })).toBe('final');
  });

  it('summarises a completed match that was scored live', () => {
    const slots = five({ 1: { live_status: 'finished', score_home: 31, score_away: 20 } });
    expect(liveCardState({ ...base, status: 'completed', slots })).toBe('done');
    expect(liveCardState({ ...base, status: 'completed' })).toBeNull();
  });

  it('has no card for a forfeit or annulled match', () => {
    expect(liveCardState({ ...base, status: 'forfeit' })).toBeNull();
    expect(liveCardState({ ...base, status: 'annulled' })).toBeNull();
  });

  it('has no card when every slot was entered as a final score', () => {
    const slots = [1, 2, 3, 4, 5].map((no) => slot(no, { score_home: 31, score_away: 10 }));
    expect(liveCardState({ ...base, status: 'in_progress', slots })).toBeNull();
  });
});

describe('scoredLive and canSwitchToFinalEntry', () => {
  it('locks a Phase 1 row once its slot has a live event', () => {
    expect(scoredLive(slot(1))).toBe(false);
    expect(scoredLive(slot(1, { live_status: 'live' }))).toBe(true);
    expect(scoredLive(slot(1, { live_status: 'finished' }))).toBe(true);
  });

  it('allows the switch only before any live event', () => {
    expect(canSwitchToFinalEntry(five())).toBe(true);
    expect(canSwitchToFinalEntry(five({ 3: { live_status: 'live' } }))).toBe(false);
  });
});

describe('countedPoints', () => {
  it('drops the points an undo cancelled', () => {
    const events: LiveEvent[] = [
      setup,
      point(2, 'home'),
      point(3, 'away'),
      { seq: 4, kind: 'undo', payload: { seq: 3 } },
    ];
    expect(countedPoints(events)).toEqual([{ seq: 2, side: 'home' }]);
    expect(lastRallySide(events)).toBe('home');
  });
});

describe('liveProgress', () => {
  const group = { relay: false } as const;
  const none = () => [];

  it('is null before the first live event', () => {
    expect(liveProgress(group, five(), none)).toBeNull();
  });

  it('counts the live set from its start points', () => {
    const slots = five({
      1: { live_status: 'finished', score_home: 31, score_away: 24 },
      2: { live_status: 'finished', score_home: 27, score_away: 31 },
      3: { live_status: 'live', handicap_away: 9 },
    });
    const events = [setup, point(2, 'home'), point(3, 'away'), point(4, 'home')];
    expect(liveProgress(group, slots, (no) => (no === 3 ? events : []))).toEqual({
      slotNo: 3,
      score: { home: 2, away: 10 },
    });
  });

  it('points to the next open set between two sets', () => {
    const slots = five({
      1: { live_status: 'finished', score_home: 31, score_away: 24 },
      2: { score_home: 31, score_away: 29 },
      3: { handicap_home: 3 },
    });
    expect(liveProgress(group, slots, none)).toEqual({ slotNo: 3, score: { home: 3, away: 0 } });
  });

  it('adds relay points to the previous leg', () => {
    const relay = { relay: true, start: { home: 0, away: 6 } } as const;
    const legs = five({
      1: { live_status: 'finished', score_home: 25, score_away: 19 },
      2: { live_status: 'live' },
    });
    expect(liveProgress(relay, legs, (no) => (no === 2 ? [setup, point(2, 'away')] : []))).toEqual({
      slotNo: 2,
      score: { home: 25, away: 20 },
    });
    expect(liveProgress(relay, five({ 1: { live_status: 'live' } }), () => [setup, point(2, 'home')])).toEqual({
      slotNo: 1,
      score: { home: 1, away: 6 },
    });
  });
});
