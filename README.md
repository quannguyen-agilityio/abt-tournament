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

`pnpm exec supabase status` prints the URLs and keys again. Studio runs on http://127.0.0.1:54323 and the test mailbox (password-reset emails) on http://127.0.0.1:54324. Public sign-up is disabled (`supabase/config.toml`): create users in Studio or through the admin screens.

| Script           | What it does                                                                          |
| ---------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`       | Dev server                                                                            |
| `pnpm db:start`  | Start the local Supabase stack (`pnpm db:stop` to stop it)                            |
| `pnpm db:reset`  | Recreate the local database from `supabase/migrations/` and the seed                  |
| `pnpm db:types`  | Regenerate `src/lib/database.types.ts` from the local database                        |
| `pnpm build`     | Production build                                                                      |
| `pnpm start`     | Serve the production build                                                            |
| `pnpm lint`      | ESLint                                                                                |
| `pnpm typecheck` | TypeScript check                                                                      |
| `pnpm format`    | Format with Prettier (`pnpm format:check` to verify only)                             |
| `pnpm test`      | Unit tests (Vitest)                                                                   |
| `pnpm test:e2e`  | End-to-end tests (Playwright), run `pnpm exec playwright install chromium` once first |

Layout: `src/app` (routes), `src/domain` (pure TypeScript, no `next`/`react`/`@supabase` imports, enforced by ESLint), `src/lib`, `src/components`, `messages/`, `supabase/` (config and migrations).

### Database

Schema changes are SQL migrations in `supabase/migrations/`, applied in order to every environment (plan §6).

```bash
pnpm exec supabase migration new <name>   # create an empty migration
pnpm db:reset                             # apply all migrations to the local database
pnpm db:types                             # then regenerate the TypeScript types and commit them
```

Supabase clients live in `src/lib/supabase/`:

| File        | Use from                                  | Key                                                                                              |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `client.ts` | Client Components                         | anon (RLS applies)                                                                               |
| `server.ts` | Server Components, Server Actions, routes | anon + the user's session cookie (RLS applies)                                                   |
| `admin.ts`  | Server Actions only, after a `btc` check  | service role (bypasses RLS). Imports `server-only`, so a Client Component import fails the build |

### Remote projects

Dev and Staging share the `abt-staging` Supabase project; production is `abt-prod` (plan §6). To push migrations to one of them, log in and link it first (the project ref is in the dashboard URL):

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <abt-staging ref>
pnpm exec supabase db push
```

The link is stored in `supabase/.temp/` (gitignored), so each machine links once. Switch projects by running `link` again.
