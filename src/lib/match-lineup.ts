import { relayHandicap, slotHandicap, type Handicap } from '../domain/handicap';
import type { LineupRuleCode, LineupViolation } from '../domain/lineup';
import type { SeasonSettings, SlotType } from '../domain/settings';
import { isUuid } from './auth/users';

/** A present player as the lineup pickers show them. */
export type LineupPlayer = { id: string; name: string; rank: number; skillPoints: number };

/** One side's two players in a slot, as picked. */
export type SlotPair = [string | null, string | null];

/** One slot of the match with both sides' picks. */
export type LineupSlotPicks = { slotNo: number; slotType: SlotType; home: SlotPair; away: SlotPair };

export type LineupInput = {
  matchId: string;
  teamId: string;
  slots: { slot_no: number; p1: string | null; p2: string | null }[];
  /** BTC only: why the lineup is accepted with violations. Trimmed, may be empty. */
  overrideReason: string;
};

/** `MIN_PRESENT` blocks the match (spec §4.1): the BTC disqualifies the team instead of overriding. */
const NOT_OVERRIDABLE: readonly LineupRuleCode[] = ['MIN_PRESENT'];

const SLOT_FIELD = /^slot-(\d+)-p([12])$/;

/** Reads one team's lineup form: `matchId`, `teamId`, `slot-{n}-p1`/`p2` and `overrideReason`. */
export function parseLineupForm(formData: FormData): LineupInput | null {
  const matchId = String(formData.get('matchId') ?? '');
  const teamId = String(formData.get('teamId') ?? '');
  if (!isUuid(matchId) || !isUuid(teamId)) return null;

  const bySlot = new Map<number, [string | null, string | null]>();
  for (const [key, raw] of formData) {
    const field = SLOT_FIELD.exec(key);
    if (!field) continue;
    const value = String(raw);
    if (value !== '' && !isUuid(value)) return null;
    const slotNo = Number(field[1]);
    const pair = bySlot.get(slotNo) ?? [null, null];
    pair[Number(field[2]) - 1] = value === '' ? null : value;
    bySlot.set(slotNo, pair);
  }
  if (bySlot.size === 0) return null;

  const slots = [...bySlot].sort(([a], [b]) => a - b).map(([slot_no, [p1, p2]]) => ({ slot_no, p1, p2 }));
  return { matchId, teamId, slots, overrideReason: String(formData.get('overrideReason') ?? '').trim() };
}

/** Lineups are picked while the match is scheduled; the lock freezes them (A5 step 3). */
export function lineupEditable(status: string): boolean {
  return status === 'scheduled';
}

/**
 * The players offered for one slot: the team's present players whose rank fits the slot type. The
 * current picks stay listed even when they no longer fit, so that the violation shows instead of the
 * pick silently disappearing.
 */
export function slotOptions(
  present: readonly LineupPlayer[],
  slotType: SlotType,
  settings: Pick<SeasonSettings, 'low_rank_range' | 'high_rank_range'>,
  current: readonly (string | null)[],
): LineupPlayer[] {
  const range = slotType === 'low' ? settings.low_rank_range : slotType === 'high' ? settings.high_rank_range : null;
  return present.filter((p) => current.includes(p.id) || !range || (p.rank >= range.min && p.rank <= range.max));
}

/** Violations the BTC has not overridden (or cannot), which keep the lineup from being saved or locked. */
export function unresolvedViolations(
  violations: readonly LineupViolation[],
  overridden: ReadonlySet<LineupRuleCode>,
): LineupViolation[] {
  return violations.filter((v) => NOT_OVERRIDABLE.includes(v.code) || !overridden.has(v.code));
}

/** Whether every violation can be accepted with a BTC override reason. */
export function overridable(violations: readonly LineupViolation[]): boolean {
  return violations.every((v) => !NOT_OVERRIDABLE.includes(v.code));
}

function pairSkills(pair: SlotPair, skillOf: ReadonlyMap<string, number>): [number, number] | null {
  const [p1, p2] = pair;
  if (!p1 || !p2) return null;
  const s1 = skillOf.get(p1);
  const s2 = skillOf.get(p2);
  return s1 === undefined || s2 === undefined ? null : [s1, s2];
}

export type HandicapPreview =
  /** Group stage (spec §4.2): start points per set, null until both pairs are picked. */
  | { kind: 'group'; slots: (Handicap | null)[] }
  /** Relay (spec §4.3): start points for leg 1 and the signed net, null until every leg is picked. */
  | { kind: 'relay'; start: Handicap | null; net: number | null };

/** Handicaps for the picks so far, in slot order, for the live preview and the lock snapshot. */
export function handicapPreview(
  stage: string,
  slots: readonly LineupSlotPicks[],
  skillOf: ReadonlyMap<string, number>,
  settings: Pick<SeasonSettings, 'group_handicap_cap' | 'ko_handicap_cap'>,
): HandicapPreview {
  const ordered = [...slots].sort((a, b) => a.slotNo - b.slotNo);
  const pairs = ordered.map((slot) => ({ home: pairSkills(slot.home, skillOf), away: pairSkills(slot.away, skillOf) }));

  if (stage === 'group') {
    return {
      kind: 'group',
      slots: pairs.map(({ home, away }) =>
        home && away ? slotHandicap(home, away, settings.group_handicap_cap) : null,
      ),
    };
  }

  const legs = pairs.flatMap(({ home, away }) => (home && away ? [{ home, away }] : []));
  if (legs.length === 0 || legs.length !== pairs.length) return { kind: 'relay', start: null, net: null };
  const net = legs.reduce((sum, leg) => sum + leg.home[0] + leg.home[1] - leg.away[0] - leg.away[1], 0);
  return { kind: 'relay', start: relayHandicap(legs, settings.ko_handicap_cap), net };
}

/** What `lock_match_lineups` stores: each slot's players with its start points, and the relay start. */
export type LockSnapshot = {
  slots: {
    slot_no: number;
    home_p1: string | null;
    home_p2: string | null;
    away_p1: string | null;
    away_p2: string | null;
    handicap_home: number;
    handicap_away: number;
  }[];
  /** Relay only: the start of leg 1. Undefined for a group match. */
  relay?: Handicap;
};

/**
 * The handicap snapshot taken at the lock (spec §4.2, §4.3): group start points per set, or the relay
 * start for leg 1 with 0–0 per leg. Null while a pair is incomplete or has an unknown player.
 */
export function lockSnapshot(
  stage: string,
  slots: readonly LineupSlotPicks[],
  skillOf: ReadonlyMap<string, number>,
  settings: Pick<SeasonSettings, 'group_handicap_cap' | 'ko_handicap_cap'>,
): LockSnapshot | null {
  const preview = handicapPreview(stage, slots, skillOf, settings);
  const ordered = [...slots].sort((a, b) => a.slotNo - b.slotNo);
  if (preview.kind === 'relay' ? !preview.start : preview.slots.some((h) => h === null)) return null;

  return {
    slots: ordered.map((slot, i) => {
      const start = preview.kind === 'group' ? preview.slots[i] : null;
      return {
        slot_no: slot.slotNo,
        home_p1: slot.home[0],
        home_p2: slot.home[1],
        away_p1: slot.away[0],
        away_p2: slot.away[1],
        handicap_home: start?.home ?? 0,
        handicap_away: start?.away ?? 0,
      };
    }),
    relay: preview.kind === 'relay' && preview.start ? preview.start : undefined,
  };
}
