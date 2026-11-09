import { describe, expect, it } from 'vitest';
import type { Side } from './lineup';
import {
  changeOfEndsPoint,
  fixedServingSide,
  legChange,
  LiveEventError,
  replay,
  tryReplay,
  type LiveEvent,
  type LiveState,
  type SetupPayload,
  type SlotSetup,
} from './live';
import { validateGroupSet, validateRelayLegs, type Score } from './score';
import { DEFAULT_SEASON_SETTINGS } from './settings';

const settings = { set_target: 31, relay_milestones: [25, 50, 75, 100, 125] };

// BWF Law 11 example: A & B (home) against C & D (away).
const pairs = { home: ['A', 'B'], away: ['C', 'D'] } as const;

const groupSet = (start: Score = { home: 0, away: 0 }): SlotSetup => ({ kind: 'group', slot_no: 1, start, pairs });

/** Builds a log with seq 1, 2, 3… from short descriptions. */
type Step =
  | ['setup', Omit<SetupPayload, 'ends'> & { ends?: SetupPayload['ends'] }]
  | ['point', Side]
  | ['undo']
  | ['undo', number]
  | ['ends_changed' | 'timeout_end' | 'end_confirmed']
  | ['timeout_start' | 'retire', string]
  | ['reopened', string];

function log(...steps: Step[]): LiveEvent[] {
  const events: LiveEvent[] = [];
  const points: number[] = [];
  steps.forEach((s, i) => {
    const seq = i + 1;
    switch (s[0]) {
      case 'setup':
        events.push({ seq, kind: 'setup', payload: { ends: { left: 'home' }, ...s[1] } });
        break;
      case 'point':
        points.push(seq);
        events.push({ seq, kind: 'point', payload: { side: s[1] } });
        break;
      case 'undo':
        events.push({ seq, kind: 'undo', payload: { seq: s[1] ?? points.pop()! } });
        break;
      case 'timeout_start':
      case 'retire':
        events.push({ seq, kind: s[0], payload: { player: s[1] } });
        break;
      case 'reopened':
        events.push({ seq, kind: 'reopened', payload: { reason: s[1] } });
        break;
      default:
        events.push({ seq, kind: s[0] });
    }
  });
  return events;
}

const points = (side: Side, n: number): Step[] => Array.from({ length: n }, () => ['point', side] as Step);

/** Who serves, from which court, to whom, and the score. */
const service = (s: LiveState) => `${s.server}>${s.receiver} ${s.serverCourt} ${s.score.home}-${s.score.away}`;

const tossHomeA: Step = ['setup', { serving_side: 'home', server: 'A', receiver: 'C' }];

function rejection(setup: SlotSetup, events: LiveEvent[]) {
  const result = tryReplay(setup, events, settings);
  if (result.ok) throw new Error('expected the log to be rejected');
  return { code: result.code, seq: result.seq };
}

describe('changeOfEndsPoint', () => {
  it.each([
    [31, 16],
    [27, 14],
    [21, 11],
  ])('is %i → %i (L2)', (target, point) => {
    expect(changeOfEndsPoint(target)).toBe(point);
  });
});

