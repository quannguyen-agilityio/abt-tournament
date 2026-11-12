import { describe, expect, it } from 'vitest';

import type { LiveEvent } from '../domain/live';
import { DEFAULT_SEASON_SETTINGS } from '../domain/settings';
import {
  changesPublicResults,
  checkLiveEvent,
  eventPayload,
  isResentEvent,
  lastRallySide,
  liveSlotSetup,
  parseFinalEntryInput,
  parseLiveClaimInput,
  parseLiveEventInput,
  toLiveEvent,
  type LiveSlotRow,
} from './live-scoring';

const SLOT_ID = '00000000-0000-4000-8000-000000000041';
const settings = DEFAULT_SEASON_SETTINGS;

const row = (over: Partial<LiveSlotRow> = {}): LiveSlotRow => ({
  slot_no: 1,
  home_p1: 'h1',
  home_p2: 'h2',
  away_p1: 'a1',
  away_p2: 'a2',
  handicap_home: 0,
  handicap_away: 0,
  ...over,
});
const group = { stage: 'group', relay_handicap_home: null, relay_handicap_away: null };
const relay = { stage: 'final', relay_handicap_home: 0, relay_handicap_away: 6 };

const MATCH_ID = '00000000-0000-4000-8000-000000000031';
const SCORER_ID = '00000000-0000-4000-8000-0000000000a1';

describe('parseLiveClaimInput', () => {
  it('reads a claim with nobody holding the lock', () => {
    expect(parseLiveClaimInput({ matchId: MATCH_ID })).toEqual({ matchId: MATCH_ID, expectedScorerId: null });
    expect(parseLiveClaimInput({ matchId: MATCH_ID, expectedScorerId: null })).toEqual({
      matchId: MATCH_ID,
      expectedScorerId: null,
    });
  });

  it('reads a takeover with the scorer the screen showed', () => {
    expect(parseLiveClaimInput({ matchId: MATCH_ID, expectedScorerId: SCORER_ID })).toEqual({
      matchId: MATCH_ID,
      expectedScorerId: SCORER_ID,
    });
  });

  it('rejects malformed input', () => {
    expect(parseLiveClaimInput(undefined)).toBeNull();
    expect(parseLiveClaimInput({})).toBeNull();
    expect(parseLiveClaimInput({ matchId: 'V01' })).toBeNull();
    expect(parseLiveClaimInput({ matchId: MATCH_ID, expectedScorerId: 'Referee One' })).toBeNull();
  });
});

describe('parseLiveEventInput', () => {
  it('reads a point', () => {
    expect(
      parseLiveEventInput({
        slotId: SLOT_ID,
        expectedSeq: 2,
        event: { kind: 'point', payload: { side: 'home' } },
        clientAt: '2027-03-01T08:00:00+07:00',
      }),
    ).toEqual({
      slotId: SLOT_ID,
      expectedSeq: 2,
      event: { kind: 'point', payload: { side: 'home' } },
      clientAt: '2027-03-01T08:00:00+07:00',
    });
  });

  it('reads a retirement with the injured player (§6)', () => {
    expect(
      parseLiveEventInput({ slotId: SLOT_ID, expectedSeq: 7, event: { kind: 'retire', payload: { player: 'h1' } } })
        ?.event,
    ).toEqual({ kind: 'retire', payload: { player: 'h1' } });
  });

  it('reads events without a payload', () => {
    expect(parseLiveEventInput({ slotId: SLOT_ID, expectedSeq: 9, event: { kind: 'end_confirmed' } })?.event).toEqual({
      kind: 'end_confirmed',
    });
  });

  it.each([
    ['a bad slot id', { slotId: 'x', expectedSeq: 1, event: { kind: 'ends_changed' } }],
    ['seq 0', { slotId: SLOT_ID, expectedSeq: 0, event: { kind: 'ends_changed' } }],
    ['a point without a side', { slotId: SLOT_ID, expectedSeq: 1, event: { kind: 'point', payload: {} } }],
    ['an unknown kind', { slotId: SLOT_ID, expectedSeq: 1, event: { kind: 'reset' } }],
    ['a retirement without a player', { slotId: SLOT_ID, expectedSeq: 1, event: { kind: 'retire', payload: {} } }],
    [
      'a reopen without a reason',
      { slotId: SLOT_ID, expectedSeq: 1, event: { kind: 'reopened', payload: { reason: '  ' } } },
    ],
    ['a bad client time', { slotId: SLOT_ID, expectedSeq: 1, event: { kind: 'ends_changed' }, clientAt: 'now' }],
  ])('rejects %s', (_name, input) => {
    expect(parseLiveEventInput(input)).toBeNull();
  });
});

