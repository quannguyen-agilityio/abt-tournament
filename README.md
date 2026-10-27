# ABT Tournament

Web app for running the Agility Badminton Tournament (ABT), AgilityIO's internal team badminton tournament.

- **Public dashboard:** standings, schedule and results, knock-out bracket, teams, players, side awards, rules.
- **Admin site:** seasons, players, teams, scheduling, lineups and results, closing the group stage, side awards, users.

- [Project plan](docs/plan.md): scope, roadmap, environments, decisions
- [Spec](docs/spec.md): data model, rules engine, screens, permissions
- [Design mockups](docs/design/index.html): static HTML of every screen with fake data (open `docs/design/index.html` in a browser)

## Local setup

Prerequisites: Node 22+, pnpm 11 (`corepack enable` picks the pinned version) and Docker (for the local Supabase stack).

```bash
pnpm install
pnpm db:start                   # local Supabase in Docker: Postgres, Auth, Studio
cp .env.example .env.local      # then paste the anon and service_role keys printed by db:start
pnpm dev                        # http://localhost:3000
```

`pnpm exec supabase status` prints the URLs and keys again. Studio runs on http://127.0.0.1:54323 and the test mailbox (password-reset emails) on http://127.0.0.1:54324. Public sign-up is disabled (`supabase/config.toml`): create users in Studio or through the admin screens, or use the [seed accounts](#seed-data).