describe('replay: start of a set (§4.1, L1)', () => {
  it('has no positions before the setup', () => {
    const state = replay(groupSet(), [], settings);
    expect(state).toMatchObject({
      setUp: false,
      score: { home: 0, away: 0 },
      server: null,
      receiver: null,
      positions: null,
      ends: null,
      ended: false,
      lastSeq: 0,
      target: 31,
    });
  });

  it('takes the toss at 0–0: the server serves from the right, the receiver stands diagonally', () => {
    const state = replay(groupSet(), log(tossHomeA), settings);
    expect(state).toMatchObject({
      setUp: true,
      servingSide: 'home',
      server: 'A',
      receiver: 'C',
      serverCourt: 'right',
      positions: { home: { right: 'A', left: 'B' }, away: { right: 'C', left: 'D' } },
      ends: { left: 'home' },
    });
  });

  it('requires the serving side at 0–0', () => {
    expect(fixedServingSide(groupSet())).toBeNull();
    expect(rejection(groupSet(), log(['setup', { server: 'A', receiver: 'C' }]))).toEqual({
      code: 'SERVING_SIDE_REQUIRED',
      seq: 1,
    });
  });

  it('with a handicap, the side that starts at 0 serves and the choice is fixed', () => {
    const handicap = groupSet({ home: 9, away: 0 });
    expect(fixedServingSide(handicap)).toBe('away');
    const state = replay(handicap, log(['setup', { server: 'D', receiver: 'B' }]), settings);
    expect(state).toMatchObject({ servingSide: 'away', server: 'D', receiver: 'B', serverCourt: 'right' });
    expect(state.positions).toEqual({ home: { right: 'B', left: 'A' }, away: { right: 'D', left: 'C' } });
    // Naming the fixed side is fine; naming the other one is rejected.
    expect(
      replay(handicap, log(['setup', { serving_side: 'away', server: 'C', receiver: 'A' }]), settings).server,
    ).toBe('C');
    expect(rejection(handicap, log(['setup', { serving_side: 'home', server: 'A', receiver: 'C' }])).code).toBe(
      'SERVING_SIDE_FIXED',
    );
  });

  it('rejects a server or receiver from the wrong pair', () => {
    expect(rejection(groupSet(), log(['setup', { serving_side: 'home', server: 'C', receiver: 'A' }])).code).toBe(
      'INVALID_SERVER',
    );
    expect(rejection(groupSet(), log(['setup', { serving_side: 'home', server: 'A', receiver: 'B' }])).code).toBe(
      'INVALID_RECEIVER',
    );
  });
});

describe('replay: rallies (§4.2, BWF Law 11 doubles examples)', () => {
  it('follows the BWF doubles service sequence', () => {
    const steps: Step[] = [tossHomeA];
    const seen = [service(replay(groupSet(), log(...steps), settings))];
    for (const side of ['home', 'away', 'home', 'away', 'away', 'home'] as const) {
      steps.push(['point', side]);
      seen.push(service(replay(groupSet(), log(...steps), settings)));
    }
    expect(seen).toEqual([
      'A>C right 0-0',
      // A & B win: they swap, A serves again from the left to D.
      'A>D left 1-0',
      // C & D win: nobody moves; on 1 (odd) the player in their left court, D, serves to A.
      'D>A left 1-1',
      // A & B win: on 2 (even) the player in their right court, B, serves to C.
      'B>C right 2-1',
      // C & D win: on 2 the right-court player, C, serves to B.
      'C>B right 2-2',
      // C & D win again: C and D swap, C serves from the left to A.
      'C>A left 2-3',
      // A & B win: on 3 (odd) the left-court player, A, serves to C.
      'A>C left 3-3',
    ]);
  });

  it('serves from the court that matches a handicapped score', () => {
    // Home starts at 9 and wins the first rally: on 10 (even) its right-court player serves.
    const state = replay(
      groupSet({ home: 9, away: 0 }),
      log(['setup', { server: 'C', receiver: 'A' }], ['point', 'home']),
      settings,
    );
    expect(service(state)).toBe('A>C right 10-0');
    expect(state.rallies).toEqual([{ seq: 2, side: 'home', score: { home: 10, away: 0 } }]);
  });

  it('rejects a point before the setup', () => {
    expect(rejection(groupSet(), log(['point', 'home']))).toEqual({ code: 'NOT_SET_UP', seq: 1 });
  });

  it('rejects a log that skips or repeats a seq', () => {
    const events = log(tossHomeA, ['point', 'home']);
    expect(rejection(groupSet(), [events[0], { ...events[1], seq: 3 }])).toEqual({ code: 'SEQ_OUT_OF_ORDER', seq: 3 });
    expect(rejection(groupSet(), [events[0], { ...events[1], seq: 1 }]).code).toBe('SEQ_OUT_OF_ORDER');
  });
});

