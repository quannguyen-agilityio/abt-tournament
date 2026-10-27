// Player statistics (spec §5 P7): season aggregates over the group stage. Team totals (P6) come
// from `teamStats` in ./standings, so they always match the table.
import { effectivePair, type LineupSlot, type Side } from './lineup';
import type { SlotScore } from './score';
import type { StandingsMatch } from './standings';

/** A `match_slot` with its registered players, substitutions and recorded score. */
export type StatsSlot = SlotScore & Pick<LineupSlot, 'home_p1' | 'home_p2' | 'away_p1' | 'away_p2' | 'substitutions'>;

/** The `match` columns the standings read, with the slot players. */
export interface StatsMatch extends StandingsMatch {
  slots: readonly StatsSlot[];
}

export interface PlayerStats {
  playerId: string;
  setsPlayed: number;
  setsWon: number;
  setsLost: number;
  /** Scoreboard points, start points included (D14). */
  pointsFor: number;
  pointsAgainst: number;
  /** The partner of the most sets; `null` before the first set. */
  partner: { id: string; sets: number } | null;
}

interface PlayerTally extends Omit<PlayerStats, 'partner'> {
  /** Sets with each partner, in the order first played with. */
  partners: Map<string, { sets: number; won: number }>;
}

const SIDES: readonly Side[] = ['home', 'away'];

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

/**
 * Per player: sets played, set wins and losses, points for and against, and the most frequent
 * partner. Only `completed` group matches count: annulled matches never do (A4), and a forfeit has
 * no sets played (lineups are ignored). A set counts for its **effective** players, with
 * substitutions applied, so a replaced player gets no credit for it. Scores are read as stored,
 * the higher one winning the set, so imported 2026 matches count as recorded. A partner tie goes
 * to the pair with more set wins, then to the one played with first.
 */
export function playerStats(matches: readonly StatsMatch[]): Map<string, PlayerStats> {
  const tallies = new Map<string, PlayerTally>();
  const tallyOf = (playerId: string) => {
    let tally = tallies.get(playerId);
    if (!tally) {
      tally = { playerId, setsPlayed: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0, partners: new Map() };
      tallies.set(playerId, tally);
    }
    return tally;
  };

  for (const match of matches) {
    if (match.stage !== 'group' || match.status !== 'completed') continue;
    for (const slot of [...match.slots].sort((a, b) => a.slot_no - b.slot_no)) {
      const { score_home: home, score_away: away } = slot;
      if (home === null || away === null || home === away) continue;
      const score: Record<Side, number> = { home, away };
      const winner: Side = home > away ? 'home' : 'away';

      for (const side of SIDES) {
        const pair = [...new Set(effectivePair(slot, side).filter((id): id is string => id !== null))];
        const won = side === winner;
        for (const playerId of pair) {
          const tally = tallyOf(playerId);
          tally.setsPlayed += 1;
          tally[won ? 'setsWon' : 'setsLost'] += 1;
          tally.pointsFor += score[side];
          tally.pointsAgainst += score[other(side)];
          for (const partnerId of pair) {
            if (partnerId === playerId) continue;
            const together = tally.partners.get(partnerId) ?? { sets: 0, won: 0 };
            together.sets += 1;
            if (won) together.won += 1;
            tally.partners.set(partnerId, together);
          }
        }
      }
    }
  }

  const stats = new Map<string, PlayerStats>();
  for (const { partners, ...tally } of tallies.values()) {
    let best: { id: string; sets: number; won: number } | null = null;
    for (const [id, together] of partners) {
      if (!best || together.sets > best.sets || (together.sets === best.sets && together.won > best.won)) {
        best = { id, ...together };
      }
    }
    stats.set(tally.playerId, { ...tally, partner: best && { id: best.id, sets: best.sets } });
  }
  return stats;
}
