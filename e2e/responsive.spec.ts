// Spec §8: every screen works at 360, 768 and 1280 px. Wide tables scroll inside their container, never
// the page. Runs on the seed demo (ABT 2027 in the group stage, ABT 2025 finished), read-only.
import { expect, test, type Page } from '@playwright/test';
import { BTC, signIn } from './support/auth';

const WIDTHS = [360, 768, 1280];

const PUBLIC = [
  '/en',
  '/en/2027',
  '/en/2027/standings',
  '/en/2027/matches',
  '/en/2027/matches/V14',
  '/en/2027/bracket',
  '/en/2027/teams',
  '/en/2027/players',
  '/en/2027/rules',
  '/en/2027/awards',
  '/en/2025/bracket',
  '/en/2025/awards',
  '/vi/2027/standings',
];

const ADMIN = [
  '/en/admin',
  '/en/admin/matches',
  '/en/admin/seasons',
  '/en/admin/seasons/2027',
  '/en/admin/seasons/2027/players',
  '/en/admin/seasons/2027/teams',
  '/en/admin/seasons/2027/schedule',
  '/en/admin/seasons/2027/close-group',
  '/en/admin/seasons/2027/awards',
  '/en/admin/users',
  '/en/admin/change-password',
];

/** The first link on `path` whose href matches `pattern`: a detail page of the seed data. */
async function firstLink(page: Page, path: string, pattern: RegExp) {
  await page.goto(path);
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  const href = hrefs.find((h) => pattern.test(h));
  expect(href, `a link matching ${pattern} on ${path}`).toBeDefined();
  return href!;
}

async function expectNoPageScroll(page: Page, path: string) {
  await page.goto(path);
  // Fonts change text widths. Not `networkidle`: the match-day pages keep refreshing.
  await page.evaluate(() => document.fonts.ready);
  const { scrollWidth, innerWidth, offenders } = await page.evaluate(() => {
    const width = window.innerWidth;
    // The outermost elements that stick out of the viewport without a scroll container around them.
    const offenders = [...document.body.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5)
      .filter((el) => {
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          if (getComputedStyle(up).overflowX !== 'visible') return false;
          if (up.getBoundingClientRect().right > width + 0.5) return false;
        }
        return true;
      })
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`);
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: width, offenders };
  });
  expect
    .soft(scrollWidth, `${path} at ${innerWidth}px scrolls sideways: ${offenders.join(', ')}`)
    .toBeLessThanOrEqual(innerWidth);
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });
    // Each test walks a dozen pages.
    test.describe.configure({ timeout: 120_000 });

    test('public screens have no page-level horizontal scroll', async ({ page }) => {
      const details = [
        await firstLink(page, '/en/2027/teams', /\/2027\/teams\/[0-9a-f-]{36}$/),
        await firstLink(page, '/en/2027/players', /\/2027\/players\/[a-z0-9-]+$/),
      ];
      for (const path of [...PUBLIC, ...details]) await expectNoPageScroll(page, path);
    });

    test('admin screens have no page-level horizontal scroll', async ({ page }) => {
      await signIn(page, BTC);
      const match = await firstLink(page, '/en/admin/matches', /\/admin\/matches\/[0-9a-f-]{36}$/);
      for (const path of [...ADMIN, match]) await expectNoPageScroll(page, path);
    });

    test('the sign-in screen has no page-level horizontal scroll', async ({ page }) => {
      await expectNoPageScroll(page, '/en/admin/login');
    });
  });
}
