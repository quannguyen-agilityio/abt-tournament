// Smoke 2 (spec §11): the BTC closes the group with a manual draw order, and the bracket is seeded.
import { expect, test } from '@playwright/test';
import { BTC, signIn } from './support/auth';
import {
  completeFixtureMatch,
  createFixtureSeason,
  dropFixtureSeason,
  type FixtureSeason,
} from './support/fixture-season';

const YEAR = 2092;
let season: FixtureSeason;

// Teams 0-2 beat each other in a loop (0 > 1, 1 > 2, 2 > 0) and all beat team 3, every match 3–2 with
// the same set scores. They stay level through every tie-break (spec §4.6 steps 1-5), so the BTC draws.
const WINS: [string, boolean][] = [
  ['V01', true], // 0 v 1
  ['V02', true], // 2 v 3
  ['V03', false], // 0 v 2
  ['V04', true], // 1 v 3
  ['V05', true], // 0 v 3
  ['V06', true], // 1 v 2
];

test.beforeAll(async () => {
  season = await createFixtureSeason(YEAR);
  for (const [code, homeWins] of WINS) {
    await completeFixtureMatch(
      season.matches.find((m) => m.code === code)!,
      homeWins,
    );
  }
});

test.afterAll(async () => {
  await dropFixtureSeason(YEAR);
});

test('the BTC closes the group with a manual draw and the bracket is seeded', async ({ page }) => {
  const [a, b, c, d] = season.teams.map((team) => team.name);
  // The draw result to enter: c, a, b. Then d is 4th, so SF1 = c v d and SF2 = a v b.
  const drawn = [c, a, b];

  await signIn(page, BTC);
  await page.goto(`/en/admin/seasons/${YEAR}/close-group`);

  const group = page.getByRole('list', { name: 'Tied group 1' });
  const order = () => group.getByRole('listitem').allInnerTexts();
  await expect(group.getByRole('listitem')).toHaveCount(3);
  for (const [i, team] of drawn.entries()) {
    // Keyboard-friendly reordering: the move-up buttons.
    while ((await order()).findIndex((text) => text.includes(team)) > i) {
      await group.getByRole('button', { name: `Move ${team} up` }).click();
    }
  }
  expect((await order()).map((text) => drawn.find((team) => text.includes(team)))).toEqual(drawn);

  await page.getByLabel('Note').fill('Bốc thăm tại sân (E2E)');
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain(`SF1: ${c} – ${d}`);
    expect(dialog.message()).toContain(`SF2: ${a} – ${b}`);
    return dialog.accept();
  });
  await page.getByRole('button', { name: 'Close group & seed bracket' }).click();

  await expect(page.getByText('Group stage closed').first()).toBeVisible();
  await expect(page.getByText(`Drawn by hand: ${drawn.join(' › ')}.`)).toBeVisible();
  const bracket = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Bracket' }) });
  const sf1 = bracket.getByRole('listitem').filter({ hasText: 'SF1' });
  const sf2 = bracket.getByRole('listitem').filter({ hasText: 'SF2' });
  await expect(sf1).toContainText(c);
  await expect(sf1).toContainText(d);
  await expect(sf2).toContainText(a);
  await expect(sf2).toContainText(b);

  // The public bracket shows the same semi-finals.
  await page.goto(`/en/${YEAR}/bracket`);
  await expect(page.getByText(c).first()).toBeVisible();
  await expect(page.getByText(d).first()).toBeVisible();
});