describe('replay: change of ends (§4.3, L2, L3)', () => {
  it('without a handicap, is due when the first side reaches 16', () => {
    const before = replay(groupSet(), log(tossHomeA, ...points('away', 15), ...points('home', 15)), settings);
    expect(before.changeEndsDue).toBe(false);
    const due = replay(groupSet(), log(tossHomeA, ...points('away', 15), ...points('home', 16)), settings);
    expect(due).toMatchObject({ changeEndsDue: true, endsChanged: false, ends: { left: 'home' } });
  });

  it('with a handicap, is due only when the side that started at 0 reaches 16', () => {
    const handicap = groupSet({ home: 0, away: 9 });
    const setup: Step = ['setup', { server: 'A', receiver: 'C' }];
    // Away (start 9) passes 16 first: no change.
    expect(replay(handicap, log(setup, ...points('away', 10)), settings).changeEndsDue).toBe(false);
    expect(replay(handicap, log(setup, ...points('away', 10), ...points('home', 16)), settings).changeEndsDue).toBe(
      true,
    );
  });

  it('blocks points until Tiếp tục, then mirrors the ends once per set', () => {
    const due = log(tossHomeA, ...points('home', 16));
    expect(rejection(groupSet(), [...due, { seq: 18, kind: 'point', payload: { side: 'home' } }]).code).toBe(
      'CHANGE_ENDS_PENDING',
    );
    const changed = replay(groupSet(), log(tossHomeA, ...points('home', 16), ['ends_changed']), settings);
    expect(changed).toMatchObject({ changeEndsDue: false, endsChanged: true, ends: { left: 'away' } });
    // The other side reaching 16 later does not change the ends again.
    const later = replay(
      groupSet(),
      log(tossHomeA, ...points('home', 16), ['ends_changed'], ...points('away', 16)),
      settings,
    );
    expect(later).toMatchObject({ changeEndsDue: false, ends: { left: 'away' } });
  });

  it('rejects ends_changed when it is not due', () => {
    expect(rejection(groupSet(), log(tossHomeA, ...points('home', 3), ['ends_changed'])).code).toBe(
      'CHANGE_ENDS_NOT_DUE',
    );
  });

  it('never happens inside a relay leg', () => {
    const leg: SlotSetup = {
      kind: 'relay',
      slot_no: 2,
      start: { home: 25, away: 20 },
      pairs,
      carried_serving_side: 'home',
    };
    const state = replay(leg, log(tossHomeA, ...points('away', 13)), settings);
    expect(state).toMatchObject({ score: { home: 25, away: 33 }, changeEndsDue: false, target: 50 });
  });
});

describe('replay: end of a set or leg (§4.4)', () => {
  it('ends the set when a side reaches set_target, then waits for the confirmation', () => {
    const steps: Step[] = [tossHomeA, ...points('home', 16), ['ends_changed'], ...points('home', 15)];
    const ended = replay(groupSet(), log(...steps), settings);
    expect(ended).toMatchObject({ score: { home: 31, away: 0 }, ended: true, confirmed: false, winnerSide: 'home' });
    expect(rejection(groupSet(), log(...steps, ['point', 'away'])).code).toBe('ENDED');
    expect(replay(groupSet(), log(...steps, ['end_confirmed']), settings).confirmed).toBe(true);
  });

  it('rejects a confirmation before the end', () => {
    expect(rejection(groupSet(), log(tossHomeA, ['point', 'home'], ['end_confirmed'])).code).toBe('NOT_ENDED');
  });

  it('ends a relay leg at its cumulative milestone', () => {
    const leg: SlotSetup = { kind: 'relay', slot_no: 1, start: { home: 0, away: 6 }, pairs };
    const state = replay(leg, log(['setup', { server: 'A', receiver: 'C' }], ...points('away', 19)), settings);
    expect(state).toMatchObject({ score: { home: 0, away: 25 }, ended: true, winnerSide: 'away', target: 25 });
  });
});

