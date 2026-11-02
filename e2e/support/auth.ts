import { expect, type Page } from '@playwright/test';

/** Seed accounts (README "Seed accounts"): fake, local only. */
export const BTC = { email: 'btc@example.com', password: 'abt-demo' };
export const REFEREE = { email: 'referee@example.com', password: 'abt-demo' };

/** Signs in through the A1 login form (English UI) and waits for the admin shell. */
export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/en/admin/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}