describe('eventPayload and toLiveEvent', () => {
  it('stores {} for events without a payload and drops it on the way back', () => {
    expect(eventPayload({ kind: 'end_confirmed' })).toEqual({});
    expect(toLiveEvent({ seq: 4, kind: 'end_confirmed', payload: {} })).toEqual({ seq: 4, kind: 'end_confirmed' });
  });

  it('keeps the payload of the other events', () => {
    expect(eventPayload({ kind: 'undo', payload: { seq: 3 } })).toEqual({ seq: 3 });
    expect(toLiveEvent({ seq: 5, kind: 'undo', payload: { seq: 3 } })).toEqual({
      seq: 5,
      kind: 'undo',
      payload: { seq: 3 },
    });
  });
});

describe('lastRallySide', () => {
  it('skips cancelled points', () => {
    const events: LiveEvent[] = [
      { seq: 1, kind: 'point', payload: { side: 'home' } },
      { seq: 2, kind: 'point', payload: { side: 'away' } },
      { seq: 3, kind: 'undo', payload: { seq: 2 } },
      { seq: 4, kind: 'end_confirmed' },
    ];
    expect(lastRallySide(events)).toBe('home');
    expect(lastRallySide([])).toBeNull();
  });
});

describe('liveSlotSetup', () => {
  it('starts a group set from its start points', () => {
    expect(liveSlotSetup({ slot: row({ handicap_away: 4 }), match: group })).toEqual({
      kind: 'group',
      slot_no: 1,
      start: { home: 0, away: 4 },
      pairs: { home: ['h1', 'h2'], away: ['a1', 'a2'] },
    });
  });

  it('puts substitutes on court', () => {
    const slot = row({ substitutions: [{ side: 'away', replaced_id: 'a2', substitute_id: 'a3' }] });
    expect(liveSlotSetup({ slot, match: group })?.pairs.away).toEqual(['a1', 'a3']);
  });

  it('needs both pairs', () => {
    expect(liveSlotSetup({ slot: row({ home_p2: null }), match: group })).toBeNull();
  });

  it('starts relay leg 1 from the relay start', () => {
    expect(liveSlotSetup({ slot: row(), match: relay })?.start).toEqual({ home: 0, away: 6 });
  });

  it('starts a later leg from the previous leg, the last rally winner serving (L4)', () => {
    const previous = {
      score: { home: 25, away: 22 },
      events: [{ seq: 1, kind: 'point', payload: { side: 'away' } }] as LiveEvent[],
    };
    expect(liveSlotSetup({ slot: row({ slot_no: 2 }), match: relay, previous })).toMatchObject({
      kind: 'relay',
      slot_no: 2,
      start: { home: 25, away: 22 },
      carried_serving_side: 'away',
    });
  });

  it('waits for the previous leg to be confirmed', () => {
    const previous = { score: { home: null, away: null }, events: [] };
    expect(liveSlotSetup({ slot: row({ slot_no: 2 }), match: relay, previous })).toBeNull();
    expect(liveSlotSetup({ slot: row({ slot_no: 2 }), match: relay })).toBeNull();
  });
});

describe('checkLiveEvent', () => {
  // Away starts at 30 of 31, so home serves first (L1) and one away rally ends the set.
  const setup = liveSlotSetup({ slot: row({ handicap_away: 30 }), match: group })!;
  const started: LiveEvent[] = [
    { seq: 1, kind: 'setup', payload: { server: 'h1', receiver: 'a1', ends: { left: 'home' } } },
  ];
  const ended: LiveEvent[] = [...started, { seq: 2, kind: 'point', payload: { side: 'away' } }];
  const confirmed: LiveEvent[] = [...ended, { seq: 3, kind: 'end_confirmed' }];

  it('accepts a valid point', () => {
    expect(
      checkLiveEvent(setup, started, { expectedSeq: 2, event: { kind: 'point', payload: { side: 'home' } } }, settings),
    ).toEqual({
      ok: true,
    });
  });

  it('rejects an event replayed against an older log', () => {
    expect(
      checkLiveEvent(setup, ended, { expectedSeq: 2, event: { kind: 'point', payload: { side: 'home' } } }, settings),
    ).toEqual({
      ok: false,
      code: 'SEQ_OUT_OF_ORDER',
    });
  });

  it('rejects a point before the setup', () => {
    expect(
      checkLiveEvent(setup, [], { expectedSeq: 1, event: { kind: 'point', payload: { side: 'home' } } }, settings),
    ).toEqual({
      ok: false,
      code: 'NOT_SET_UP',
    });
  });

  it('rejects a point after the set reached its target', () => {
    expect(
      checkLiveEvent(setup, ended, { expectedSeq: 3, event: { kind: 'point', payload: { side: 'home' } } }, settings),
    ).toEqual({
      ok: false,
      code: 'ENDED',
    });
  });

  it('rejects a serving side the handicap fixes', () => {
    const event = {
      kind: 'setup' as const,
      payload: { serving_side: 'away' as const, server: 'a1', receiver: 'h1', ends: { left: 'home' as const } },
    };
    expect(checkLiveEvent(setup, [], { expectedSeq: 1, event }, settings)).toEqual({
      ok: false,
      code: 'SERVING_SIDE_FIXED',
    });
  });

  it('rejects confirming a set that has not ended', () => {
    expect(checkLiveEvent(setup, started, { expectedSeq: 2, event: { kind: 'end_confirmed' } }, settings)).toEqual({
      ok: false,
      code: 'NOT_ENDED',
    });
  });

  it('rejects an undo past end_confirmed and accepts a reopen', () => {
    expect(
      checkLiveEvent(setup, confirmed, { expectedSeq: 4, event: { kind: 'undo', payload: { seq: 2 } } }, settings),
    ).toEqual({
      ok: false,
      code: 'CONFIRMED',
    });
    expect(
      checkLiveEvent(
        setup,
        confirmed,
        { expectedSeq: 4, event: { kind: 'reopened', payload: { reason: 'sai điểm' } } },
        settings,
      ),
    ).toEqual({ ok: true });
  });
});