describe('legChange (§4.4, L3, L4)', () => {
  const leg1: SlotSetup = { kind: 'relay', slot_no: 1, start: { home: 0, away: 0 }, pairs };
  const leg1Log = log(tossHomeA, ...points('home', 20), ...points('away', 4), ...points('home', 5));

  it('carries the cumulative score, the last rally winner and mirrored ends', () => {
    const ended = replay(leg1, leg1Log, settings);
    expect(ended.score).toEqual({ home: 25, away: 4 });
    expect(legChange(ended)).toEqual({
      start: { home: 25, away: 4 },
      carried_serving_side: 'home',
      ends: { left: 'away' },
    });
  });

  it('serves the next leg from the court of the cumulative score, by the carried side only', () => {
    const next = legChange(replay(leg1, log(tossHomeA, ...points('home', 20), ...points('away', 5)), settings));
    expect(next).toBeNull();

    // Away wins the last rally of leg 1 at 21–25 and serves leg 2 from 25 (odd): the left court.
    const awayLast = log(tossHomeA, ...points('home', 21), ...points('away', 25));
    const change = legChange(replay(leg1, awayLast, settings))!;
    expect(change.carried_serving_side).toBe('away');
    const leg2: SlotSetup = {
      kind: 'relay',
      slot_no: 2,
      start: change.start,
      pairs: { home: ['E', 'F'], away: ['G', 'H'] },
      carried_serving_side: change.carried_serving_side,
    };
    expect(fixedServingSide(leg2)).toBe('away');
    const state = replay(leg2, log(['setup', { server: 'G', receiver: 'E', ends: change.ends }]), settings);
    expect(state).toMatchObject({
      servingSide: 'away',
      server: 'G',
      receiver: 'E',
      serverCourt: 'left',
      positions: { home: { left: 'E', right: 'F' }, away: { left: 'G', right: 'H' } },
      ends: { left: 'away' },
      target: 50,
    });
    expect(
      rejection(leg2, log(['setup', { serving_side: 'home', server: 'E', receiver: 'G', ends: change.ends }])).code,
    ).toBe('SERVING_SIDE_FIXED');
  });

  it('is null before the end or after a retirement', () => {
    expect(legChange(replay(leg1, log(tossHomeA, ['point', 'home']), settings))).toBeNull();
    expect(legChange(replay(leg1, [], settings))).toBeNull();
    const retired = replay(leg1, log(tossHomeA, ['point', 'home'], ['timeout_start', 'C'], ['retire', 'C']), settings);
    expect(retired.ended).toBe(true);
    expect(legChange(retired)).toBeNull();
  });
});

