// The BTC adds, renames and deletes a team through the A3 dialogs, on a fixture season of its own.
import { expect, test } from '@playwright/test';
import { BTC, signIn } from './support/auth';
import { createFixtureSeason, dropFixtureSeason } from './support/fixture-season';

const YEAR = 2093;

test.beforeAll(async () => {
  await createFixtureSeason(YEAR);
});

test.afterAll(async () => {
  await dropFixtureSeason(YEAR);
});

test('the BTC creates, edits and deletes a team in dialogs', async ({ page }) => {
  await signIn(page, BTC);
  await page.goto(`/en/admin/seasons/${YEAR}/teams`);

  // Esc closes the dialog and gives focus back to its trigger.
  const add = page.getByRole('button', { name: '+ Add team' });
  await add.click();
  const create = page.getByRole('dialog', { name: 'New team' });
  await expect(create.getByLabel('Name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(create).toBeHidden();
  await expect(add).toBeFocused();

  await add.click();
  await create.getByLabel('Name').fill('Dialog Team');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(create).toBeHidden();
  const card = page.getByRole('region', { name: 'Dialog Team' });
  await expect(card.getByRole('heading', { name: 'Dialog Team' })).toBeVisible();

  await card.getByRole('button', { name: 'Edit Dialog Team' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit team' });
  await edit.getByLabel('Name').fill('Renamed Team');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  const renamed = page.getByRole('region', { name: 'Renamed Team' });
  await expect(renamed.getByRole('heading', { name: 'Renamed Team' })).toBeVisible();

  // Delete asks first; Cancel keeps the team.
  await renamed.getByRole('button', { name: 'Delete Renamed Team' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this team?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(renamed).toBeVisible();

  await renamed.getByRole('button', { name: 'Delete Renamed Team' }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(renamed).toBeHidden();
});
