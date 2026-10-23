# ABT Tournament: Project Plan

> Status: draft for review · Last updated: 2026-10-23 · Owner: Organizing Committee (BTC)
>
> Companion doc: [spec.md](spec.md) (data model, rules engine, screens, permissions).

## 1. Context

The **Agility Badminton Tournament (ABT)** is AgilityIO's annual internal team badminton tournament. ABT 2026 (the third season) was played on 16 and 23 May 2026, with 7 teams of 8 players. Until now, everything has been run from a Google Sheet:

- rank and skill points
- lineups and per-set scores
- standings
- side awards

Results were then posted on Facebook.

This project replaces the sheet with a web app that has:

- a **public dashboard** anyone can open on their phone at the venue or remotely, including teammates in New York;
- an **admin site** where the BTC and referees run the tournament: lineups, results, schedule, side awards.

## 2. Goals

1. **Run ABT 2027** (expected May 2027) entirely from the app, with no parallel spreadsheet.
2. **Encode the rules once**, in a tested module:
   - lineup validation
   - handicap computation
   - standings and tie-breaks
   - knock-out relay scoring
3. **Keep history across seasons**, so a player's profile shows every season they played.
4. **Use ABT 2026 data** as demo content and as the test oracle for the rules engine.

### Non-goals (for now)

- Point-by-point live scoring
- Player self-registration or self-service accounts
- Payments: fees are tracked as a paid/unpaid checklist, not collected
- Native mobile apps: the web app is responsive instead

## 3. Scope

### Phase 1: MVP for ABT 2027

**Public (no login, season switcher everywhere)**

| #   | Screen             | Purpose                                                         |
| --- | ------------------ | --------------------------------------------------------------- |
| P1  | Home               | Upcoming matches, latest results, standings snapshot            |
| P2  | Standings          | Group table: played, won, points, set diff, point diff          |
| P3  | Schedule & results | Filter by day, team, court                                      |
| P4  | Match detail       | Lineup per set/leg, handicap, scores, referee, court            |
| P5  | Knock-out bracket  | Semi-finals, 3rd place, final                                   |
| P6  | Teams / team       | Roster, captain, results                                        |
| P7  | Players / player   | Rank, skill points, gender, team, stats; history across seasons |
| P8  | Side awards        | Award, sponsor, value, criteria, winners (player, pair or team) |
| P9  | Rules              | Bilingual summary of the tournament rules                       |

**Admin (login required)**

| #   | Screen      | Who          | Purpose                                                                 |
| --- | ----------- | ------------ | ----------------------------------------------------------------------- |
| A1  | Season      | BTC          | Dates, venue, courts, rule parameters (handicap caps, targets), fees    |
| A2  | Players     | BTC          | CRUD, CSV import, rank, skill points, member type, fee checklist        |
| A3  | Teams       | BTC          | Assign players (CSV import of the draw), captain                        |
| A4  | Schedule    | BTC          | Generate round-robin, assign date/time/court/referee                    |
| A5  | Match       | BTC, Referee | Attendance, lineup (validated), scores, substitutions, forfeits         |
| A6  | Close group | BTC          | Review tie-breaks, order manual draws, lock standings, generate bracket |
| A7  | Side awards | BTC          | Create awards, assign winners                                           |
| A8  | Users       | BTC          | Create accounts, assign role, reset password                            |

**Cross-cutting**

- **i18n:** Vietnamese (default) and English. Only the UI is translated; content such as names is entered once.
- **Light/dark theme.**
- **Responsive:** phone, tablet and desktop are treated equally.
- **Auto-refresh:** public pages refresh about every 30 s on match days.
- **Audit log:** every result and lineup change is recorded.

### Phase 2 (after ABT 2027, not committed)

- In-app team draw (randomized, rank-balanced), with a projector-friendly "draw show" screen
- Live point-by-point scoring
- Voting for side awards
- Fun-stats page (the "Tổng kết vui" sheet), if still wanted

### Explicitly dropped

- Fun-stats page in Phase 1
- Admin UI for importing match results (the 2026 import is a one-off script)