describe('replay: corrections (§4.5, L10)', () => {
  it('undo cancels the last point and recomputes the server', () => {
    const state = replay(groupSet(), log(tossHomeA, ['point', 'home'], ['point', 'away'], ['undo']), settings);
    expect(service(state)).toBe('A>D left 1-0');
    expect(state.rallies.map((r) => r.seq)).toEqual([2]);
    expect(state.lastSeq).toBe(4);
  });

  it('undo can be repeated back to the setup of the set', () => {
    const state = replay(
      groupSet(),
      log(tossHomeA, ['point', 'home'], ['point', 'away'], ['undo'], ['undo']),
      settings,
    );
    expect(service(state)).toBe('A>C right 0-0');
    expect(rejection(groupSet(), log(tossHomeA, ['point', 'home'], ['undo'], ['undo'])).code).toBe('NOTHING_TO_UNDO');
  });

  it('undo must name the last uncancelled point', () => {
    expect(rejection(groupSet(), log(tossHomeA, ['point', 'home'], ['point', 'home'], ['undo', 2])).code).toBe(
      'UNDO_NOT_LAST',
    );
  });

  it('undoing the rally that reached 16 removes the change-of-ends prompt', () => {
    const state = replay(groupSet(), log(tossHomeA, ...points('home', 16), ['undo']), settings);
    expect(state).toMatchObject({ score: { home: 15, away: 0 }, changeEndsDue: false, endsChanged: false });
    // Reaching 16 again brings the prompt back.
    expect(
      replay(groupSet(), log(tossHomeA, ...points('home', 16), ['undo'], ['point', 'home']), settings),
    ).toMatchObject({ changeEndsDue: true });
  });

  it('undo across a change of ends already made keeps the new ends and does not prompt again', () => {
    const steps: Step[] = [tossHomeA, ...points('home', 16), ['ends_changed'], ['undo'], ['undo'], ['point', 'home']];
    const state = replay(groupSet(), log(...steps, ['point', 'home']), settings);
    expect(state).toMatchObject({ score: { home: 16, away: 0 }, changeEndsDue: false, ends: { left: 'away' } });
  });

  it('undoing the winning point before the confirmation reopens play', () => {
    const steps: Step[] = [tossHomeA, ...points('away', 16), ['ends_changed'], ...points('away', 15), ['undo']];
    const state = replay(groupSet(), log(...steps), settings);
    expect(state).toMatchObject({ score: { home: 0, away: 30 }, ended: false, winnerSide: null });
    expect(replay(groupSet(), log(...steps, ['point', 'home']), settings).score).toEqual({ home: 1, away: 30 });
  });

  it('cannot undo past end_confirmed; only reopened lifts it', () => {
    const steps: Step[] = [
      tossHomeA,
      ...points('away', 16),
      ['ends_changed'],
      ...points('away', 15),
      ['end_confirmed'],
    ];
    expect(rejection(groupSet(), log(...steps, ['undo'])).code).toBe('CONFIRMED');
    expect(rejection(groupSet(), log(...steps, tossHomeA)).code).toBe('CONFIRMED');
    expect(rejection(groupSet(), log(...steps, ['reopened', '  '])).code).toBe('REASON_REQUIRED');
    const reopened = replay(groupSet(), log(...steps, ['reopened', 'Wrong last point']), settings);
    expect(reopened).toMatchObject({ confirmed: false, ended: true });
    expect(replay(groupSet(), log(...steps, ['reopened', 'Wrong last point'], ['undo']), settings).score).toEqual({
      home: 0,
      away: 30,
    });
  });

  it('rejects reopened when nothing is confirmed', () => {
    expect(rejection(groupSet(), log(tossHomeA, ['reopened', 'x'])).code).toBe('NOT_CONFIRMED');
  });

  it('a later setup recomputes the positions and servers without changing the score', () => {
    const rallies: Step[] = [
      ['point', 'home'],
      ['point', 'away'],
      ['point', 'home'],
    ];
    const first = replay(groupSet(), log(tossHomeA, ...rallies), settings);
    expect(service(first)).toBe('B>C right 2-1');
    // Fix: B served first, to D.
    const fixed = replay(
      groupSet(),
      log(tossHomeA, ...rallies, ['setup', { serving_side: 'home', server: 'B', receiver: 'D' }]),
      settings,
    );
    expect(fixed.score).toEqual(first.score);
    expect(service(fixed)).toBe('A>D right 2-1');
    expect(fixed.positions).toEqual({ home: { right: 'A', left: 'B' }, away: { right: 'D', left: 'C' } });
    // At 0–0 the toss itself can be corrected.
    const toss = replay(
      groupSet(),
      log(tossHomeA, ...rallies, ['setup', { serving_side: 'away', server: 'D', receiver: 'B' }]),
      settings,
    );
    expect(toss.score).toEqual(first.score);
    expect(service(toss)).toBe('B>D right 2-1');
  });

  it('a later setup can fix the ends', () => {
    const state = replay(
      groupSet(),
      log(
        tossHomeA,
        ['point', 'home'],
        ['setup', { serving_side: 'home', server: 'A', receiver: 'C', ends: { left: 'away' } }],
      ),
      settings,
    );
    expect(state.ends).toEqual({ left: 'away' });
  });
});

