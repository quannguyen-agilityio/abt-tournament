# ABT Tournament

Web app for running the Agility Badminton Tournament (ABT), AgilityIO's internal team badminton tournament.

- **Public dashboard:** standings, schedule and results, knock-out bracket, teams, players, side awards, rules.
- **Admin site:** seasons, players, teams, scheduling, lineups and results, closing the group stage, side awards, users.

- [Project plan](docs/plan.md): scope, roadmap, environments, decisions
- [Spec](docs/spec.md): data model, rules engine, screens, permissions
- [Design mockups](docs/design/index.html): static HTML of every screen with fake data (open `docs/design/index.html` in a browser)

## Local setup

Prerequisites: Node 22+ and pnpm 11 (`corepack enable` picks the pinned version).

```bash
pnpm install
pnpm dev   # http://localhost:3000
```

| Script           | What it does                                                                          |
| ---------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`       | Dev server                                                                            |
| `pnpm build`     | Production build                                                                      |
| `pnpm start`     | Serve the production build                                                            |
| `pnpm lint`      | ESLint                                                                                |
| `pnpm typecheck` | TypeScript check                                                                      |
| `pnpm format`    | Format with Prettier (`pnpm format:check` to verify only)                             |
| `pnpm test`      | Unit tests (Vitest)                                                                   |
| `pnpm test:e2e`  | End-to-end tests (Playwright), run `pnpm exec playwright install chromium` once first |

Layout: `src/app` (routes), `src/domain` (pure TypeScript, no `next`/`react`/`@supabase` imports, enforced by ESLint), `src/lib`, `src/components`, `messages/`.
