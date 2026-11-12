import { describe, expect, it } from 'vitest';

import { replay, type LiveEvent, type SlotSetup } from '../domain/live';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import {
  courtSpot,
  currentSlotNo,
  draftPayload,
  finishedScore,
  matchRetirement,
  retirementPreview,
  slotPhases,
  initialDraft,
  latestSetup,
  scorerSlotSetup,
  serverCoversLocal,
  setsWon,
  setupPreview,
  slotPhase,
  wasReopened,
  type ScorerLogs,
  type ScorerMatch,
  type ScorerSlot,
} from './live-scorer';

const settings = DEFAULT_SEASON_SETTINGS;

const slot = (no: number, over: Partial<ScorerSlot> = {}): ScorerSlot => ({
  id: `slot-${no}`,
  slot_no: no,
  slot_type: 'open',
  live_status: 'pending',
  score_home: null,
  score_away: null,
  handicap_home: 0,
  handicap_away: 0,
  home_p1: `h1-${no}`,
  home_p2: `h2-${no}`,
  away_p1: `a1-${no}`,
  away_p2: `a2-${no}`,
  ...over,
});

const group: ScorerMatch = { stage: 'group', relay_handicap_home: null, relay_handicap_away: null };
const relay: ScorerMatch = { stage: 'final', relay_handicap_home: 0, relay_handicap_away: 0 };

const setupEvent = (seq: number, over: Partial<Extract<LiveEvent, { kind: 'setup' }>['payload']> = {}): LiveEvent => ({
  seq,
  kind: 'setup',
  payload: { serving_side: 'home', server: 'h1-1', receiver: 'a1-1', ends: { left: 'home' }, ...over },
});
const point = (seq: number, side: 'home' | 'away'): LiveEvent => ({ seq, kind: 'point', payload: { side } });

/** A set-1 log that ends 31–0 for home and is confirmed. */
function confirmedSet(first: ScorerSlot, side: 'home' | 'away' = 'home', serving: 'home' | 'away' = 'home') {
  const no = first.slot_no;
  const log: LiveEvent[] = [
    setupEvent(1, {
      serving_side: serving,
      server: `${serving === 'home' ? 'h1' : 'a1'}-${no}`,
      receiver: `${serving === 'home' ? 'a1' : 'h1'}-${no}`,
    }),
  ];
  let seq = 2;
  for (let i = 0; i < 31; i++) {
    log.push(point(seq++, side));
    if (side === 'home' && i === 15) log.push({ seq: seq++, kind: 'ends_changed' });
    if (side === 'away' && i === 15) log.push({ seq: seq++, kind: 'ends_changed' });
  }
  log.push({ seq, kind: 'end_confirmed' });
  return log;
}

describe('slotPhase', () => {
  const s = slot(1);
  const setup = scorerSlotSetup(group, [s], {}, 1, settings)!;

  it('is pending without events', () => {
    expect(slotPhase(s, [], setup, settings)).toBe('pending');
  });

  it('is live with events that are not confirmed', () => {
    expect(slotPhase(s, [setupEvent(1)], setup, settings)).toBe('live');
  });

  it('is finished once the end is confirmed', () => {
    expect(slotPhase(s, confirmedSet(s), setup, settings)).toBe('finished');
  });

  it('is final for a pending row that has a Phase 1 score', () => {
    expect(slotPhase(slot(1, { score_home: 31, score_away: 20 }), [], setup, settings)).toBe('final');
  });
});

