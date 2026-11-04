// The BTC edits and adds players through the A2 dialogs, on a fixture season of its own.
import { expect, test } from '@playwright/test';
import { BTC, signIn } from './support/auth';
import { btcClient, createFixtureSeason, dropFixtureSeason } from './support/fixture-season';

const YEAR = 2095;
// A person on record who has not played this season; the slug prefix lets dropFixtureSeason remove it.
const RETURNING = { full_name: `E2E ${YEAR} Returning`, slug: `e2e-${YEAR}-returning`, gender: 'female' as const };

test.beforeAll(async () => {
  await createFixtureSeason(YEAR);
  const db = await btcClient();
  const { error } = await db.from('person').insert(RETURNING);
  if (error) throw new Error(`returning person: ${error.message}`);
});

test.afterAll(async () => {
  await dropFixtureSeason(YEAR);
});

test('the BTC edits and adds players in dialogs', async ({ page }) => {
  await signIn(page, BTC);
  await page.goto(`/en/admin/seasons/${YEAR}/players`);
  const table = page.getByRole('table', { name: 'Season players' });

  // Edit: a dialog with labelled fields; the table updates after Save.
  await page.getByRole('button', { name: 'Edit Thử Đỏ 1' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit player' });
  await edit.getByLabel('Skill points').fill('4321');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(table.getByRole('row', { name: /Thử Đỏ 1/ })).toContainText('4321');

  // Add a new person.
  const add = page.getByRole('button', { name: '+ Add player' });
  await add.click();
  const create = page.getByRole('dialog', { name: 'New player' });
  await create.getByLabel('Full name').fill(`E2E ${YEAR} Newcomer`);
  await create.getByLabel('Rank (1–7)').fill('5');
  await create.getByLabel('Skill points').fill('120');
  await create.getByLabel('Team').selectOption({ label: 'Thử Xanh' });
  await create.getByLabel('Fee already paid').check();
  await create.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(create).toBeHidden();
  await expect(table.getByRole('row', { name: new RegExp(`E2E ${YEAR} Newcomer`) })).toContainText('Thử Xanh');
  await expect(page.getByLabel(`Fee paid by E2E ${YEAR} Newcomer`)).toBeChecked();

  // A name already in the season is rejected under the name field.
  await add.click();
  await create.getByLabel('Full name').fill('Thử Đỏ 1');
  await create.getByLabel('Rank (1–7)').fill('1');
  await create.getByLabel('Skill points').fill('1');
  await create.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(create.getByText('This player is already in the season.')).toBeVisible();
  await page.keyboard.press('Escape');

  // A name on record asks first, and links the existing person.
  await add.click();
  await create.getByLabel('Full name').fill(RETURNING.full_name);
  await create.getByLabel('Gender').selectOption({ label: 'Female' });
  await create.getByLabel('Rank (1–7)').fill('2');
  await create.getByLabel('Skill points').fill('80');
  await create.getByRole('button', { name: 'Add', exact: true }).click();
  const choice = create.getByRole('group', { name: 'Is this an existing person?' });
  await expect(choice).toContainText('No seasons yet');
  await choice.getByRole('radio', { name: new RegExp(RETURNING.slug) }).check();
  await create.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(create).toBeHidden();
  await expect(table.getByRole('row', { name: new RegExp(RETURNING.full_name) })).toBeVisible();

  const db = await btcClient();
  const { data } = await db.from('person').select('slug').like('slug', `e2e-${YEAR}-returning%`);
  expect(data?.map((p) => p.slug)).toEqual([RETURNING.slug]);
});
