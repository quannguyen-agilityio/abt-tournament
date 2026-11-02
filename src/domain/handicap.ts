// Handicaps (spec §4.2, §4.3): the lower skill-point side starts with extra points (D12, D13).

/** Start points for each side. At most one side is non-zero. */
export interface Handicap {
  home: number;
  away: number;
}

/** Skill points of a pair's two effective players (substitutions applied). */
export type PairSkills = readonly [number, number];

/** Both pairs of one relay leg. */
export interface LegPairs {
  home: PairSkills;
  away: PairSkills;
}

const pairStrength = ([p1, p2]: PairSkills) => p1 + p2;

/**
 * Gives `min(|diff|, cap)` to the side that is weaker by `diff` (positive: home is stronger, so
 * away starts with it). A tie gives 0–0.
 */
function startPoints(diff: number, cap: number): Handicap {
  const h = Math.min(Math.abs(diff), cap);
  if (diff > 0) return { home: 0, away: h };
  if (diff < 0) return { home: h, away: 0 };
  return { home: 0, away: 0 };
}

/**
 * Group-stage set (spec §4.2): the pair with fewer skill points starts with the difference,
 * capped at `group_handicap_cap`. 63 v 54 gives the 54 pair 9.
 */
export function slotHandicap(homePair: PairSkills, awayPair: PairSkills, cap: number): Handicap {
  return startPoints(pairStrength(homePair) - pairStrength(awayPair), cap);
}

/**
 * Relay (spec §4.3, A1): the signed differences of every leg are summed and capped once at
 * `ko_handicap_cap`; the weaker team starts leg 1 with it. Legs leaning opposite ways cancel
 * out, and a single leg is never clamped on its own.
 */
export function relayHandicap(slots: readonly LegPairs[], cap: number): Handicap {
  const net = slots.reduce((sum, leg) => sum + pairStrength(leg.home) - pairStrength(leg.away), 0);
  return startPoints(net, cap);
}