describe('currentSlotNo', () => {
  const slots = [1, 2, 3, 4, 5].map((n) => slot(n));

  it('is the first slot with no events at the start', () => {
    expect(currentSlotNo(group, slots, {}, settings)).toBe(1);
  });

  it('is the slot being played', () => {
    const logs: ScorerLogs = { 1: confirmedSet(slots[0]), 2: [setupEvent(1, { server: 'h1-2', receiver: 'a1-2' })] };
    expect(currentSlotNo(group, slots, logs, settings)).toBe(2);
  });

  it('is the next pending slot between two sets', () => {
    expect(currentSlotNo(group, slots, { 1: confirmedSet(slots[0]) }, settings)).toBe(2);
  });

  it('skips a slot entered as a Phase 1 final score', () => {
    const withFinal = [slot(1, { score_home: 31, score_away: 12 }), ...slots.slice(1)];
    expect(currentSlotNo(group, withFinal, {}, settings)).toBe(2);
  });

  it('is null when every slot is finished', () => {
    const logs: ScorerLogs = Object.fromEntries(slots.map((s) => [s.slot_no, confirmedSet(s)]));
    expect(currentSlotNo(group, slots, logs, settings)).toBeNull();
  });

  it('goes back to a set the BTC reopened', () => {
    const confirmed = confirmedSet(slots[0]);
    const log: LiveEvent[] = [
      ...confirmed,
      { seq: confirmed.length + 1, kind: 'reopened', payload: { reason: 'typo' } },
    ];
    expect(currentSlotNo(group, slots, { 1: log, 2: [] }, settings)).toBe(1);
    expect(wasReopened(log)).toBe(true);
  });
});

describe('setsWon', () => {
  const slots = [1, 2, 3, 4, 5].map((n) => slot(n));

  it('counts the sets each side won, finished and Phase 1 ones', () => {
    const withFinal = [slots[0], slot(2, { score_home: 20, score_away: 31 }), ...slots.slice(2)];
    const logs: ScorerLogs = { 1: confirmedSet(slots[0]), 3: confirmedSet(slots[2], 'away', 'away') };
    expect(setsWon(group, withFinal, logs, settings)).toEqual({ home: 1, away: 2 });
  });

  it('ignores a set that is still being played', () => {
    expect(setsWon(group, slots, { 1: [setupEvent(1)] }, settings)).toEqual({ home: 0, away: 0 });
  });

  it('is the cumulative score of the last finished leg in a relay', () => {
    const legs = [1, 2, 3, 4, 5].map((n) => slot(n));
    // Leg 1 to 25: home takes all 25 points.
    const leg1: LiveEvent[] = [setupEvent(1)];
    for (let i = 0; i < 25; i++) leg1.push(point(i + 2, 'home'));
    leg1.push({ seq: 27, kind: 'end_confirmed' });
    expect(setsWon(relay, legs, { 1: leg1 }, settings)).toEqual({ home: 25, away: 0 });
  });
});

describe('scorerSlotSetup', () => {
  const legs = [1, 2, 3, 4, 5].map((n) => slot(n));
  const leg1: LiveEvent[] = [setupEvent(1)];
  // Home serves first, wins 24, away wins the 25th rally to reach... use away with a handicap-free race:
  // home 24, then away gets 1, then home wins the leg-ending point, so home won the last rally.
  for (let i = 0; i < 24; i++) leg1.push(point(i + 2, 'home'));
  leg1.push(point(26, 'away'));
  leg1.push(point(27, 'home'));
  leg1.push({ seq: 28, kind: 'end_confirmed' });

  it('chains the cumulative score and the winner of the last rally into leg 2', () => {
    const setup = scorerSlotSetup(relay, legs, { 1: leg1 }, 2, settings)!;
    expect(setup.kind).toBe('relay');
    expect(setup.start).toEqual({ home: 25, away: 1 });
    expect(setup.carried_serving_side).toBe('home');
    expect(setup.pairs.home).toEqual(['h1-2', 'h2-2']);
  });

  it('is not ready while the previous leg is not confirmed', () => {
    expect(scorerSlotSetup(relay, legs, { 1: leg1.slice(0, -1) }, 2, settings)).toBeNull();
    expect(scorerSlotSetup(relay, legs, {}, 2, settings)).toBeNull();
  });

  it('chains a previous leg entered as a final score', () => {
    const withFinal = [slot(1, { score_home: 25, score_away: 10 }), ...legs.slice(1)];
    const setup = scorerSlotSetup(relay, withFinal, {}, 2, settings)!;
    expect(setup.start).toEqual({ home: 25, away: 10 });
    expect(setup.carried_serving_side).toBeUndefined();
  });

  it('uses the start points of a group set', () => {
    const setup = scorerSlotSetup(group, [slot(1, { handicap_away: 5 })], {}, 1, settings)!;
    expect(setup.start).toEqual({ home: 0, away: 5 });
  });

  it('is null when a pair is incomplete', () => {
    expect(scorerSlotSetup(group, [slot(1, { home_p2: null })], {}, 1, settings)).toBeNull();
  });
});