describe('replay: timeouts and retirement (§6, L7–L9)', () => {
  const timeout: Step[] = [tossHomeA, ...points('home', 5), ['timeout_start', 'D']];

  it('blocks points during a medical timeout and resumes after it', () => {
    expect(replay(groupSet(), log(...timeout), settings).timeout).toEqual({ player: 'D', side: 'away', seq: 7 });
    expect(rejection(groupSet(), log(...timeout, ['point', 'home'])).code).toBe('IN_TIMEOUT');
    expect(rejection(groupSet(), log(...timeout, ['timeout_start', 'A'])).code).toBe('IN_TIMEOUT');
    // A wrong tap can still be undone during the timeout.
    expect(replay(groupSet(), log(...timeout, ['undo']), settings).score).toEqual({ home: 4, away: 0 });
    const resumed = replay(groupSet(), log(...timeout, ['timeout_end'], ['point', 'away']), settings);
    expect(resumed).toMatchObject({ timeout: null, score: { home: 5, away: 1 } });
    // No limit on medical timeouts.
    expect(
      replay(groupSet(), log(...timeout, ['timeout_end'], ['timeout_start', 'D']), settings).timeout,
    ).not.toBeNull();
  });

  it('rejects a timeout for a player not on court, before the setup or after the end', () => {
    expect(rejection(groupSet(), log(tossHomeA, ['timeout_start', 'Z'])).code).toBe('NOT_ON_COURT');
    expect(rejection(groupSet(), log(['timeout_start', 'A'])).code).toBe('NOT_SET_UP');
    expect(
      rejection(
        groupSet(),
        log(tossHomeA, ...points('home', 16), ['ends_changed'], ...points('home', 15), ['timeout_start', 'A']),
      ).code,
    ).toBe('ENDED');
    expect(rejection(groupSet(), log(tossHomeA, ['timeout_end'])).code).toBe('NO_TIMEOUT');
  });

  it('records a retirement only after a timeout of the same player', () => {
    expect(rejection(groupSet(), log(tossHomeA, ['retire', 'D'])).code).toBe('NO_TIMEOUT');
    expect(rejection(groupSet(), log(...timeout, ['retire', 'C'])).code).toBe('NOT_INJURED_PLAYER');
    const retired = replay(groupSet(), log(...timeout, ['retire', 'D']), settings);
    expect(retired).toMatchObject({
      retired: { side: 'away', player: 'D' },
      timeout: null,
      ended: true,
      confirmed: true,
      winnerSide: 'home',
      score: { home: 5, away: 0 },
    });
    expect(rejection(groupSet(), log(...timeout, ['retire', 'D'], ['point', 'home'])).code).toBe('CONFIRMED');
  });

  it('reopening a retirement puts the set back in play', () => {
    const state = replay(groupSet(), log(...timeout, ['retire', 'D'], ['reopened', 'Player came back']), settings);
    expect(state).toMatchObject({ retired: null, ended: false, confirmed: false, winnerSide: null, timeout: null });
  });
});

