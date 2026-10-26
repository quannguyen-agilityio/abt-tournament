import { currentSeasonYear } from './season';

/** ABT started in 2024; the 2026 edition was the third. */
export const FIRST_SEASON_YEAR = 2024;

/**
 * Season years offered by the season switcher, newest first. Reads the season
 * table once it exists (issue #7); until then it is the known editions plus the
 * current calendar year.
 */
export function listSeasons(): number[] {
  const years = new Set([currentSeasonYear(), 2026, 2025, FIRST_SEASON_YEAR]);
  return [...years].sort((a, b) => b - a);
}
