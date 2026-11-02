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

## Part 2: UAT checklist

The BTC runs this together with a developer, who files the findings. It takes about two hours. Use a laptop for the admin screens and a phone for the public pages and the referee flow.

### 2.0 Ground rules

- **Replay season:** ABT 2026 is already imported as year 2026 and the year is unique. Replay into year **2096**, named `ABT 2026 (UAT replay)`. Never edit the imported 2026 season: it's the reference you compare against.
- **Source of truth:** the 2026 workbook on the BTC's machine. Never upload it, and never paste names from it into an issue (plan §7). Refer to players by rank and team number, and to matches by code.
- **Findings:** file each one with `/create-github-issue` or the bug template, in milestone **M6 · UAT on staging**. Add the step number from this checklist (e.g. `UAT 2.5`), the URL, the account role, and what you expected next to what you saw. Tick the step here only once its findings are filed.
- **Themes and languages:** do each step in `vi`. Switch to `en` and to the other theme at least once per screen, and note any untranslated text or unreadable contrast.

### 2.1 Sign-in and accounts (A8, auth)

- [ ] Sign in as BTC. A wrong password shows an error and doesn't say whether the email exists.
- [ ] A new account with a temporary password is sent to **Change password** and can't open any other admin page until it changes it.
- [ ] A8: create a referee, reset their password (they must change it again), deactivate them (they can no longer sign in), reactivate them.
- [ ] As a referee, the admin menu only shows **Matches**. Opening `/vi/admin/seasons` directly is refused.
- [ ] Sign out returns to the login page. The back button doesn't reopen an admin page.

### 2.2 New season (A1)

- [ ] **Create season** with year 2096, cloned from 2026. Settings, courts and the player list are copied. Teams are not.
- [ ] Edit the venue and the match days (the 2026 dates are 16 and 23 May; any two Saturdays will do).
- [ ] Settings: the form shows the 2026 values (handicap caps, slot types, points). Enter an invalid value and check that it's rejected with a clear message. Then restore it.
- [ ] Courts: three courts, `Sân 1`, `Sân 2` and `Sân 3`, in that order.
- [ ] Status: move `draft` → `published`. The season appears in the public season switcher. Don't set it as current: 2026 stays the current season.

### 2.3 Players (A2)

- [ ] 56 players, with name, gender, rank, skill, member type, fee and paid.
- [ ] Inline edit: change one player's rank and skill, then put them back.
- [ ] CSV import: export `full_name, gender, rank, skill_points, member_type` from the `Xếp Rank` sheet locally and import it. The preview matches every player to an existing person, and the diff is empty or shows only real differences.
- [ ] Fees: enter a few fees and mark some paid. The summary shows collected vs. expected.
- [ ] Sign out and open the public player pages: fee and member type are never shown.

### 2.4 Draw (A3)

- [ ] Create the 7 teams with the 2026 names and colors.
- [ ] CSV import of the draw (`full_name, team_name`), exported from `Xếp Rank`. Every team has 8 players and covers every rank from 1 to 7.
- [ ] Drag one player to another team: the warning for a missing rank and unequal team sizes appears. Drag them back and the warning goes away.
- [ ] The captain defaults to the Rank 1 player. Change it on one team.
- [ ] Each team's roster matches `Xếp Rank`.

### 2.5 Schedule (A4)

- [ ] **Generate round-robin:** 21 group matches, every pair of teams meets once, and the codes run V01–V21.
- [ ] Assign the matches to the two days, the three courts and the time slots, matching the 2026 sheet's day and court as far as the generated pairings allow. Group 2026 had 15 matches on day 1 and 6 on day 2.
- [ ] Put the same team in two matches at the same time: a conflict warning appears. Do the same with a referee.
- [ ] Assign a referee to every match, using the three 2026 referees.
- [ ] Move the season to `group`. `/vi/2096/matches` lists every match by day and time. The day, team, court and stage filters work.

> The generated codes and home/away sides won't match 2026. Find the 2026 match by its two teams. If home and away are swapped, enter the 2026 away pairs as home and swap the scores.

### 2.6 Group matches (A5)

Sign in as a 2026 referee on a phone for at least two matches. Use BTC for the rest. For each of the 21 matches:

- [ ] **Attendance:** tick the players who played in 2026. With fewer than 5 present, a warning appears.
- [ ] **Lineup:** enter the five 2026 pairs. The handicaps in the preview match the sheet's `Chấp` column, on the **other** side of the stronger pair (spec §9). Any lineup violation is either a finding or a 2026 BTC override. Ask the BTC which. If it's an override, use **Save with override** as BTC, with the reason.
- [ ] Before the lock, open the match on the public site while signed out: the lineups aren't visible (A6).
- [ ] **Lock**, then the public page shows the pairs, ranks and handicap starts.
- [ ] **Scores:** enter each set's score from columns L/N as recorded. The winner and the set score (e.g. 3–2) match the sheet. Save one row, reload the page, and check that it was kept.
- [ ] **Complete.** The referee can no longer edit it. The BTC can **Unlock** or **Reopen** it, and the change is audited.

