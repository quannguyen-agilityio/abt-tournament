// Spec §8: admin forms are keyboard-operable. Signs in with the keyboard only, then tabs through the
// admin screens of the seed demo and checks that every control takes focus with a visible indicator.
import { expect, test, type Page } from '@playwright/test';
import { BTC } from './support/auth';

const ADMIN = [
  '/en/admin/matches',
  '/en/admin/seasons',
  '/en/admin/seasons/2027',
  '/en/admin/seasons/2027/players',
  '/en/admin/seasons/2027/teams',
  '/en/admin/seasons/2027/schedule',
  '/en/admin/seasons/2027/close-group',
  '/en/admin/seasons/2027/awards',
  '/en/admin/users',
];

/** Tabs through the page once, and returns the controls that got focus without a visible indicator. */
async function tabThrough(page: Page) {
  const missing: string[] = [];
  let first: string | null = null;
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      el.dataset.tabbed ??= String(Math.random());
      const s = getComputedStyle(el);
      return {
        id: el.dataset.tabbed,
        indicator: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none',
        label: `<${el.tagName.toLowerCase()}> ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}`,
      };
    });
    if (!focused) continue;
    if (focused.id === first) return missing;
    first ??= focused.id;
    if (!focused.indicator) missing.push(focused.label);
  }
  throw new Error('focus never came back to the first control');
}

test('the BTC signs in and reaches every admin control with the keyboard', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/en/admin/login');
  await page.getByLabel('Email').focus();
  await page.keyboard.type(BTC.email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.type(BTC.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/en\/admin$/);

  // A match on today's round: the referee's attendance, lineup and score forms.
  await page.goto('/en/admin/matches');
  const match = await page.getByRole('link', { name: 'V16' }).first().getAttribute('href');

  for (const path of [...ADMIN, match!]) {
    await page.goto(path);
    // The page streams in: wait for its heading before tabbing.
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect.soft(await tabThrough(page), `${path}: controls without a visible focus indicator`).toEqual([]);
  }
});