describe('courtSpot', () => {
  it('puts the right court of the team on the left end at the bottom', () => {
    expect(courtSpot('home', 'home', 'right')).toEqual({ x: 25, y: 75 });
    expect(courtSpot('home', 'home', 'left')).toEqual({ x: 25, y: 25 });
  });

  it('puts the right court of the team on the right end at the top', () => {
    expect(courtSpot('home', 'away', 'right')).toEqual({ x: 75, y: 25 });
    expect(courtSpot('home', 'away', 'left')).toEqual({ x: 75, y: 75 });
  });

  it('mirrors when the ends swap', () => {
    expect(courtSpot('away', 'home', 'right')).toEqual({ x: 75, y: 25 });
  });
});

describe('setupPreview', () => {
  const setup: SlotSetup = {
    kind: 'group',
    slot_no: 3,
    start: { home: 0, away: 9 },
    pairs: { home: ['h1', 'h2'], away: ['a1', 'a2'] },
  };

  it('shows the pairs in listed order before any choice', () => {
    const p = setupPreview(setup, { ends: { left: 'home' }, serving: null, server: null, receiver: null });
    expect(p.server).toBeNull();
    expect(p.positions.home).toEqual({ right: 'h1', left: 'h2' });
  });

  it('puts the server of the side that starts at 0 in the right court', () => {
    const p = setupPreview(setup, { ends: { left: 'home' }, serving: 'home', server: 'h2', receiver: null });
    expect(p.server).toEqual({ side: 'home', player: 'h2', court: 'right' });
    expect(p.positions.home).toEqual({ right: 'h2', left: 'h1' });
    expect(p.receiver).toEqual({ side: 'away', player: null, court: 'right' });
  });

  it('puts the server in the left court at an odd start score, the receiver diagonal', () => {
    const odd: SlotSetup = {
      ...setup,
      kind: 'relay',
      start: { home: 25, away: 19 },
      carried_serving_side: 'home',
    };
    const p = setupPreview(odd, { ends: { left: 'away' }, serving: 'home', server: 'h1', receiver: 'a2' });
    expect(p.server).toEqual({ side: 'home', player: 'h1', court: 'left' });
    expect(p.receiver).toEqual({ side: 'away', player: 'a2', court: 'left' });
    expect(p.positions.home).toEqual({ left: 'h1', right: 'h2' });
    expect(p.positions.away).toEqual({ left: 'a2', right: 'a1' });
    expect(p.left).toBe('away');
  });

  it('agrees with replay() once the setup is saved', () => {
    const draft = { ends: { left: 'home' as const }, serving: 'home' as const, server: 'h2', receiver: 'a1' };
    const payload = draftPayload(setup, draft)!;
    const state = replay(setup, [{ seq: 1, kind: 'setup', payload }], settings);
    expect(state.positions).toEqual(setupPreview(setup, draft).positions);
  });
});

