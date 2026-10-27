// Lineup validation (spec §4.1): one team's 5 slots checked against the season rules.
import type { SeasonSettings, SlotType } from './settings';

export type Side = 'home' | 'away';

export type LineupRuleCode =
  | 'SLOT_INCOMPLETE'
  | 'NOT_PRESENT'
  | 'MIN_SETS'
  | 'MAX_SETS'
  | 'CONSECUTIVE'
  | 'LOW_RANK_SLOT'
  | 'HIGH_RANK_SLOT'
  | 'COMPENSATION'
  | 'MIN_PRESENT'
  | 'SUB_RANK';

export interface LineupMatch {
  /** 2026 data: lineup checks are skipped (spec §3.1). */
  imported: boolean;
}

export interface PresentPlayer {
  id: string;
  rank: number;
}

/** `match_attendance` for both teams: the players present, with their season rank. */
export type LineupAttendance = Record<Side, readonly PresentPlayer[]>;

export interface SlotSubstitution {
  side: Side;
  replaced_id: string;
  substitute_id: string;
}

export interface LineupSlot {
  slot_no: number;
  slot_type: SlotType;
  home_p1: string | null;
  home_p2: string | null;
  away_p1: string | null;
  away_p2: string | null;
  /** Applied in order. */
  substitutions?: readonly SlotSubstitution[];
}

export interface LineupViolation {
  code: LineupRuleCode;
  slotNo?: number;
  playerId?: string;
  /** next-intl key, e.g. `Lineup.violations.MAX_SETS`. */
  message_key: string;
  /** ICU values for the message. */
  params?: Record<string, number>;
}

export type LineupSettings = Pick<
  SeasonSettings,
  | 'low_rank_range'
  | 'high_rank_range'
  | 'max_rank'
  | 'min_sets_per_player'
  | 'max_sets_per_player'
  | 'min_players_present'
>;

/** A lone `max_rank` player on the short-handed team must play at least this many slots (A3). */
const COMPENSATION_MIN_SLOTS = 2;

/** A substitute may be at most this many ranks away from the player they replace. */
const SUB_RANK_TOLERANCE = 1;

const MESSAGE_NAMESPACE = 'Lineup.violations';

function violation(code: LineupRuleCode, details: Omit<LineupViolation, 'code' | 'message_key'> = {}): LineupViolation {
  return { code, ...details, message_key: `${MESSAGE_NAMESPACE}.${code}` };
}

/** The slot's players for one side, as registered with any substitutions applied. */
export function effectivePair(
  slot: Pick<LineupSlot, 'home_p1' | 'home_p2' | 'away_p1' | 'away_p2' | 'substitutions'>,
  side: Side,
): [string | null, string | null] {
  const pair: [string | null, string | null] = [slot[`${side}_p1`], slot[`${side}_p2`]];
  for (const sub of slot.substitutions ?? []) {
    if (sub.side !== side) continue;
    const i = pair.indexOf(sub.replaced_id);
    if (i !== -1) pair[i] = sub.substitute_id;
  }
  return pair;
}

/**
 * Checks one team's lineup on the effective players. Returns every violation, or an empty list
 * when the lineup is valid. A team below `min_players_present` gets only `MIN_PRESENT`: the match
 * is blocked, and the slot rules cannot be met anyway.
 */
export function validateLineup(
  match: LineupMatch,
  side: Side,
  attendance: LineupAttendance,
  slots: readonly LineupSlot[],
  settings: LineupSettings,
): LineupViolation[] {
  if (match.imported) return [];

  const present = attendance[side];
  const opponentPresent = attendance[side === 'home' ? 'away' : 'home'];
  if (present.length < settings.min_players_present) {
    return [violation('MIN_PRESENT', { params: { minimum: settings.min_players_present } })];
  }

  const rankOf = new Map(present.map((p) => [p.id, p.rank]));
  const ordered = [...slots].sort((a, b) => a.slot_no - b.slot_no);
  const violations: LineupViolation[] = [];
  const slotsPlayed = new Map<string, number>();
  let previous: { slotNo: number; players: Set<string> } | undefined;

  for (const slot of ordered) {
    const slotNo = slot.slot_no;
    const pair = effectivePair(slot, side);
    const players = [...new Set(pair.filter((id): id is string => id !== null))];

    if (players.length < 2) violations.push(violation('SLOT_INCOMPLETE', { slotNo }));

    const range =
      slot.slot_type === 'low' ? settings.low_rank_range : slot.slot_type === 'high' ? settings.high_rank_range : null;
    const rangeCode = slot.slot_type === 'low' ? 'LOW_RANK_SLOT' : 'HIGH_RANK_SLOT';

    for (const playerId of players) {
      slotsPlayed.set(playerId, (slotsPlayed.get(playerId) ?? 0) + 1);
      const rank = rankOf.get(playerId);
      if (rank === undefined) {
        violations.push(violation('NOT_PRESENT', { slotNo, playerId }));
      } else if (range && (rank < range.min || rank > range.max)) {
        violations.push(violation(rangeCode, { slotNo, playerId, params: { min: range.min, max: range.max } }));
      }
      if (previous?.slotNo === slotNo - 1 && previous.players.has(playerId)) {
        violations.push(violation('CONSECUTIVE', { slotNo, playerId }));
      }
    }

    for (const sub of slot.substitutions ?? []) {
      if (sub.side !== side) continue;
      const replacedRank = rankOf.get(sub.replaced_id);
      const substituteRank = rankOf.get(sub.substitute_id);
      // Without both ranks there is nothing to compare; an absent substitute is already NOT_PRESENT.
      if (replacedRank === undefined || substituteRank === undefined) continue;
      if (Math.abs(replacedRank - substituteRank) > SUB_RANK_TOLERANCE) {
        violations.push(
          violation('SUB_RANK', { slotNo, playerId: sub.substitute_id, params: { tolerance: SUB_RANK_TOLERANCE } }),
        );
      }
    }

    previous = { slotNo, players: new Set(players) };
  }

  for (const p of present) {
    if ((slotsPlayed.get(p.id) ?? 0) < settings.min_sets_per_player) {
      violations.push(violation('MIN_SETS', { playerId: p.id, params: { minimum: settings.min_sets_per_player } }));
    }
  }
  for (const [playerId, count] of slotsPlayed) {
    if (count > settings.max_sets_per_player) {
      violations.push(violation('MAX_SETS', { playerId, params: { maximum: settings.max_sets_per_player } }));
    }
  }

  // Roster compensation (A3): the short-handed team's only max_rank player plays more.
  const lowest = present.filter((p) => p.rank === settings.max_rank);
  if (present.length < opponentPresent.length && lowest.length === 1) {
    const [player] = lowest;
    if ((slotsPlayed.get(player.id) ?? 0) < COMPENSATION_MIN_SLOTS) {
      violations.push(
        violation('COMPENSATION', {
          playerId: player.id,
          params: { minimum: COMPENSATION_MIN_SLOTS, rank: settings.max_rank },
        }),
      );
    }
  }

  return violations;
}
