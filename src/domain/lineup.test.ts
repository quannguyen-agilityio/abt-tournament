import { describe, expect, it } from 'vitest';
import {
  effectivePair,
  validateLineup,
  type LineupAttendance,
  type LineupRuleCode,
  type LineupSlot,
  type PresentPlayer,
  type Side,
} from './lineup';
import { DEFAULT_SEASON_SETTINGS } from './settings';

const settings = DEFAULT_SEASON_SETTINGS;

/** Players `<prefix>1`…`<prefix>n`; player i has rank i. */
const roster = (prefix: string, n = 7): PresentPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, rank: i + 1 }));

const fullAttendance = (): LineupAttendance => ({ home: roster('h'), away: roster('a') });

type Pair = [string | null, string | null];

/**
 * A valid home lineup for the 2026 slot order (open, low, open, high, open):
 * every player plays 1–2 slots, none twice in a row, the low and high slots in range.
 */
const validPairs = (): Pair[] => [
  ['h1', 'h7'],
  ['h4', 'h5'],
  ['h2', 'h6'],
  ['h3', 'h1'],
  ['h7', 'h4'],
];

function slots(home: Pair[], subs: Record<number, LineupSlot['substitutions']> = {}): LineupSlot[] {
  return home.map(([p1, p2], i) => ({
    slot_no: i + 1,
    slot_type: settings.slot_types[i],
    home_p1: p1,
    home_p2: p2,
    away_p1: `a${i + 1}`,
    away_p2: `a${((i + 3) % 7) + 1}`,
    substitutions: subs[i + 1],
  }));
}

interface Case {
  name: string;
  pairs?: Pair[];
  attendance?: LineupAttendance;
  subs?: Record<number, LineupSlot['substitutions']>;
  side?: Side;
  /** Expected violations as `code@slotNo:playerId`, in any order. */
  expected: string[];
}

const key = (v: { code: LineupRuleCode; slotNo?: number; playerId?: string }) =>
  `${v.code}@${v.slotNo ?? ''}:${v.playerId ?? ''}`;

function run(c: Omit<Case, 'name' | 'expected'>) {
  return validateLineup(
    { imported: false },
    c.side ?? 'home',
    c.attendance ?? fullAttendance(),
    slots(c.pairs ?? validPairs(), c.subs),
    settings,
  );
}

const withPair = (slotNo: number, pair: Pair): Pair[] => validPairs().map((p, i) => (i === slotNo - 1 ? pair : p));

const cases: Record<LineupRuleCode, { pass: Omit<Case, 'expected'>; fail: Case }> = {
  SLOT_INCOMPLETE: {
    pass: { name: 'two distinct players in every slot' },
    fail: {
      name: 'a missing player and a player listed twice',
      pairs: [
        ['h1', 'h7'],
        ['h4', 'h5'],
        ['h2', 'h2'],
        ['h3', 'h1'],
        ['h6', null],
      ],
      expected: ['SLOT_INCOMPLETE@3:', 'SLOT_INCOMPLETE@5:'],
    },
  },
  NOT_PRESENT: {
    pass: { name: 'every slot player is in the attendance' },
    fail: {
      name: "a player who is not in this team's attendance",
      pairs: withPair(3, ['h2', 'x9']),
      // h6 no longer plays a slot.
      expected: ['NOT_PRESENT@3:x9', 'MIN_SETS@:h6'],
    },
  },
  MIN_SETS: {
    pass: { name: 'every present player plays at least one slot' },
    fail: {
      name: 'a present player with no slot',
      attendance: { home: [...roster('h'), { id: 'h8', rank: 6 }], away: roster('a') },
      expected: ['MIN_SETS@:h8'],
    },
  },
  MAX_SETS: {
    pass: { name: 'nobody plays more than two slots' },
    fail: {
      name: 'a player in three slots',
      pairs: [
        ['h1', 'h7'],
        ['h4', 'h5'],
        ['h1', 'h6'],
        ['h3', 'h2'],
        ['h1', 'h7'],
      ],
      expected: ['MAX_SETS@:h1'],
    },
  },
  CONSECUTIVE: {
    pass: { name: 'a player in slots 1 and 4 only' },
    fail: {
      name: 'a player in slots 1 and 2',
      pairs: [
        ['h1', 'h7'],
        ['h7', 'h5'],
        ['h2', 'h6'],
        ['h3', 'h1'],
        ['h4', 'h4b'],
      ],
      attendance: { home: [...roster('h'), { id: 'h4b', rank: 4 }], away: roster('a') },
      expected: ['CONSECUTIVE@2:h7'],
    },
  },
  LOW_RANK_SLOT: {
    pass: { name: 'both low-slot players ranked 4–7' },
    fail: {
      name: 'a rank-3 player in the low slot',
      pairs: [
        ['h1', 'h7'],
        ['h3', 'h5'],
        ['h2', 'h6'],
        ['h4', 'h1'],
        ['h7', 'h3'],
      ],
      // Also puts rank 4 in the high slot.
      expected: ['LOW_RANK_SLOT@2:h3', 'HIGH_RANK_SLOT@4:h4'],
    },
  },
  HIGH_RANK_SLOT: {
    pass: { name: 'both high-slot players ranked 1–3' },
    fail: {
      name: 'a rank-5 player in the high slot',
      pairs: [
        ['h1', 'h7'],
        ['h4', 'h6'],
        ['h2', 'h3'],
        ['h5', 'h1'],
        ['h7', 'h4'],
      ],
      expected: ['HIGH_RANK_SLOT@4:h5'],
    },
  },
  COMPENSATION: {
    pass: {
      name: 'the lone rank-7 player of the short-handed team plays two slots',
      attendance: { home: roster('h', 6).concat({ id: 'h7', rank: 7 }), away: roster('a', 8) },
    },
    fail: {
      name: 'the lone rank-7 player of the short-handed team plays one slot',
      pairs: withPair(5, ['h4', 'h6']),
      attendance: { home: roster('h'), away: roster('a', 8) },
      expected: ['COMPENSATION@:h7'],
    },
  },
  MIN_PRESENT: {
    pass: { name: 'exactly five players present', attendance: { home: roster('h', 5), away: roster('a') }, pairs: [] },
    fail: {
      name: 'four players present',
      attendance: { home: roster('h', 4), away: roster('a') },
      // Only MIN_PRESENT: the other rules are not evaluated for a blocked match.
      expected: ['MIN_PRESENT@:'],
    },
  },
  SUB_RANK: {
    pass: {
      name: 'a substitute one rank away',
      attendance: { home: [...roster('h'), { id: 'h8', rank: 6 }], away: roster('a') },
      subs: { 5: [{ side: 'home', replaced_id: 'h7', substitute_id: 'h8' }] },
    },
    fail: {
      name: 'a substitute two ranks away',
      attendance: { home: [...roster('h'), { id: 'h8', rank: 5 }], away: roster('a') },
      subs: { 5: [{ side: 'home', replaced_id: 'h7', substitute_id: 'h8' }] },
      expected: ['SUB_RANK@5:h8'],
    },
  },
};

