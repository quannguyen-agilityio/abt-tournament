// Knock-out bracket (spec §4.8): SF1 = #1 v #4, SF2 = #2 v #3, then the third-place match and the final.
import type { SeasonSettings } from './settings';

export type BracketCode = 'SF1' | 'SF2' | '3RD' | 'F';
export type BracketStage = 'semi_final' | 'third_place' | 'final';

export interface BracketMatch<T extends string = string> {
  code: BracketCode;
  stage: BracketStage;
  /** Null until the semi-finals decide it. */
  home: T | null;
  away: T | null;
  /** 1-based group-stage position; the higher seed (lower number) is home. */
  homeSeed: number | null;
  awaySeed: number | null;
}

export type SemiFinalWinners<T extends string = string> = Partial<Record<'SF1' | 'SF2', T>>;

interface Seeded<T extends string> {
  team: T;
  seed: number;
}

function match<T extends string>(
  code: BracketCode,
  stage: BracketStage,
  a?: Seeded<T>,
  b?: Seeded<T>,
): BracketMatch<T> {
  if (!a || !b) return { code, stage, home: null, away: null, homeSeed: null, awaySeed: null };
  const [home, away] = a.seed < b.seed ? [a, b] : [b, a];
  return { code, stage, home: home.team, away: away.team, homeSeed: home.seed, awaySeed: away.seed };
}

/** Seeds the semi-finals from the group-stage order; `3RD` and `F` start empty. */
export function seedBracket<T extends string>(
  finalOrder: readonly T[],
  settings: Pick<SeasonSettings, 'knockout_teams'>,
): BracketMatch<T>[] {
  if (finalOrder.length < settings.knockout_teams) {
    throw new RangeError(`The bracket needs ${settings.knockout_teams} teams, got ${finalOrder.length}`);
  }
  if (new Set(finalOrder).size !== finalOrder.length) throw new RangeError('Team ids must be unique');

  const [s1, s2, s3, s4] = finalOrder.slice(0, settings.knockout_teams).map((team, i) => ({ team, seed: i + 1 }));
  return [
    match('SF1', 'semi_final', s1, s4),
    match('SF2', 'semi_final', s2, s3),
    match('3RD', 'third_place'),
    match('F', 'final'),
  ];
}

/**
 * Fills `3RD` (the semi-final losers) and `F` (the winners) once both semi-finals have a winner.
 * With only one winner the bracket is returned unchanged.
 */
export function advanceBracket<T extends string>(
  bracket: readonly BracketMatch<T>[],
  winners: SemiFinalWinners<T>,
): BracketMatch<T>[] {
  const outcome = (code: 'SF1' | 'SF2') => {
    const sf = bracket.find((m) => m.code === code);
    const winner = winners[code];
    if (!sf || sf.home === null || sf.away === null || sf.homeSeed === null || sf.awaySeed === null) {
      throw new RangeError(`${code} is not seeded`);
    }
    if (winner === undefined) return undefined;
    if (winner !== sf.home && winner !== sf.away) throw new RangeError(`${winner} did not play ${code}`);
    const home = { team: sf.home, seed: sf.homeSeed };
    const away = { team: sf.away, seed: sf.awaySeed };
    return winner === sf.home ? { winner: home, loser: away } : { winner: away, loser: home };
  };

  const sf1 = outcome('SF1');
  const sf2 = outcome('SF2');
  if (!sf1 || !sf2) return [...bracket];

  return bracket.map((m) => {
    if (m.code === '3RD') return match('3RD', 'third_place', sf1.loser, sf2.loser);
    if (m.code === 'F') return match('F', 'final', sf1.winner, sf2.winner);
    return m;
  });
}