Do these side actions once each, on matches of your choice:

- [ ] **Substitute** a player (spec §4.1 `SUB_RANK`). The public match page marks the substitution.
- [ ] **Forfeit** a match with a reason, then reopen it and enter the real result.
- [ ] Enter invalid scores: 31–31, a set where neither side reaches 31, and a side below its handicap start. Each one is rejected with a clear message (spec §4.4).
- [ ] On a phone, turn on airplane mode, try to save a score, then turn it back on and save again. Nothing typed is lost (plan §9).

### 2.7 Standings and disqualification

- [ ] After the last group match, `/vi/2096/standings` matches the table in 1.4: order, P, W, L, Pts, SW–SL and PF–PA. The provisional badge is shown.
- [ ] Teams 3 and 6 are level on points. Their order and the tie-break hint follow spec §4.6. Do the same check for teams 5 and 7.
- [ ] **Disqualify** a team as BTC. All its group matches are annulled, including the ones already played, and it leaves the standings (A4). **Reinstate** it: the results and standings come back exactly as before.

### 2.8 Close group and knock-out (A6, P5)

- [ ] A6 shows the live standings with the deciding criterion per team.
- [ ] If any teams are still level after step 5, order them by drag-and-drop and add a note.
- [ ] **Close group.** The season moves to `knockout`, and the bracket on `/vi/2096/bracket` is seeded like 2026: SF1, SF2, the 3rd-place match and the final.
- [ ] **Reopen**, then close again. Then start one semi-final and check that Reopen is no longer offered.
- [ ] Play SF1, SF2, 3RD and F as relays: attendance, five legs, lock, cumulative scores to 125. The winners and the final scores match the sheet.

> 2026 played the relays with **per-leg** handicaps (up to 20), but the app follows the written rule (A1: the signed sum, capped once). The start handicap in the replay may differ from 2026. That's expected, not a finding. Enter the 2026 cumulative scores. If the app rejects them because of the different start, write down the match and the values and file it as a question for the BTC.

- [ ] Before entering the 3rd-place match, forfeit it: it's recorded 125–0 and the winner advances (A5). Reopen it, then enter the real result.

### 2.9 Side awards (A7, P8)

- [ ] Add the 18 awards from the `Giải phụ` sheet: name VI/EN, criteria, sponsor, value, note. Reorder two of them.
- [ ] Add winners of each kind: a player, a pair and a team, one with a related match.
- [ ] `/vi/2096/awards` shows the cards in your order. A blank English name falls back to Vietnamese on `/en/2096/awards`.
- [ ] Move the season to `finished`. P1 shows the champion, the runner-up and 3rd place with prizes.

### 2.10 Public dashboard (P1–P9)

Signed out, on a phone (360 px) and on a laptop. Check every page on both `/vi/2096` and `/vi/2026`, and compare 2096 with 2026:

- [ ] **P1 Home:** hero, "Now / Next" per court, latest 5 results, top 4, bracket link. During `group` it refreshes about every 30 s and shows "Last updated".
- [ ] **P2 Standings:** columns and top-4 highlight. The table scrolls inside its box on a phone, never the whole page.
- [ ] **P3 Matches:** filters, cards with set scores, status, court and time in ICT.
- [ ] **P4 Match detail:** group (five rows, handicaps, winner) and relay (legs, cumulative scores, progress to 125), substitutions marked, the forfeit reason shown.
- [ ] **P5 Bracket:** TBD before the group closes, seeded after.
- [ ] **P6 Teams:** cards, roster sorted by rank, results, SW–SL and PD.
- [ ] **P7 Players:** filters by team, rank and gender. A profile shows the season stats, every set played, the most frequent partner, and the history across 2026 and 2096.
- [ ] **P8 Awards** and **P9 Rules:** the rule numbers come from the season settings.
- [ ] Header: the season switcher, the language toggle (stays on the same page) and the theme toggle (kept after a reload).
- [ ] Empty states on a fresh draft season: no schedule yet, bracket TBD, no awards yet.

### 2.11 Wrap-up

- [ ] Every 2096 result matches the 2026 sheet, or its difference is filed (expected differences: codes, home/away, relay start handicaps).
- [ ] Every finding is an issue in milestone M6, labelled `bug`, `story` or `question` (for the BTC).
- [ ] The BTC agrees which findings block the production launch (M7). List them on the tracking issue.
- [ ] Remove the replay season from staging, or keep it for re-testing the fixes. Decide which on the tracking issue.
