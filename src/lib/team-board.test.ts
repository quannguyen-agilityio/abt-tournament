import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  MAX_BOARD_CHANGES,
  applyDraft,
  chooseCaptainInDraft,
  draftChanges,
  draftSize,
  moveInDraft,
  normalizeDraft,
  parseBoardChanges,
  type BoardPlayer,
  type BoardTeam,
} from './team-board';

const T1 = '00000000-0000-4000-8000-000000000011';
const T2 = '00000000-0000-4000-8000-000000000012';
const A = '00000000-0000-4000-8000-000000000051';
const B = '00000000-0000-4000-8000-000000000052';
const C = '00000000-0000-4000-8000-000000000053';
const D = '00000000-0000-4000-8000-000000000054';

function player(id: string, rank: number, teamId: string | null, status: BoardPlayer['status'] = 'active') {
  return { id, fullName: `Tester ${id.slice(-2)}`, rank, skillPoints: 10, status, teamId };
}

// A (R1) captains Đội Một by default, B (R2) is with them; C (R1) captains Đội Hai; D (R3) has no team.
const teams: BoardTeam[] = [
  { id: T1, name: 'Đội Một', color: '#112233', captainId: A, captainChosen: false },
  { id: T2, name: 'Đội Hai', color: '#445566', captainId: C, captainChosen: false },
];
const players: BoardPlayer[] = [player(A, 1, T1), player(B, 2, T1), player(C, 1, T2), player(D, 3, null)];

const captainOf = (board: { teams: BoardTeam[] }, teamId: string) => board.teams.find((t) => t.id === teamId);
const teamOf = (board: { players: BoardPlayer[] }, playerId: string) =>
  board.players.find((p) => p.id === playerId)?.teamId;

describe('applyDraft', () => {
  it('returns the saved board for an empty draft', () => {
    expect(applyDraft(teams, players, EMPTY_DRAFT)).toEqual({ teams, players });
  });

  it('shows moves at once', () => {
    const board = applyDraft(teams, players, moveInDraft(EMPTY_DRAFT, D, T2));
    expect(teamOf(board, D)).toBe(T2);
  });

  it('hands the default captain to the next strongest when they move out', () => {
    const board = applyDraft(teams, players, moveInDraft(EMPTY_DRAFT, A, T2));
    expect(captainOf(board, T1)).toMatchObject({ captainId: B, captainChosen: false });
    // C and A are both R1 with the same points: the name decides, as in the database.
    expect(captainOf(board, T2)).toMatchObject({ captainId: A, captainChosen: false });
  });

  it('keeps a chosen captain while they stay, and clears them once they leave', () => {
    const chosen = chooseCaptainInDraft(EMPTY_DRAFT, T1, B);
    expect(captainOf(applyDraft(teams, players, chosen), T1)).toMatchObject({ captainId: B, captainChosen: true });

    const moved = moveInDraft(chosen, B, null);
    expect(moved.captains).toEqual({});
    expect(captainOf(applyDraft(teams, players, moved), T1)).toMatchObject({ captainId: A, captainChosen: false });
  });

  it('clears a saved chosen captain who is moved off the team', () => {
    const saved = teams.map((t) => (t.id === T1 ? { ...t, captainId: B, captainChosen: true } : t));
    const board = applyDraft(saved, players, moveInDraft(EMPTY_DRAFT, B, T2));
    expect(captainOf(board, T1)).toMatchObject({ captainId: A, captainChosen: false });
  });

  it('never makes a withdrawn player captain', () => {
    const withdrawn = players.map((p) => (p.id === A ? { ...p, status: 'withdrawn' as const } : p));
    const board = applyDraft(teams, withdrawn, chooseCaptainInDraft(moveInDraft(EMPTY_DRAFT, D, T1), T1, A));
    expect(captainOf(board, T1)).toMatchObject({ captainId: B, captainChosen: false });
  });
});