describe('changesPublicResults', () => {
  it('is true for the first event, a confirmation and a reopen only', () => {
    expect(changesPublicResults('point', true)).toBe(true);
    expect(changesPublicResults('end_confirmed', false)).toBe(true);
    expect(changesPublicResults('reopened', false)).toBe(true);
    expect(changesPublicResults('retire', false)).toBe(true);
    expect(changesPublicResults('point', false)).toBe(false);
    expect(changesPublicResults('undo', false)).toBe(false);
  });
});

describe('parseFinalEntryInput', () => {
  it('reads the switch', () => {
    expect(parseFinalEntryInput({ matchId: MATCH_ID, on: true })).toEqual({ matchId: MATCH_ID, on: true });
    expect(parseFinalEntryInput({ matchId: MATCH_ID, on: false })).toEqual({ matchId: MATCH_ID, on: false });
  });

  it('refuses a malformed input', () => {
    expect(parseFinalEntryInput({ matchId: 'nope', on: true })).toBeNull();
    expect(parseFinalEntryInput({ matchId: MATCH_ID })).toBeNull();
  });
});

describe('parseLiveClaimInput with seed user ids', () => {
  it('accepts a scorer id that is not an RFC 4122 UUID', () => {
    const seedId = '10000000-0000-0000-0000-000000000002';
    expect(parseLiveClaimInput({ matchId: MATCH_ID, expectedScorerId: seedId })).toEqual({
      matchId: MATCH_ID,
      expectedScorerId: seedId,
    });
  });
});

describe('isResentEvent', () => {
  const USER = 'user-1';
  const at = '2026-11-12T08:15:30.123Z';
  const stored = {
    kind: 'setup' as const,
    payload: { ends: { left: 'home' }, receiver: 'a1', server: 'h1', serving_side: 'home' },
    client_at: '2026-11-12T08:15:30.123+00:00',
    created_by: USER,
  };
  const event = {
    kind: 'setup' as const,
    payload: { serving_side: 'home' as const, server: 'h1', receiver: 'a1', ends: { left: 'home' as const } },
  };

  it('matches the same tap whatever the key order and time zone notation', () => {
    expect(isResentEvent(stored, { event, clientAt: at }, USER)).toBe(true);
  });

  it('matches a stored event without payload', () => {
    const row = { kind: 'end_confirmed' as const, payload: {}, client_at: at, created_by: USER };
    expect(isResentEvent(row, { event: { kind: 'end_confirmed' }, clientAt: at }, USER)).toBe(true);
  });

  it('refuses another tap, author, kind or payload', () => {
    expect(isResentEvent(stored, { event, clientAt: '2026-11-12T08:15:30.124Z' }, USER)).toBe(false);
    expect(isResentEvent(stored, { event, clientAt: at }, 'user-2')).toBe(false);
    expect(isResentEvent({ ...stored, created_by: null }, { event, clientAt: at }, USER)).toBe(false);
    expect(isResentEvent(stored, { event: { kind: 'ends_changed' }, clientAt: at }, USER)).toBe(false);
    const other = { ...event, payload: { ...event.payload, server: 'h2' } };
    expect(isResentEvent(stored, { event: other, clientAt: at }, USER)).toBe(false);
  });

  it('cannot tell a resend without a tap time', () => {
    expect(isResentEvent(stored, { event }, USER)).toBe(false);
    expect(isResentEvent({ ...stored, client_at: 'not a date' }, { event, clientAt: at }, USER)).toBe(false);
  });
});
