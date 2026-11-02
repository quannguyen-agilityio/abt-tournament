// Smoke 3 (spec §11): a visitor switches the locale and the theme on the standings page.
import { expect, test } from '@playwright/test';

test('a visitor switches the locale and the theme on the standings page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/vi/2027/standings');
  await expect(page.getByRole('heading', { level: 1, name: 'Bảng xếp hạng' })).toBeVisible();

  await page.getByRole('link', { name: 'Chuyển sang Tiếng Anh' }).click();
  await expect(page).toHaveURL(/\/en\/2027\/standings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Standings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // System → Light → Dark, kept in a cookie across a reload.
  const html = page.locator('html');
  await page.getByRole('button', { name: 'Theme: System' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Theme: Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { level: 1, name: 'Standings' })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(background);
});