describe('initialDraft', () => {
  const setup: SlotSetup = {
    kind: 'group',
    slot_no: 1,
    start: { home: 0, away: 0 },
    pairs: { home: ['h1', 'h2'], away: ['a1', 'a2'] },
  };

  it('defaults to the home side on the left, with the toss open', () => {
    expect(initialDraft(setup)).toEqual({ ends: { left: 'home' }, serving: null, server: null, receiver: null });
  });

  it('fixes the serving side at a handicap', () => {
    const hc: SlotSetup = { ...setup, start: { home: 3, away: 0 } };
    expect(initialDraft(hc).serving).toBe('away');
  });

  it('prefills edit mode from the current setup', () => {
    const current = { serving_side: 'away' as const, server: 'a2', receiver: 'h1', ends: { left: 'away' as const } };
    expect(initialDraft(setup, current)).toEqual({
      ends: { left: 'away' },
      serving: 'away',
      server: 'a2',
      receiver: 'h1',
    });
  });

  it('takes the ends and the serving side from the ended leg at a relay leg change', () => {
    const legs = [1, 2, 3, 4, 5].map((n) => slot(n));
    const leg1: LiveEvent[] = [setupEvent(1, { ends: { left: 'home' } })];
    for (let i = 0; i < 24; i++) leg1.push(point(i + 2, 'home'));
    leg1.push(point(26, 'away'), point(27, 'home'));
    const setup2 = scorerSlotSetup(relay, legs, { 1: [...leg1, { seq: 28, kind: 'end_confirmed' }] }, 2, settings)!;
    const setup1 = scorerSlotSetup(relay, legs, {}, 1, settings)!;
    const previous = replay(setup1, leg1, settings);
    expect(initialDraft(setup2, undefined, previous)).toEqual({
      ends: { left: 'away' },
      serving: 'home',
      server: null,
      receiver: null,
    });
  });
});

describe('draftPayload', () => {
  const setup: SlotSetup = {
    kind: 'group',
    slot_no: 1,
    start: { home: 0, away: 0 },
    pairs: { home: ['h1', 'h2'], away: ['a1', 'a2'] },
  };

  it('is null until the draft is complete', () => {
    expect(draftPayload(setup, { ends: { left: 'home' }, serving: 'home', server: 'h1', receiver: null })).toBeNull();
  });

  it('sends the serving side only at a 0–0 start', () => {
    const draft = { ends: { left: 'away' as const }, serving: 'home' as const, server: 'h1', receiver: 'a1' };
    expect(draftPayload(setup, draft)).toEqual({
      serving_side: 'home',
      server: 'h1',
      receiver: 'a1',
      ends: { left: 'away' },
    });
    const hc: SlotSetup = { ...setup, start: { home: 0, away: 4 } };
    expect(draftPayload(hc, draft)).toEqual({ server: 'h1', receiver: 'a1', ends: { left: 'away' } });
  });
});

describe('latestSetup and serverCoversLocal', () => {
  it('reads the latest setup of a log', () => {
    const log = [setupEvent(1), point(2, 'home'), setupEvent(3, { server: 'h2' })];
    expect(latestSetup(log)?.server).toBe('h2');
    expect(latestSetup([])).toBeUndefined();
  });

  it('tells an older server snapshot from a current one', () => {
    const local: ScorerLogs = { 1: [setupEvent(1), point(2, 'home')] };
    expect(serverCoversLocal({ 1: [setupEvent(1)] }, local)).toBe(false);
    expect(serverCoversLocal({ 1: [setupEvent(1), point(2, 'home')] }, local)).toBe(true);
    expect(serverCoversLocal({}, {})).toBe(true);
  });
});

