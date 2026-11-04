// Team board drafts (spec §6 A3): moves and captain choices stay on the page until the BTC saves them
// all at once with save_team_board.

import { isUuid } from './auth/users';
import { sortRoster, type RosterPlayer } from './teams';

export type BoardPlayer = RosterPlayer & { teamId: string | null };

export type BoardTeam = {
  id: string;
  name: string;
  color: string;
  captainId: string | null;
  /** True when the BTC picked the captain; false when it is the default one (the team's Rank 1). */
  captainChosen: boolean;
};

/**
 * Unsaved changes over the saved board: the new team of each moved player (null for no team), and
 * the chosen captain of each team. Kept apart from the saved board, so a refresh rebases them.
 */
export type BoardDraft = { moves: Record<string, string | null>; captains: Record<string, string> };

export const EMPTY_DRAFT: BoardDraft = { moves: {}, captains: {} };

/** Most changes one save may send: more than any season has players and teams. */
export const MAX_BOARD_CHANGES = 1000;

/** What `saveTeamBoard` takes. */
export type BoardChanges = {
  moves: { seasonPlayerId: string; teamId: string | null }[];
  captains: { teamId: string; seasonPlayerId: string }[];
};

/** The captain the database picks when none is chosen: the strongest active member. */
function defaultCaptain(roster: BoardPlayer[]): string | null {
  return sortRoster(roster.filter((p) => p.status === 'active'))[0]?.id ?? null;
}

/**
 * The board as it will be once the draft is saved. A chosen captain stays while they are an active
 * member of the team; otherwise the captain falls back to the default, as the database does.
 */
export function applyDraft(
  teams: BoardTeam[],
  players: BoardPlayer[],
  draft: BoardDraft,
): { teams: BoardTeam[]; players: BoardPlayer[] } {
  const shown = players.map((p) => (p.id in draft.moves ? { ...p, teamId: draft.moves[p.id] } : p));
  const touched = new Set<string | null>();
  for (const p of players) {
    if (p.id in draft.moves) touched.add(p.teamId).add(draft.moves[p.id]);
  }

  return {
    players: shown,
    teams: teams.map((team) => {
      const roster = shown.filter((p) => p.teamId === team.id);
      const chosen = draft.captains[team.id] ?? (team.captainChosen ? team.captainId : null);
      if (chosen && roster.some((p) => p.id === chosen && p.status === 'active')) {
        return { ...team, captainId: chosen, captainChosen: true };
      }
      // A roster the draft leaves alone keeps the captain the database already picked.
      if (!touched.has(team.id) && !team.captainChosen) return team;
      return { ...team, captainId: defaultCaptain(roster), captainChosen: false };
    }),
  };
}

/**
 * Drops what would not change the saved board: moves of unknown players, to unknown teams or to the
 * team they are already on, and captains of unknown teams, who are not active members after the
 * moves, or who would be captain anyway.
 */
export function normalizeDraft(teams: BoardTeam[], players: BoardPlayer[], draft: BoardDraft): BoardDraft {
  const teamIds = new Set(teams.map((team) => team.id));
  const saved = new Map(players.map((p) => [p.id, p]));
  const moves: BoardDraft['moves'] = {};
  for (const [playerId, teamId] of Object.entries(draft.moves)) {
    const player = saved.get(playerId);
    if (player && (teamId === null || teamIds.has(teamId)) && player.teamId !== teamId) moves[playerId] = teamId;
  }

  const moved = applyDraft(teams, players, { moves, captains: {} });
  const captains: BoardDraft['captains'] = {};
  for (const [teamId, playerId] of Object.entries(draft.captains)) {
    const team = moved.teams.find((t) => t.id === teamId);
    const player = moved.players.find((p) => p.id === playerId);
    if (team && team.captainId !== playerId && player?.teamId === teamId && player.status === 'active') {
      captains[teamId] = playerId;
    }
  }
  return { moves, captains };
}

/** Moves a player in the draft. A captain chosen in the draft is dropped when they leave the team. */
export function moveInDraft(draft: BoardDraft, playerId: string, teamId: string | null): BoardDraft {
  const captains = Object.fromEntries(Object.entries(draft.captains).filter(([, id]) => id !== playerId));
  return { moves: { ...draft.moves, [playerId]: teamId }, captains };
}

export function chooseCaptainInDraft(draft: BoardDraft, teamId: string, playerId: string): BoardDraft {
  return { ...draft, captains: { ...draft.captains, [teamId]: playerId } };
}

/** Number of changes a normalized draft holds, as the save bar shows it. */
export function draftSize(draft: BoardDraft): number {
  return Object.keys(draft.moves).length + Object.keys(draft.captains).length;
}

export function draftChanges(draft: BoardDraft): BoardChanges {
  return {
    moves: Object.entries(draft.moves).map(([seasonPlayerId, teamId]) => ({ seasonPlayerId, teamId })),
    captains: Object.entries(draft.captains).map(([teamId, seasonPlayerId]) => ({ teamId, seasonPlayerId })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks what a client sent to `saveTeamBoard`: ids are UUIDs, nobody is listed twice, and the size
 * is bounded. Whether they belong to the season is up to save_team_board. Null when invalid.
 */
export function parseBoardChanges(input: unknown): BoardChanges | null {
  if (!isRecord(input) || !Array.isArray(input.moves) || !Array.isArray(input.captains)) return null;
  if (input.moves.length + input.captains.length > MAX_BOARD_CHANGES) return null;

  const moves: BoardChanges['moves'] = [];
  for (const move of input.moves as unknown[]) {
    if (!isRecord(move)) return null;
    const { seasonPlayerId, teamId } = move;
    if (typeof seasonPlayerId !== 'string' || !isUuid(seasonPlayerId)) return null;
    if (teamId !== null && (typeof teamId !== 'string' || !isUuid(teamId))) return null;
    moves.push({ seasonPlayerId, teamId });
  }
  const captains: BoardChanges['captains'] = [];
  for (const captain of input.captains as unknown[]) {
    if (!isRecord(captain)) return null;
    const { teamId, seasonPlayerId } = captain;
    if (typeof teamId !== 'string' || !isUuid(teamId)) return null;
    if (typeof seasonPlayerId !== 'string' || !isUuid(seasonPlayerId)) return null;
    captains.push({ teamId, seasonPlayerId });
  }

  if (new Set(moves.map((m) => m.seasonPlayerId)).size !== moves.length) return null;
  if (new Set(captains.map((c) => c.teamId)).size !== captains.length) return null;
  return { moves, captains };
}
