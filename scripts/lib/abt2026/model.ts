// The import model: everything parsed from the workbook, before it touches the database.
import type { SlotType } from '../../../src/domain/settings';

export type Gender = 'male' | 'female';
export type MatchStage = 'group' | 'semi_final' | 'third_place' | 'final';

export interface ImportTeam {
  number: number;
  name: string;
  color: string;
}

export interface ImportPlayer {
  name: string;
  slug: string;
  gender: Gender;
  rank: number;
  skill: number;
  /** VND. */
  fee: number;
  teamNumber: number;
}

export interface ImportCourt {
  name: string;
  sort_order: number;
}

export interface ImportSlot {
  slot_no: number;
  slot_type: SlotType;
  /** Player slugs. */
  home: [string, string];
  away: [string, string];
  handicap_home: number;
  handicap_away: number;
  score_home: number;
  score_away: number;
}

export interface ImportMatch {
  /** `V01`..`V21`, `SF1`, `SF2`, `3RD`, `F`. */
  code: string;
  stage: MatchStage;
  round: number | null;
  /** Team numbers. */
  homeTeam: number;
  awayTeam: number;
  court: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `YYYY-MM-DDTHH:MM:00+07:00`. */
  scheduledAt: string;
  /** Raw referee label from the sheet; mapped to a profile at sync time. */
  refereeName: string | null;
  slots: ImportSlot[];
  winner: 'home' | 'away';
}

export type ImportWinner =
  | { kind: 'team'; teamNumber: number }
  | { kind: 'pair'; players: [string, string]; matchCode: string | null; note: string | null }
  | { kind: 'player'; player: string; note: string | null };

export interface ImportAward {
  sortOrder: number;
  nameVi: string;
  criteriaVi: string;
  sponsor: string | null;
  valueVnd: number | null;
  note: string | null;
  winners: ImportWinner[];
  /** The winners text when it could not be parsed: to add by hand in A7. */
  unparsed: string | null;
}

/** One row of the sheet's group summary (`Tổng hợp kết quả` S:AE). */
export interface SummaryRow {
  teamNumber: number;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  points: number;
  rank: number;
}

/** One row of `TKV_Doi`. */
export interface TeamTotals {
  teamNumber: number;
  sets: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}

export interface Import2026 {
  teams: ImportTeam[];
  players: ImportPlayer[];
  courts: ImportCourt[];
  matches: ImportMatch[];
  awards: ImportAward[];
  summary: SummaryRow[];
  teamTotals: TeamTotals[];
  /** Sorted unique `YYYY-MM-DD`. */
  matchDays: string[];
}
