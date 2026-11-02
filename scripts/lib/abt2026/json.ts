// The committed form of the import model (data/abt-2026.json), without the private fees.
import { z } from 'zod';
import type { Import2026 } from './model';
import { ImportError } from './parse';

const COMMENT = 'Generated from ABT_2026.xlsx by `pnpm convert:2026`; fees are private and left out.';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

export function toImportJson(data: Import2026): string {
  const players = data.players.map((p) => omit(p, 'fee'));
  return `${JSON.stringify({ $comment: COMMENT, ...data, players }, null, 2)}\n`;
}

const int = z.number().int();
const pair = z.tuple([z.string(), z.string()]);

const slot = z.strictObject({
  slot_no: int,
  slot_type: z.enum(['open', 'low', 'high']),
  home: pair,
  away: pair,
  handicap_home: z.number(),
  handicap_away: z.number(),
  score_home: z.number(),
  score_away: z.number(),
});

const winner = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('team'), teamNumber: int }),
  z.strictObject({
    kind: z.literal('pair'),
    players: pair,
    matchCode: z.string().nullable(),
    note: z.string().nullable(),
  }),
  z.strictObject({ kind: z.literal('player'), player: z.string(), note: z.string().nullable() }),
]);

const schema = z.strictObject({
  $comment: z.string().optional(),
  teams: z.array(z.strictObject({ number: int, name: z.string(), color: z.string() })),
  players: z.array(
    z.strictObject({
      name: z.string(),
      slug: z.string(),
      gender: z.enum(['male', 'female']),
      rank: z.number(),
      skill: z.number(),
      fee: z.number().optional(),
      teamNumber: int,
    }),
  ),
  courts: z.array(z.strictObject({ name: z.string(), sort_order: int })),
  matches: z.array(
    z.strictObject({
      code: z.string(),
      stage: z.enum(['group', 'semi_final', 'third_place', 'final']),
      round: int.nullable(),
      homeTeam: int,
      awayTeam: int,
      court: int,
      date: z.string(),
      scheduledAt: z.string(),
      refereeName: z.string().nullable(),
      slots: z.array(slot),
      winner: z.enum(['home', 'away']),
    }),
  ),
  awards: z.array(
    z.strictObject({
      sortOrder: int,
      nameVi: z.string(),
      criteriaVi: z.string(),
      sponsor: z.string().nullable(),
      valueVnd: z.number().nullable(),
      note: z.string().nullable(),
      winners: z.array(winner),
      unparsed: z.string().nullable(),
    }),
  ),
  summary: z.array(
    z.strictObject({
      teamNumber: int,
      played: z.number(),
      won: z.number(),
      lost: z.number(),
      setsWon: z.number(),
      setsLost: z.number(),
      setDiff: z.number(),
      pointsFor: z.number(),
      pointsAgainst: z.number(),
      pointDiff: z.number(),
      points: z.number(),
      rank: z.number(),
    }),
  ),
  teamTotals: z.array(
    z.strictObject({
      teamNumber: int,
      sets: z.number(),
      won: z.number(),
      lost: z.number(),
      pointsFor: z.number(),
      pointsAgainst: z.number(),
      diff: z.number(),
    }),
  ),
  matchDays: z.array(z.string()),
});

export function parseImportJson(text: string): Import2026 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ImportError([`not valid JSON: ${e instanceof Error ? e.message : String(e)}`]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ImportError(
      result.error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`),
    );
  }
  return omit(result.data, '$comment');
}