describe('validateLineup', () => {
  describe.each(Object.entries(cases))('%s', (code, { pass, fail }) => {
    it(`passes: ${pass.name}`, () => {
      const result = run(pass);
      if (code === 'MIN_PRESENT') {
        // Five players are enough to unblock the match; the empty lineup itself is not valid.
        expect(result.map((v) => v.code)).not.toContain('MIN_PRESENT');
      } else {
        expect(result).toEqual([]);
      }
    });

    it(`fails: ${fail.name}`, () => {
      const result = run(fail);
      expect(result.map(key).sort()).toEqual([...fail.expected].sort());
      expect(result.some((v) => v.code === code)).toBe(true);
    });
  });

  it('builds the message key from the code and passes ICU params', () => {
    const [v] = run(cases.MAX_SETS.fail);
    expect(v).toEqual({
      code: 'MAX_SETS',
      playerId: 'h1',
      message_key: 'Lineup.violations.MAX_SETS',
      params: { maximum: 2 },
    });
    expect(run(cases.LOW_RANK_SLOT.fail).find((x) => x.code === 'LOW_RANK_SLOT')?.params).toEqual({ min: 4, max: 7 });
  });

  it('skips every check for an imported match', () => {
    const result = validateLineup(
      { imported: true },
      'home',
      { home: [], away: roster('a') },
      slots([[null, null]]),
      settings,
    );
    expect(result).toEqual([]);
  });

  it('checks the away side against its own attendance and the home count', () => {
    const away = slots(validPairs()).map((s) => ({
      ...s,
      away_p1: s.home_p1?.replace('h', 'a') ?? null,
      away_p2: s.home_p2?.replace('h', 'a') ?? null,
    }));
    expect(validateLineup({ imported: false }, 'away', fullAttendance(), away, settings)).toEqual([]);

    const shortAway = { home: roster('h', 8), away: roster('a') };
    const oneSlotForA7 = away.map((s) => (s.slot_no === 5 ? { ...s, away_p1: 'a4', away_p2: 'a6' } : s));
    expect(validateLineup({ imported: false }, 'away', shortAway, oneSlotForA7, settings).map(key)).toEqual([
      'COMPENSATION@:a7',
    ]);
  });

  it('does not require compensation when the teams are level or there are two rank-7 players', () => {
    const pairs = withPair(5, ['h4', 'h6']);
    expect(run({ pairs })).toEqual([]);
    const twoSevens = { home: [...roster('h', 6), { id: 'h7', rank: 7 }, { id: 'h8', rank: 7 }], away: roster('a', 9) };
    expect(run({ pairs: withPair(5, ['h8', 'h4']), attendance: twoSevens })).toEqual([]);
  });

  it('evaluates the slots in slot_no order whatever the input order', () => {
    const reversed = slots(validPairs()).reverse();
    expect(validateLineup({ imported: false }, 'home', fullAttendance(), reversed, settings)).toEqual([]);
  });

  it('ignores the other side’s substitutions and a substitution for a player not in the slot', () => {
    const subs = {
      2: [{ side: 'away' as const, replaced_id: 'a2', substitute_id: 'a7' }],
      3: [{ side: 'home' as const, replaced_id: 'h1', substitute_id: 'h5' }],
    };
    // h1 is not in slot 3, so the pair stays h2/h6. The rank gap (1 → 5) is still reported.
    expect(run({ subs }).map(key)).toEqual(['SUB_RANK@3:h5']);
  });

  it('leaves SUB_RANK to NOT_PRESENT when the substitute is absent', () => {
    const subs = { 3: [{ side: 'home' as const, replaced_id: 'h6', substitute_id: 'x9' }] };
    expect(run({ subs }).map(key).sort()).toEqual(['MIN_SETS@:h6', 'NOT_PRESENT@3:x9']);
  });
});

describe('effectivePair', () => {
  it('applies substitutions in order', () => {
    const [slot] = slots([['h1', 'h2']], {
      1: [
        { side: 'home', replaced_id: 'h1', substitute_id: 'h3' },
        { side: 'home', replaced_id: 'h3', substitute_id: 'h4' },
      ],
    });
    expect(effectivePair(slot, 'home')).toEqual(['h4', 'h2']);
    expect(effectivePair(slot, 'away')).toEqual(['a1', 'a4']);
  });
});
