# ABT Tournament: UAT on staging

Milestone M6 (plan §8): the BTC replays ABT 2026 end-to-end in the app on staging, and every finding becomes an issue in the milestone. Part 1 prepares staging (#58). Part 2 is the checklist the BTC runs (#59).

Staging is the `staging` branch on Vercel and the `abt-staging` Supabase project. Dev uses the same project (plan §6), so anything loaded here also shows on the Dev site.

## Part 1: Prepare staging

Run these steps in order, from an up-to-date checkout of `staging`. Write the result of each step on the UAT tracking issue.

### 1.1 Promote `dev` to `staging`

1. Check that CI is green on `dev`.
2. Open a PR from `dev` into `staging`, titled `chore(release): promote dev to staging`. List the PRs that it brings in.
3. Merge it once CI passes and every conversation is resolved. `staging` is protected (plan §6), so it only changes through this PR.
4. Vercel deploys `staging` to its branch domain. Open that URL and check that `/vi` loads.

### 1.2 Apply the migrations

Every migration on `dev` should already be on `abt-staging`, because each one is pushed right after its PR is merged into `dev` (README, Database migrations). Check it from the `staging` checkout:

```bash
pnpm exec supabase link --project-ref <abt-staging ref>
pnpm exec supabase migration list   # every local migration has a remote timestamp
pnpm exec supabase db push          # only if the list shows a gap
```

### 1.3 Create the UAT accounts

On the staging site, sign in as a BTC user and open **Admin → Users** (A8). Create:

| Account          | Role    | Display name     | Notes                                                       |
| ---------------- | ------- | ---------------- | ----------------------------------------------------------- |
| Each BTC member  | BTC     | Their own name   | Real work emails                                            |
| ABT 2026 referee | Referee | `Nhã`            | The import maps the sheet's referee labels by display name  |
| ABT 2026 referee | Referee | `Nhật`           |                                                             |
| ABT 2026 referee | Referee | `Hạ`             |                                                             |
| UAT referee      | Referee | e.g. `UAT Trọng tài` | Used in Part 2 to test the referee view                 |

The display names must match exactly, with diacritics, or the import leaves the match referees empty and lists them under Warnings. Every account starts with a temporary password and must change it on first sign-in.

Send each person their email and temporary password **directly** (Slack DM or in person). Never post them on GitHub or in a shared channel. The seed accounts (`*@example.com`) are local only and don't exist on staging.

### 1.4 Import ABT 2026 and check the diff

Put the `abt-staging` URL and service role key in `.env.staging.local` (gitignored, README, ABT 2026 import). Then:

```bash
pnpm import:2026 --file data/abt-2026.json --env staging --dry-run
pnpm import:2026 --file data/abt-2026.json --env staging --yes
pnpm import:2026 --file data/abt-2026.json --env staging --dry-run
```

1. **First dry run:** the check against the sheet's summary passes (standings and team totals). If it prints a difference, stop and file a bug: the import writes nothing in that case.
2. **Import:** it prints the changes per table and the warnings. The warning list shows two things: referees without a profile, which should be empty after step 1.3, and awards whose winners must be added by hand in A7. Copy that warning list onto the tracking issue.
3. **Second dry run:** it prints no changes. That proves the import is idempotent on staging.

Then open the staging site and spot-check `/vi/2026/standings` against the sheet's summary:

| #   | Team (number in the sheet) | P   | W   | L   | Pts | SW–SL | PF–PA   |
| --- | -------------------------- | --- | --- | --- | --- | ----- | ------- |
| 1   | 4                          | 6   | 5   | 1   | 5   | 22–8  | 832–766 |
| 2   | 3                          | 6   | 4   | 2   | 4   | 17–13 | 810–790 |
| 3   | 6                          | 6   | 4   | 2   | 4   | 17–13 | 814–823 |
| 4   | 5                          | 6   | 3   | 3   | 3   | 16–14 | 835–772 |
| 5   | 7                          | 6   | 3   | 3   | 3   | 16–14 | 812–819 |
| 6   | 2                          | 6   | 2   | 4   | 2   | 9–21  | 767–865 |
| 7   | 1                          | 6   | 0   | 6   | 0   | 8–30  | 772–873 |

Add the award winners the import couldn't parse in **A7**, then check `/vi/2026/awards`.

### 1.5 Hand over

Staging is ready when:

- [ ] the `dev` → `staging` PR is merged and the staging domain serves it
- [ ] `supabase migration list` shows no gap
- [ ] the import's check passed and the second dry run printed no changes
- [ ] every BTC member and referee has signed in once and changed their temporary password