describe('normalizeDraft', () => {
  it('drops moves back to the saved team, so undoing a move leaves no change', () => {
    const draft = moveInDraft(moveInDraft(EMPTY_DRAFT, A, T2), A, T1);
    expect(normalizeDraft(teams, players, draft)).toEqual(EMPTY_DRAFT);
  });

  it('drops unknown players and teams, e.g. after a team is deleted', () => {
    const draft = { moves: { [D]: '00000000-0000-4000-8000-0000000000ff', [C]: T1 }, captains: {} };
    expect(normalizeDraft(teams, players, draft)).toEqual({ moves: { [C]: T1 }, captains: {} });
  });

  it('drops a captain who would be captain anyway or is not on the team', () => {
    expect(normalizeDraft(teams, players, chooseCaptainInDraft(EMPTY_DRAFT, T1, A))).toEqual(EMPTY_DRAFT);
    expect(normalizeDraft(teams, players, chooseCaptainInDraft(EMPTY_DRAFT, T1, C))).toEqual(EMPTY_DRAFT);
  });

  it('keeps a captain who joins the team in the same draft', () => {
    const draft = chooseCaptainInDraft(moveInDraft(EMPTY_DRAFT, D, T1), T1, D);
    expect(normalizeDraft(teams, players, draft)).toEqual(draft);
    expect(draftSize(draft)).toBe(2);
  });

  it('rebases a draft on a refreshed board', () => {
    const draft = moveInDraft(EMPTY_DRAFT, D, T2);
    const refreshed = players.map((p) => (p.id === D ? { ...p, teamId: T2 } : p));
    expect(normalizeDraft(teams, refreshed, draft)).toEqual(EMPTY_DRAFT);
  });
});

describe('draftChanges', () => {
  it('lists the moves and captains to send', () => {
    const draft = chooseCaptainInDraft(moveInDraft(EMPTY_DRAFT, A, null), T1, B);
    expect(draftChanges(draft)).toEqual({
      moves: [{ seasonPlayerId: A, teamId: null }],
      captains: [{ teamId: T1, seasonPlayerId: B }],
    });
  });
});

describe('parseBoardChanges', () => {
  const valid = {
    moves: [
      { seasonPlayerId: A, teamId: T2 },
      { seasonPlayerId: B, teamId: null },
    ],
    captains: [],
  };

  it('accepts what draftChanges produces', () => {
    expect(parseBoardChanges(valid)).toEqual(valid);
    expect(parseBoardChanges({ moves: [], captains: [{ teamId: T1, seasonPlayerId: B }] })).not.toBeNull();
  });

  it('rejects wrong shapes and ids', () => {
    expect(parseBoardChanges(null)).toBeNull();
    expect(parseBoardChanges({ moves: [] })).toBeNull();
    expect(parseBoardChanges({ moves: [{ seasonPlayerId: 'x', teamId: T1 }], captains: [] })).toBeNull();
    expect(parseBoardChanges({ moves: [{ seasonPlayerId: A, teamId: '' }], captains: [] })).toBeNull();
    expect(parseBoardChanges({ moves: [{ seasonPlayerId: A }], captains: [] })).toBeNull();
    expect(parseBoardChanges({ moves: [], captains: [{ teamId: T1, seasonPlayerId: null }] })).toBeNull();
  });

  it('rejects a player or team listed twice', () => {
    expect(parseBoardChanges({ ...valid, moves: [...valid.moves, { seasonPlayerId: A, teamId: T1 }] })).toBeNull();
    expect(
      parseBoardChanges({
        moves: [],
        captains: [
          { teamId: T1, seasonPlayerId: A },
          { teamId: T1, seasonPlayerId: B },
        ],
      }),
    ).toBeNull();
  });

  it('rejects more than the maximum number of changes', () => {
    const moves = Array.from({ length: MAX_BOARD_CHANGES + 1 }, () => ({ seasonPlayerId: A, teamId: T1 }));
    expect(parseBoardChanges({ moves, captains: [] })).toBeNull();
  });
});
