// Smoke 1 (spec §11): a referee enters a full group match, attendance → lineup → lock → 5 scores, and
// the public standings update.
import { expect, test, type Page } from '@playwright/test';
import { REFEREE, signIn } from './support/auth';
import { createFixtureSeason, dropFixtureSeason, LINEUP, type FixtureSeason } from './support/fixture-season';

const YEAR = 2091;
let season: FixtureSeason;

test.beforeAll(async () => {
  season = await createFixtureSeason(YEAR);
});

test.afterAll(async () => {
  await dropFixtureSeason(YEAR);
});

/** The public standings row of a team: played, won, points. */
async function standingsRow(page: Page, team: string) {
  await page.goto(`/en/${YEAR}/standings`);
  const cells = page.getByRole('row').filter({ hasText: team }).getByRole('cell');
  return { played: cells.nth(2), won: cells.nth(3), points: cells.nth(5) };
}

test('a referee enters a full group match and the public standings update', async ({ page }) => {
  const match = season.matches[0];
  const { home, away } = match;

  const before = await standingsRow(page, home.name);
  await expect(before.played).toHaveText('0');

  await signIn(page, REFEREE);
  await page.goto(`/en/admin/matches/${match.id}`);

  // 1. Attendance: all 8 players of each team.
  for (const team of [home, away]) {
    const form = page.getByRole('form', { name: team.name });
    // Retried: ticks made before hydration are reset by React.
    await expect(async () => {
      for (const checkbox of await form.getByRole('checkbox').all()) await checkbox.check();
      await expect(form.getByRole('status').first()).toHaveText('8/8 present', { timeout: 1000 });
    }).toPass();
    await form.getByRole('button', { name: 'Save attendance' }).click();
    if (team === home) await expect(form.getByText('Saved')).toBeVisible();
  }

  // 2. Lineups, which open once both attendances are saved: the fixture template, saved per team.
  await expect(page.getByRole('region', { name: 'Lineups' })).toBeVisible();
  for (const team of [home, away]) {
    const form = page.getByRole('form', { name: team.name });
    for (const [n, pair] of LINEUP.entries()) {
      for (const [position, member] of pair.entries()) {
        await form.getByLabel(`Set ${n + 1}, player ${position + 1}`).selectOption(team.players[member].id);
      }
    }
    await expect(form.getByText('Lineup is valid')).toBeVisible();
    await form.getByRole('button', { name: 'Save lineup' }).click();
    await expect(form.getByText('Saved')).toBeVisible();
  }

  // 3. Lock.
  await page.getByRole('button', { name: 'Lock lineups' }).click();

  // 4. Scores: the home pair wins sets 1-3, the away pair sets 4-5 (equal skill, so no start points).
  for (let n = 1; n <= 5; n++) {
    const row = page.getByRole('form', { name: `Set ${n}` });
    const homeWins = n <= 3;
    await row.getByLabel(`Set ${n}, ${home.name} score`).fill(homeWins ? '31' : '25');
    await row.getByLabel(`Set ${n}, ${away.name} score`).fill(homeWins ? '18' : '31');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByRole('status')).toHaveText(/Saved/);
  }

  // 5. Complete, after the confirmation.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Complete match' }).click();
  await expect(page.getByText('The match is completed.')).toBeVisible();

  const winner = await standingsRow(page, home.name);
  await expect(winner.played).toHaveText('1');
  await expect(winner.won).toHaveText('1');
  await expect(winner.points).toHaveText('1');
  const loser = await standingsRow(page, away.name);
  await expect(loser.played).toHaveText('1');
  await expect(loser.points).toHaveText('0');
});