describe('retirement (spec-phase-2 §6)', () => {
  // h1-1 plays sets 1, 2 and 4; sets 3 and 5 are without them. In set 1, home leads... 3–5 when
  // h1-1 is injured.
  const injured = 'h1-1';
  const slots = [slot(1), slot(2, { home_p1: injured }), slot(3), slot(4, { home_p2: injured }), slot(5)];
  const beforeRetire: LiveEvent[] = [
    setupEvent(1),
    point(2, 'home'),
    point(3, 'home'),
    point(4, 'home'),
    point(5, 'away'),
    point(6, 'away'),
    point(7, 'away'),
    point(8, 'away'),
    point(9, 'away'),
    { seq: 10, kind: 'timeout_start', payload: { player: injured } },
  ];
  const retired: LiveEvent[] = [...beforeRetire, { seq: 11, kind: 'retire', payload: { player: injured } }];
  const retirement = { side: 'home' as const, player: injured, slot_no: 1, score: { home: 3, away: 5 } };

  it('finds the retirement in the logs', () => {
    expect(matchRetirement(group, slots, { 1: retired }, settings)).toEqual(retirement);
    expect(matchRetirement(group, slots, { 1: beforeRetire }, settings)).toBeNull();
  });

  it('group: skips the forfeited sets at once and moves to the next set without the player (L8)', () => {
    const logs = { 1: retired };
    expect(slotPhases(group, slots, logs, settings)).toEqual({
      1: 'finished',
      2: 'final',
      3: 'pending',
      4: 'final',
      5: 'pending',
    });
    expect(currentSlotNo(group, slots, logs, settings)).toBe(3);
  });

  it('group: credits the opponent the target in the retired set and forfeits the later sets', () => {
    const logs = { 1: retired };
    expect(finishedScore(group, slots, logs, 1, settings)).toEqual({ home: 3, away: 31 });
    expect(finishedScore(group, slots, logs, 2, settings)).toEqual({ home: 0, away: 31 });
    expect(finishedScore(group, slots, logs, 3, settings)).toBeNull();
    expect(setsWon(group, slots, logs, settings)).toEqual({ home: 0, away: 3 });
  });

  it('group: reads a forfeit the server wrote from its row', () => {
    const stored = slots.map((s) =>
      s.slot_no === 2 ? { ...s, score_home: 0, score_away: 31, forfeit_side: 'home' as const } : s,
    );
    expect(finishedScore(group, stored, { 1: retired }, 2, settings)).toEqual({ home: 0, away: 31 });
  });

  it('group: lists every consequence before the confirmation (L-G)', () => {
    const preview = retirementPreview(group, slots, { 1: beforeRetire }, settings, retirement);
    expect(preview).toEqual({
      relay: false,
      side: 'home',
      player: injured,
      current: { slotNo: 1, live: { home: 3, away: 5 }, stored: { home: 3, away: 31 } },
      others: [
        { slotNo: 2, outcome: 'forfeit', score: { home: 0, away: 31 } },
        { slotNo: 3, outcome: 'played' },
        { slotNo: 4, outcome: 'forfeit', score: { home: 0, away: 31 } },
        { slotNo: 5, outcome: 'played' },
      ],
      milestone: null,
    });
  });

  it('group: keeps earlier sets and later sets already started', () => {
    const atThree = { ...retirement, slot_no: 3 };
    const logs: ScorerLogs = {
      3: [setupEvent(1, { server: 'h1-3', receiver: 'a1-3' })],
      4: [setupEvent(1, { server: 'h1-4', receiver: 'a1-4' })],
    };
    const { others } = retirementPreview(group, slots, logs, settings, { ...atThree, player: injured });
    expect(others).toEqual([
      { slotNo: 1, outcome: 'kept' },
      { slotNo: 2, outcome: 'kept' },
      { slotNo: 4, outcome: 'kept' },
      { slotNo: 5, outcome: 'played' },
    ]);
  });

  it('relay: ends the match and credits the opponent the final milestone (L9)', () => {
    const legs = [slot(1), slot(2), slot(3), slot(4), slot(5)];
    const log: LiveEvent[] = [
      setupEvent(1),
      point(2, 'home'),
      point(3, 'away'),
      point(4, 'home'),
      { seq: 5, kind: 'timeout_start', payload: { player: 'a1-1' } },
      { seq: 6, kind: 'retire', payload: { player: 'a1-1' } },
    ];
    const logs = { 1: log };
    expect(currentSlotNo(relay, legs, logs, settings)).toBeNull();
    expect(finishedScore(relay, legs, logs, 1, settings)).toEqual({ home: 125, away: 1 });
    expect(setsWon(relay, legs, logs, settings)).toEqual({ home: 125, away: 1 });

    const preview = retirementPreview(relay, legs, { 1: log.slice(0, 5) }, settings, {
      side: 'away',
      player: 'a1-1',
      slot_no: 1,
      score: { home: 2, away: 1 },
    });
    expect(preview.current).toEqual({ slotNo: 1, live: { home: 2, away: 1 }, stored: { home: 125, away: 1 } });
    expect(preview.others.every((line) => line.outcome === 'empty')).toBe(true);
    expect(preview.milestone).toBe(125);
  });
});