describe('replay errors', () => {
  it('throws a LiveEventError with the code and seq', () => {
    expect(() => replay(groupSet(), log(['point', 'home']), settings)).toThrow(LiveEventError);
    const error = (() => {
      try {
        replay(groupSet(), log(tossHomeA, ['point', 'home'], ['undo', 9]), settings);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toMatchObject({ code: 'UNDO_NOT_LAST', seq: 3, name: 'LiveEventError' });
  });
});

// Property test: random rally sequences (with random undos) never produce a final score that the
// Phase 1 validators reject, and the service rules hold after every rally.
describe('replay: random rally sequences', () => {
  /** Deterministic PRNG (mulberry32), so a failure can be replayed from its seed. */
  function random(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function checkService(state: LiveState, slot: SlotSetup) {
    const serving = state.servingSide!;
    const court = state.score[serving] % 2 === 0 ? 'right' : 'left';
    expect(state.serverCourt).toBe(court);
    expect(slot.pairs[serving]).toContain(state.server);
    expect(state.positions![serving][court]).toBe(state.server);
    expect(state.positions![serving === 'home' ? 'away' : 'home'][court]).toBe(state.receiver);
  }

  /** Plays one slot to its end with random rallies and undos; returns the confirmed state. */
  function play(slot: SlotSetup, next: () => number, ends = { left: 'home' as Side }) {
    const serving = fixedServingSide(slot) ?? (next() < 0.5 ? 'home' : 'away');
    const receiving = serving === 'home' ? 'away' : 'home';
    const events: LiveEvent[] = [
      {
        seq: 1,
        kind: 'setup',
        payload: {
          serving_side: serving,
          server: slot.pairs[serving][next() < 0.5 ? 0 : 1],
          receiver: slot.pairs[receiving][next() < 0.5 ? 0 : 1],
          ends,
        },
      },
    ];
    const live: number[] = [];
    let state = replay(slot, events, settings);
    while (!state.ended) {
      const seq = events.length + 1;
      if (state.changeEndsDue && next() < 0.8) events.push({ seq, kind: 'ends_changed' });
      // While the change of ends is due, the only other valid action is undoing the rally that reached it.
      else if (live.length > 0 && (state.changeEndsDue || next() < 0.1))
        events.push({ seq, kind: 'undo', payload: { seq: live.pop()! } });
      else {
        live.push(seq);
        events.push({ seq, kind: 'point', payload: { side: next() < 0.5 ? 'home' : 'away' } });
      }
      state = replay(slot, events, settings);
      checkService(state, slot);
    }
    events.push({ seq: events.length + 1, kind: 'end_confirmed' });
    return replay(slot, events, settings);
  }

  it('group sets always end with a valid set score', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed);
      const h = Math.floor(next() * (DEFAULT_SEASON_SETTINGS.group_handicap_cap + 1));
      const start = next() < 0.5 ? { home: h, away: 0 } : { home: 0, away: h };
      const state = play(groupSet(start), next);
      const result = validateGroupSet(
        {
          slot_no: 1,
          score_home: state.score.home,
          score_away: state.score.away,
          handicap_home: start.home,
          handicap_away: start.away,
        },
        settings,
      );
      expect(result.violations, `seed ${seed}`).toEqual([]);
      expect(result.winner).toBe(state.winnerSide);
    }
  });

  it('relays always end with valid cumulative legs', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const next = random(seed);
      const h = Math.floor(next() * (DEFAULT_SEASON_SETTINGS.ko_handicap_cap + 1));
      const handicap = next() < 0.5 ? { home: h, away: 0 } : { home: 0, away: h };
      const legs = [];
      let slot: SlotSetup = { kind: 'relay', slot_no: 1, start: handicap, pairs };
      let state = play(slot, next);
      legs.push({ slot_no: 1, score_home: state.score.home, score_away: state.score.away });
      for (let legNo = 2; legNo <= settings.relay_milestones.length; legNo++) {
        const change = legChange(state)!;
        slot = {
          kind: 'relay',
          slot_no: legNo,
          start: change.start,
          pairs,
          carried_serving_side: change.carried_serving_side,
        };
        state = play(slot, next, change.ends);
        legs.push({ slot_no: legNo, score_home: state.score.home, score_away: state.score.away });
      }
      const result = validateRelayLegs(legs, handicap, { ...settings, ko_handicap_cap: 15 });
      expect(result.violations, `seed ${seed}`).toEqual([]);
      expect(result.winner).toBe(state.winnerSide);
    }
  });
});
