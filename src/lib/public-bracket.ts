import { knockoutForfeit, type MatchStatus, type SeasonSettings, type SlotScore } from '../domain';

export type BracketCode = 'SF1' | 'SF2' | '3RD' | 'F';
export type BracketSource = { kind: 'seed'; seed: number } | { kind: 'winner' | 'loser'; of: 'SF1' | 'SF2' };

export interface BracketSide {
  teamId: string | null;
  /** 1-based group rank, known once the group is closed. */
  seed: number | null;
  /** Where the side comes from, for the TBD label. */
  source: BracketSource;
  /** Relay scoreboard: cumulative at the last scored leg. */
  score: number | null;
  won: boolean;
}

export interface BracketSlotView {
  code: BracketCode;
  status: MatchStatus | null;
  scheduledAt: string | null;
  court: string | null;
  home: BracketSide;
  away: BracketSide;
  forfeitReason: string | null;
  /** The match row exists, so the card can link to its page. */
  exists: boolean;
}

/** The knock-out `match` columns and `match_slot` scores the bracket reads. */
export interface KnockoutMatchInput {
  code: string;
  status: MatchStatus;
  home_team_id: string | null;
  away_team_id: string | null;
  forfeit_team_id: string | null;
  forfeit_reason: string | null;
  scheduled_at: string | null;
  court: string | null;
  winner_team_id: string | null;
  slots: readonly SlotScore[];
}

const SOURCES: Record<BracketCode, [BracketSource, BracketSource]> = {
  SF1: [
    { kind: 'seed', seed: 1 },
    { kind: 'seed', seed: 4 },
  ],
  SF2: [
    { kind: 'seed', seed: 2 },
    { kind: 'seed', seed: 3 },
  ],
  '3RD': [
    { kind: 'loser', of: 'SF1' },
    { kind: 'loser', of: 'SF2' },
  ],
  F: [
    { kind: 'winner', of: 'SF1' },
    { kind: 'winner', of: 'SF2' },
  ],
};

const CODES: readonly BracketCode[] = ['SF1', 'SF2', '3RD', 'F'];

/** The last leg with both scores is the running (or final) relay scoreboard. */
function lastScore(slots: readonly SlotScore[]): { home: number; away: number } | null {
  const scored = slots
    .filter((s) => s.score_home !== null && s.score_away !== null)
    .sort((a, b) => b.slot_no - a.slot_no)[0];
  return scored ? { home: scored.score_home!, away: scored.score_away! } : null;
}

/**
 * The knock-out bracket (spec §4.8, §5 P5): always the four fixed matches. Until the group is
 * closed no team is known, whatever the rows hold; after, seeds come from the final order.
 */
export function buildBracketView(input: {
  matches: readonly KnockoutMatchInput[];
  finalOrder: readonly string[] | null;
  settings: Pick<SeasonSettings, 'relay_milestones'>;
}): { closed: boolean; slots: BracketSlotView[] } {
  const { matches, finalOrder, settings } = input;
  const closed = finalOrder !== null;
  const seedOf = (teamId: string | null) => {
    const at = teamId && finalOrder ? finalOrder.indexOf(teamId) : -1;
    return at >= 0 ? at + 1 : null;
  };

  const slots = CODES.map((code): BracketSlotView => {
    const row = matches.find((m) => m.code === code);
    const [homeSource, awaySource] = SOURCES[code];
    const known = closed && row !== undefined;
    const homeId = known ? row.home_team_id : null;
    const awayId = known ? row.away_team_id : null;

    let score: { home: number | null; away: number | null } = { home: null, away: null };
    let winnerId: string | null = null;
    if (known) {
      if (row.status === 'forfeit' && row.forfeit_team_id !== null) {
        const forfeitSide = row.forfeit_team_id === row.home_team_id ? 'home' : 'away';
        const result = knockoutForfeit(forfeitSide, settings);
        score = result.score;
        winnerId = result.winner === 'home' ? row.home_team_id : row.away_team_id;
      } else {
        score = lastScore(row.slots) ?? score;
        winnerId = row.winner_team_id;
      }
    }

    const side = (teamId: string | null, source: BracketSource, value: number | null): BracketSide => ({
      teamId,
      seed: seedOf(teamId),
      source,
      score: value,
      won: teamId !== null && teamId === winnerId,
    });
    return {
      code,
      status: row?.status ?? null,
      scheduledAt: row?.scheduled_at ?? null,
      court: row?.court ?? null,
      home: side(homeId, homeSource, score.home),
      away: side(awayId, awaySource, score.away),
      forfeitReason: row?.status === 'forfeit' ? row.forfeit_reason : null,
      exists: row !== undefined,
    };
  });
  return { closed, slots };
}
