import {
  effectivePair,
  playerStats,
  type PlayerStats,
  type Side,
  type SlotType,
  type StatsMatch,
  type StatsSlot,
} from '../domain';
import { sortPlayers, type PublicPlayer } from './public-teams';

/** P7 list filters, kept in the URL. `null` means "all". */
export interface PlayerFilters {
  team: string | null;
  rank: number | null;
  gender: PublicPlayer['gender'] | null;
}

export interface ProfileSlot extends StatsSlot {
  slot_type: SlotType;
}

/** A group match as the profile reads it: the stats input plus its code and slot types. */
export interface ProfileMatch extends StatsMatch {
  code: string;
  slots: readonly ProfileSlot[];
}

/** One set the player played, from their side. */
export interface PlayedSet {
  matchCode: string;
  slotNo: number;
  slotType: SlotType;
  partnerIds: string[];
  opponentIds: string[];
  pointsFor: number;
  pointsAgainst: number;
  won: boolean;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** Reads the filters from the query string. Unknown or malformed values fall back to "all". */
export function parsePlayerFilters(
  query: Record<string, string | string[] | undefined>,
  known: { teamIds: readonly string[]; maxRank: number },
): PlayerFilters {
  const team = first(query.team);
  const rank = first(query.rank);
  const gender = first(query.gender);
  const rankNo = /^\d+$/.test(rank) ? Number(rank) : NaN;
  return {
    team: known.teamIds.includes(team) ? team : null,
    rank: rankNo >= 1 && rankNo <= known.maxRank ? rankNo : null,
    gender: gender === 'male' || gender === 'female' ? gender : null,
  };
}

/** The query string for `filters`, without the "all" ones. */
export function playerFiltersToQuery(filters: PlayerFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

/** The players matching `filters`, strongest first. */
export function filterPlayers(players: readonly PublicPlayer[], filters: PlayerFilters): PublicPlayer[] {
  return sortPlayers(
    players.filter(
      (p) =>
        (!filters.team || p.teamId === filters.team) &&
        (filters.rank === null || p.rank === filters.rank) &&
        (!filters.gender || p.gender === filters.gender),
    ),
  );
}

const NO_STATS: Omit<PlayerStats, 'playerId'> = {
  setsPlayed: 0,
  setsWon: 0,
  setsLost: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  partner: null,
};

const players = (slot: ProfileSlot, side: Side) => [
  ...new Set(effectivePair(slot, side).filter((id): id is string => id !== null)),
];

/**
 * The player profile (spec §5 P7): season stats from `playerStats`, and every set the player
 * played. The list counts the same sets as the stats: completed group matches, effective players
 * (substitutions applied), scored and not level. Ordered by match code, then set.
 */
export function buildPlayerProfile(
  playerId: string,
  matches: readonly ProfileMatch[],
): { stats: PlayerStats; sets: PlayedSet[] } {
  const stats = playerStats(matches).get(playerId) ?? { playerId, ...NO_STATS };
  const sets: PlayedSet[] = [];
  for (const match of [...matches].sort((a, b) => a.code.localeCompare(b.code))) {
    if (match.stage !== 'group' || match.status !== 'completed') continue;
    for (const slot of [...match.slots].sort((a, b) => a.slot_no - b.slot_no)) {
      const { score_home: home, score_away: away } = slot;
      if (home === null || away === null || home === away) continue;
      const side: Side | null = players(slot, 'home').includes(playerId)
        ? 'home'
        : players(slot, 'away').includes(playerId)
          ? 'away'
          : null;
      if (!side) continue;
      const opponent: Side = side === 'home' ? 'away' : 'home';
      const score: Record<Side, number> = { home, away };
      sets.push({
        matchCode: match.code,
        slotNo: slot.slot_no,
        slotType: slot.slot_type,
        partnerIds: players(slot, side).filter((id) => id !== playerId),
        opponentIds: players(slot, opponent),
        pointsFor: score[side],
        pointsAgainst: score[opponent],
        won: score[side] > score[opponent],
      });
    }
  }
  return { stats, sets };
}