| Script             | What it does                                                                            |
| ------------------ | --------------------------------------------------------------------------------------- |
| `pnpm dev`         | Dev server                                                                              |
| `pnpm db:start`    | Start the local Supabase stack (`pnpm db:stop` to stop it)                              |
| `pnpm db:reset`    | Recreate the local database from `supabase/migrations/` and the seed                    |
| `pnpm db:types`    | Regenerate `src/lib/database.types.ts` from the local database                          |
| `pnpm db:test`     | Database tests (pgTAP, `supabase/tests/`) against the local stack                       |
| `pnpm build`       | Production build                                                                        |
| `pnpm start`       | Serve the production build                                                              |
| `pnpm lint`        | ESLint                                                                                  |
| `pnpm typecheck`   | TypeScript check                                                                        |
| `pnpm format`      | Format with Prettier (`pnpm format:check` to verify only)                               |
| `pnpm test`        | Unit tests (Vitest)                                                                     |
| `pnpm test:e2e`    | End-to-end tests (Playwright), run `pnpm exec playwright install chromium` once first   |
| `pnpm i18n:check`  | Fail when `messages/vi.json` and `messages/en.json` differ in keys or have empty values |
| `pnpm import:2026` | Import the ABT 2026 workbook ([below](#abt-2026-import))                                |

Layout: `src/app` (routes), `src/domain` (pure TypeScript, no `next`/`react`/`@supabase` imports, enforced by ESLint), `src/lib`, `src/components`, `messages/`, `supabase/` (config, migrations and pgTAP tests).

### Database

Schema changes are SQL migrations in `supabase/migrations/`, applied in order to every environment (plan §6).

```bash
pnpm exec supabase migration new <name>   # create an empty migration
pnpm db:reset                             # apply all migrations to the local database
pnpm db:types                             # then regenerate the TypeScript types and commit them
pnpm db:test                              # run the pgTAP tests in supabase/tests/
```

### Seed data

`pnpm db:start` and `pnpm db:reset` load `supabase/seed.sql`: fake demo data, no real names (plan §7).

- **ABT 2025** (finished): 7 teams × 8 players, every group match played, group closed, knock-out and side awards.
- **ABT 2027** (current, group stage): match days are relative to the day of the reset. Last week's rounds are completed. Today has a completed, an in-progress and a `lineup_locked` match, plus an unlocked lineup (V16) that only the BTC and referees can see. The knock-out is next week.

Seed accounts, for local use only:

| Email                 | Password   | Role    |
| --------------------- | ---------- | ------- |
| `btc@example.com`     | `abt-demo` | BTC     |
| `referee@example.com` | `abt-demo` | Referee |

The referee is assigned to every match on "Sân 1".

### ABT 2026 import

`pnpm import:2026 --file <ABT_2026.xlsx> --env <local|staging|prod> [--dry-run] [--yes]` loads the 2026 season (spec §9). The workbook holds real names, so it stays on your machine: never commit it.

1. It parses the workbook and recomputes the group standings and team totals, then compares them with the sheet's own summary. Any difference is printed and the run stops before it writes anything.
2. It upserts by natural keys (season year, team name, person slug, match code, ...) and writes only what differs, so running it again changes nothing. It prints the changes per table and warnings, such as referees without a matching profile and awards whose winners must be added by hand in A7. Existing award winners are never touched.
3. `--dry-run` reads the database and prints what would change without writing.

Credentials: `--env local` reads the service role key from `pnpm exec supabase status`. `staging` and `prod` read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.staging.local` and `.env.prod.local` (gitignored). A write to staging or prod also needs `--yes`.

The same workbook is the rules engine's oracle (spec §11). `src/domain/__oracle__/abt2026.test.ts` checks the standings order and totals against the sheet and every group-stage handicap against spec §4.2. It runs only when `ABT_2026_XLSX` is set, so CI skips it:

```bash
ABT_2026_XLSX=~/Downloads/ABT_2026.xlsx pnpm test
```

### Row Level Security

RLS is enabled on every table (spec §3.2). Visitors (`anon`) read public data only. Lineups stay hidden until the match is `lineup_locked`, and referee names come from the `referee_name` view. A referee also reads lineups and attendance and writes match data until the match is `completed` or `forfeit`. The BTC can do everything. `supabase/tests/rls.test.sql` checks the policies.

Supabase clients live in `src/lib/supabase/`:

| File        | Use from                                  | Key                                                                                              |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `client.ts` | Client Components                         | anon (RLS applies)                                                                               |
| `server.ts` | Server Components, Server Actions, routes | anon + the user's session cookie (RLS applies)                                                   |
| `admin.ts`  | Server Actions only, after a `btc` check  | service role (bypasses RLS). Imports `server-only`, so a Client Component import fails the build |

## Deployments

Vercel builds the app on every push. Database migrations are pushed to Supabase by hand (plan §6).

| Env        | Branch    | Vercel                            | Supabase      |
| ---------- | --------- | --------------------------------- | ------------- |
| Dev        | `dev`     | Preview deployment, branch domain | `abt-staging` |
| Staging    | `staging` | Preview deployment, branch domain | `abt-staging` |
| Production | `main`    | Production deployment             | `abt-prod`    |

### Vercel setup (once)

1. In Vercel, **Add New → Project** and import this GitHub repository. Keep the root directory at the repository root. The framework, install and build commands come from `vercel.json`. It sets `pnpm_config_strict_dep_builds=false` because Vercel builds with `CI=1`, which makes pnpm re-run the install before every script (the same reason as in `.github/workflows/ci.yml`).
2. **Settings → Git → Production Branch:** `main`.
3. **Settings → Environment Variables**, with the values from the Supabase dashboard (**Project Settings → API**):

   | Variable                        | Production              | Preview                    |
   | ------------------------------- | ----------------------- | -------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | `abt-prod` URL          | `abt-staging` URL          |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `abt-prod` anon key     | `abt-staging` anon key     |
   | `SUPABASE_SERVICE_ROLE_KEY`     | `abt-prod` service_role | `abt-staging` service_role |

   Mark `SUPABASE_SERVICE_ROLE_KEY` as **Sensitive**. `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them. Preview also covers PR and feature-branch deployments, so they use `abt-staging` too.

4. **Settings → Domains:** add one domain per branch and assign it to its Git branch, for example `<name>-dev.vercel.app` → `dev` and `<name>-staging.vercel.app` → `staging`. The production domain points at `main`.
5. In each Supabase project, **Authentication → URL Configuration:** set the Site URL to that environment's domain (`abt-prod`: production; `abt-staging`: the staging domain) and add the other branch domains of that project to Redirect URLs.

### Database migrations

Vercel never touches the database. Push migrations with the Supabase CLI, from an up-to-date checkout of the branch being deployed. Log in and link the project first (the project ref is in the dashboard URL):

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <abt-staging or abt-prod ref>
pnpm exec supabase migration list   # local vs. remote: which migrations are not applied yet
pnpm exec supabase db push
```

The link is stored in `supabase/.temp/` (gitignored), so each machine links once. Switch projects by running `link` again.

When to push:

- **`abt-staging`:** right after a PR with a migration is merged into `dev`, from `dev`. Vercel deploys `dev` on the merge, so the Dev site may run the new code on the old schema for a few minutes. Staging shares the project, so it already has the schema when `dev` is promoted.
- **`abt-prod`:** before merging the `staging` → `main` PR, from `staging`. Then merge, and Vercel deploys the new code onto the new schema.

`abt-staging` serves both `dev` and `staging`, and production gets the schema before the code. So a migration must keep working with the code that is already deployed: add columns and tables first, and drop or rename only in a later release. Never edit a migration that has been pushed; add a new one.