## 4. Users and roles

| Role                | Who                     | Access                                                                       |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| Visitor             | Anyone                  | Public dashboard, read-only                                                  |
| Referee (Trọng tài) | Accounts created by BTC | Admin **Match** screen only: attendance, lineup, scores. "My matches" first. |
| BTC                 | Organizing Committee    | Everything, including overriding lineup-rule violations                      |

Accounts are email + password (Supabase Auth). There is no public sign-up: the BTC creates accounts and resets passwords. A user who logs in with a temporary password must change it.

## 5. Tech stack

| Concern    | Choice                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Web app    | Next.js (App Router) + TypeScript                                                                   |
| UI         | Tailwind CSS + shadcn/ui                                                                            |
| i18n       | `next-intl`, locale-prefixed routes (`/vi/...`, `/en/...`)                                          |
| Data       | Supabase Postgres (free tier) with Row Level Security                                               |
| Auth       | Supabase Auth, email + password, sign-up disabled                                                   |
| Rules      | Pure TypeScript module (`src/domain/`) with no framework or DB imports                              |
| Tests      | Vitest (rules engine, with 2026 data as the oracle) + Playwright smoke tests                        |
| Hosting    | Vercel                                                                                              |
| CI         | GitHub Actions: lint, typecheck, Vitest, Playwright on every PR                                     |
| Keep-alive | Weekly GitHub Actions cron that pings each Supabase project (free projects pause after 7 days idle) |

## 6. Environments and Git workflow

### Branches

```
feature/*  ──PR (squash)──▶  dev  ──PR──▶  staging  ──PR──▶  main
```

- **`dev`** is the default branch. Every change lands here first, through a squash-merged PR.
- **`staging`** is promoted from `dev` through a PR. The BTC does UAT here.
- **`main`** is promoted from `staging` through a PR. It is production.
- `staging` and `main` are protected:
  - changes only through a PR, admins included
  - no force-push or deletion
  - conversations must be resolved before merging
  - required CI checks get added once CI exists
- The repo allows squash merge only, and branches are deleted after merge.

### Deploy targets

| Env        | Branch    | Vercel                | Supabase                                     |
| ---------- | --------- | --------------------- | -------------------------------------------- |
| Local      | any       | `next dev`            | Supabase CLI (Docker), seeded with fake data |
| Dev        | `dev`     | Branch deployment     | `abt-staging` project (shared with Staging)  |
| Staging    | `staging` | Branch deployment     | `abt-staging` project                        |
| Production | `main`    | Production deployment | `abt-prod` project                           |

> **Why only two Supabase projects:** the Supabase free plan allows 2 active projects per organization. Dev and Staging therefore share one database. Schema changes are applied as migrations (`supabase/migrations/`) in order, so the shared database stays consistent. If this becomes painful, the next step is a paid plan or a second free organization.

## 7. Data and privacy

The repository is **public**. The source files of the tournament hold personal data: real names, gender, skill ratings, and the Slack handles of the BTC. Therefore:

- `*.xlsx`, `*.csv` and `docs/*.pdf` are **gitignored**. The 2026 workbook stays on the organizer's machine.
- The one-off import script reads the workbook from a local path given as an argument and writes into a Supabase project. Nothing personal is committed.
- Seed data, mockups and test fixtures in the repo use **fake names**. The 2026 oracle test reads the real workbook only when it is present locally (and is skipped in CI).
  > Alternative if CI must run the oracle: an anonymized fixture that keeps the numbers and replaces the names.
- A private Artifact with real data can be shared with the BTC for design review.
- Fee and member-type data is admin-only and enforced by RLS, not just hidden in the UI.

## 8. Roadmap

Target: production-ready by **mid-April 2027**, which leaves a buffer before the draw and ABT 2027 in May.

| Milestone | Window        | Deliverable                                                                                           |
| --------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| M0        | Oct–Nov 2026  | Repo setup ✅, `plan.md` + `spec.md` (this PR), HTML mockups of all 17 screens, BTC review            |
| M1        | Nov 2026      | Next.js scaffold, Supabase schema and migrations, auth, i18n, theming, CI, keep-alive cron            |
| M2        | Dec 2026      | Rules engine + Vitest; 2026 import script; oracle tests green against the 2026 workbook               |
| M3        | Jan 2027      | Admin: season, players, teams, schedule, users                                                        |
| M4        | Feb 2027      | Admin: match (attendance, lineup, scores, substitutions, forfeits), close group, bracket, side awards |
| M5        | Mar 2027      | Public dashboard (P1–P9), auto-refresh, Playwright smoke tests                                        |
| M6        | Late Mar 2027 | UAT on staging: BTC replays ABT 2026 end-to-end in the app                                            |
| M7        | Apr 2027      | Production launch, ABT 2027 season created, players registered                                        |

Each step is its own PR into `dev` and is reviewed before the next one starts.

## 9. Risks

| Risk                                                                                    | Mitigation                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The rules text is ambiguous (handicap direction, relay handicap, multi-team tie-breaks) | Each interpretation is written in [spec.md §10](spec.md#10-rule-interpretations-confirmed-by-the-btc-on-2026-10-23), confirmed by the BTC (A1–A7, 2026-10-23), and covered by a test |
| 2026 practice differed from the written rules (per-leg relay handicap)                  | Handicap caps are configurable per season; 2026 scores are imported as recorded, without recomputation                                                                               |
| Supabase free project pauses when idle                                                  | Weekly keep-alive cron                                                                                                                                                               |
| Venue Wi-Fi or mobile data is weak on match days                                        | Light pages, server-rendered, small payloads; a referee can re-submit scores without losing input                                                                                    |
| Personal data leaks through the public repo                                             | Gitignore rules, fake fixtures, RLS on private columns, PR review                                                                                                                    |
| Vercel Hobby plan terms (non-commercial use)                                            | Internal, non-revenue event; revisit if the company wants it on its own infrastructure                                                                                               |

## 10. Decision log

These decisions were settled in the kickoff grilling session on 2026-10-23.

| #   | Decision                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Target ABT 2027; import ABT 2026 as demo data and as the test oracle                                                                                                |
| D2  | Multi-season model with a shared person profile                                                                                                                     |
| D3  | Side awards are titles that the BTC assigns, with no voting                                                                                                         |
| D4  | Results are entered as final score per set or leg, not live                                                                                                         |
| D5  | Lineups are stored and validated, the BTC can override, and handicaps are auto-computed                                                                             |
| D6  | Two admin roles: BTC and Referee                                                                                                                                    |
| D7  | The team draw happens outside the app (CSV import); an in-app draw is Phase 2                                                                                       |
| D8  | Fees and member type are admin-only                                                                                                                                 |
| D9  | Bilingual UI (VI/EN) via i18n                                                                                                                                       |
| D10 | Free tier: Vercel + Supabase                                                                                                                                        |
| D11 | Email/password accounts managed by the BTC; no sign-up                                                                                                              |
| D12 | The lower skill-point pair receives the handicap                                                                                                                    |
| D13 | Relay handicap is the net signed sum over 5 legs, capped, and applied at the start of leg 1. Caps are configurable per season for the group stage and the knock-out |
| D14 | Point difference uses scoreboard points, which include the handicap                                                                                                 |
| D15 | One group, single round-robin, top 4 advance                                                                                                                        |
| D16 | Round-robin pairings are generated; the BTC assigns slots; the bracket is generated after "Close group"                                                             |
| D17 | Forfeit = 5–0 in sets, 31–0 in each set                                                                                                                             |
| D18 | Substitution is limited to rank ±1, with the handicap recomputed                                                                                                    |
| D19 | Each match has a court and a referee; the captain defaults to the Rank 1 player                                                                                     |
| D20 | Separate public repo, `dev → staging → main`, squash-only                                                                                                           |
| D21 | No real personal data in the repo                                                                                                                                   |
| D22 | HTML mockups for all screens before any code                                                                                                                        |
| D23 | Rule interpretations A1–A7 confirmed (spec §10). Notably, disqualifying a team annuls **all** its group matches, played ones included                               |
