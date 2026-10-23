# ABT Tournament: Functional & Technical Spec

> Status: draft for review · Last updated: 2026-10-23
>
> Read [plan.md](plan.md) first for scope, roadmap and decisions. This doc says **how the system behaves**. References like **(A<n>)** point to a rule interpretation the BTC confirmed (see [§10](#10-rule-interpretations-confirmed-by-the-btc-on-2026-10-23)).

## 1. Glossary (VI ↔ EN)

The UI uses these terms consistently in both locales.

| Tiếng Việt                         | English                                | Meaning                                                  |
| ---------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| BTC (Ban tổ chức)                  | Organizing Committee                   | Admins with full access                                  |
| Trọng tài                          | Referee                                | Admin limited to entering matches                        |
| VĐV (Vận động viên)                | Player                                 | A person registered in a season                          |
| Đội / Đội trưởng                   | Team / Captain                         |                                                          |
| Rank 1–7                           | Rank 1–7                               | Seeding tier within a season; 1 is the strongest         |
| Điểm kỹ năng                       | Skill points                           | Per-season rating used for handicaps; higher is stronger |
| Vòng bảng                          | Group stage                            | Single round-robin                                       |
| Set                                | Set                                    | One doubles game to 31 (group stage)                     |
| Set Tự do / Rank thấp / Rank cao   | Open / Low-rank / High-rank set        | Set types (see §4.1)                                     |
| Điểm chấp                          | Handicap                               | Points a pair starts with                                |
| Đánh tiếp sức                      | Relay                                  | Knock-out format: 5 legs to 125                          |
| Lượt                               | Leg                                    | One pair-vs-pair segment of a relay                      |
| Bù đắp nhân sự                     | Roster compensation                    | Extra lineup rule when attendance differs                |
| Xử thua                            | Forfeit                                |                                                          |
| Bốc thăm                           | Draw                                   | Random draw (team split, last tie-break)                 |
| Bán kết / Tranh hạng 3 / Chung kết | Semi-final / Third-place match / Final |                                                          |
| Giải phụ                           | Side awards                            | Sponsored titles assigned by the BTC                     |

## 2. Season parameters

Every rule number is a **season setting**, so a rule change next year is configuration, not code.

| Setting               | Default (ABT 2026 rules)                   | Notes                                                      |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| `set_target`          | 31                                         | Group-stage set target; no 2-point lead needed             |
| `sets_per_match`      | 5                                          |                                                            |
| `slot_types`          | Open, Low, Open, High, Open                | Same order in group and relay                              |
| `low_rank_range`      | 4–7                                        | Eligible ranks for a Low-rank set                          |
| `high_rank_range`     | 1–3                                        | Eligible ranks for a High-rank set                         |
| `max_rank`            | 7                                          | Also defines the "lowest rank" in roster compensation (A3) |
| `group_handicap_cap`  | 20                                         | Max handicap per set                                       |
| `ko_handicap_cap`     | 15                                         | Max total handicap per relay match                         |
| `relay_milestones`    | 25, 50, 75, 100, 125                       |                                                            |
| `min_sets_per_player` | 1                                          |                                                            |
| `max_sets_per_player` | 2                                          |                                                            |
| `min_players_present` | 5                                          | Below this, the team is disqualified                       |
| `knockout_teams`      | 4                                          | SF1 = 1 v 4, SF2 = 2 v 3                                   |
| `fees`                | Employee 300k, Intern 150k, Guest 300k VND |                                                            |
| `timezone`            | `Asia/Ho_Chi_Minh`                         | Times are shown in venue time with an "ICT" label          |

## 3. Data model

Postgres (Supabase). All tables have `id uuid pk`, `created_at` and `updated_at`. Foreign keys cascade only where noted.

```text
person ─┬─< season_player >─ season ─┬─< team
        │        │                   ├─< court
        │        └── season_player_private (1:1, admin-only)
        │                            ├─< match ─┬─< match_attendance
        │                            │          ├─< match_slot ─< slot_substitution
        │                            │          └─< lineup_override
        │                            ├── group_closure (1:1)
        │                            └─< award ─< award_winner ─< award_winner_member
profile (1:1 auth.users) ── referee on match
audit_log
```

### 3.1 Tables

**`person`**: one human across seasons.

| Column       | Type                 | Notes                                 |
| ------------ | -------------------- | ------------------------------------- |
| `full_name`  | text                 | Displayed as entered (no translation) |
| `slug`       | text unique          | URL key, e.g. `nguyen-van-a`          |
| `gender`     | enum `male`/`female` | Public                                |
| `avatar_url` | text?                | Supabase Storage                      |

**`season`**

| Column       | Type       | Notes                                                     |
| ------------ | ---------- | --------------------------------------------------------- |
| `year`       | int unique | URL key (`/2027`)                                         |
| `name`       | text       | "ABT 2027"                                                |
| `venue`      | text       |                                                           |
| `status`     | enum       | `draft` → `published` → `group` → `knockout` → `finished` |
| `is_current` | bool       | Exactly one row is current; the root URL redirects to it  |
| `settings`   | jsonb      | All §2 parameters, validated by a Zod schema              |
| `match_days` | date[]     |                                                           |

Draft seasons are visible only to admins.

**`court`**: `season_id`, `name` ("Sân 1"), `sort_order`.

**`team`**: `season_id`, `name`, `color` (hex, used in UI chips), `logo_url?`, `captain_id → season_player?`, `disqualified_at?`, `disqualified_reason?`.

**`match.status_before_annul`** (enum?, on `match`): the status before annulment, so that "Reinstate" can restore it.

**`season_player`**: a person's registration in a season (public).

| Column         | Type     | Notes                             |
| -------------- | -------- | --------------------------------- |
| `season_id`    | fk       |                                   |
| `person_id`    | fk       | unique (`season_id`, `person_id`) |
| `team_id`      | fk?      | Null until the draw is imported   |
| `rank`         | smallint | 1..`max_rank`                     |
| `skill_points` | smallint |                                   |
| `status`       | enum     | `active` / `withdrawn`            |

**`season_player_private`** (admin-only, RLS):

- `season_player_id`
- `member_type` (`employee`/`intern`/`guest`)
- `fee_amount`
- `fee_paid_at?`
- `note`

**`match`**

| Column                                       | Type            | Notes                                                                                        |
| -------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| `season_id`                                  | fk              |                                                                                              |
| `code`                                       | text            | `V01`…`V21`, `SF1`, `SF2`, `3RD`, `F`; unique per season                                     |
| `stage`                                      | enum            | `group` / `semi_final` / `third_place` / `final`                                             |
| `round`                                      | smallint?       | Round-robin round number                                                                     |
| `home_team_id`, `away_team_id`               | fk?             | Null for bracket slots not yet decided                                                       |
| `scheduled_at`                               | timestamptz?    |                                                                                              |
| `court_id`                                   | fk?             |                                                                                              |
| `referee_id`                                 | fk → `profile`? |                                                                                              |
| `status`                                     | enum            | `scheduled` → `lineup_locked` → `in_progress` → `completed`; or `forfeit` / `annulled`       |
| `forfeit_team_id`                            | fk?             | The team that loses by forfeit                                                               |
| `forfeit_reason`                             | text?           |                                                                                              |
| `relay_handicap_home`, `relay_handicap_away` | smallint?       | Relay only: start-of-leg-1 points, snapshot at lock time                                     |
| `winner_team_id`                             | fk?             | Derived on completion, stored for queries                                                    |
| `imported`                                   | bool            | True for 2026 data: lineup and handicap checks are skipped and scores are stored as recorded |

**`match_attendance`**: (`match_id`, `team_id`, `season_player_id`). These are the players present for the match, and they drive the lineup rules.

**`match_slot`**: one row per set (group) or leg (relay), 5 per match.

| Column                                     | Type                  | Notes                                                                                                                                           |
| ------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_id`, `slot_no`                      | 1..5                  | unique                                                                                                                                          |
| `slot_type`                                | enum                  | `open` / `low` / `high`, copied from the season settings at creation                                                                            |
| `home_p1`, `home_p2`, `away_p1`, `away_p2` | fk → `season_player`? | As registered on the lineup sheet                                                                                                               |
| `handicap_home`, `handicap_away`           | smallint              | Group: start points for this set (one of them is 0). Relay: unused (see `match.relay_handicap_*`). Snapshot at lock; recomputed on substitution |
| `score_home`, `score_away`                 | smallint?             | Group: final set score. Relay: **cumulative** scoreboard at the end of this leg                                                                 |

**`slot_substitution`**:

- `match_slot_id`, `side`
- `replaced_id`, `substitute_id` (both `season_player`)
- `reason`, `created_by`

A slot's effective players are the registered ones with any substitutions applied.

**`lineup_override`**: (`match_id`, `team_id`, `rule_code`, `reason`, `created_by`). This records that the BTC accepted a lineup with a rule violation.

**`group_closure`**: (`season_id`, `final_order uuid[]` of team ids, `manual_draws jsonb`, `closed_by`, `closed_at`).

**`award`**:

- `season_id`, `sort_order`
- `name_vi`, `name_en?`, `criteria_vi`, `criteria_en?`
- `sponsor?`, `value_vnd?`, `note?`

**`award_winner`**: (`award_id`, `kind` = `player` | `pair` | `team`, `team_id?`, `match_id?`, `note?`).

**`award_winner_member`**: (`award_winner_id`, `season_player_id`). There is 1 member for a player and 2 for a pair.

**`profile`**: (`user_id` pk → `auth.users`, `display_name`, `role` = `btc` | `referee`, `must_change_password`, `is_active`).

**`audit_log`**: (`actor_id`, `entity`, `entity_id`, `action`, `before jsonb`, `after jsonb`, `at`). It is written by DB triggers on `match`, `match_slot`, `match_attendance`, `slot_substitution`, `lineup_override`, `group_closure`, `award_winner`, `season_player` and `season_player_private`.

### 3.2 Row Level Security

| Data                                                                                                                                       | anon (public)                                    | referee                                            | btc |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- | --- |
| `season` (non-draft), `team`, `court`, `person`, `season_player`, `award*`, `group_closure`, completed or in-progress `match`/`match_slot` | read                                             | read                                               | all |
| Lineups (`match_slot` players) of matches not yet `lineup_locked` (A6)                                                                     | —                                                | read                                               | all |
| `match`, `match_attendance`, `match_slot`, `slot_substitution`                                                                             | —                                                | write while the match is not `completed`/`forfeit` | all |
| `season_player_private`, `audit_log`, `lineup_override`                                                                                    | —                                                | —                                                  | all |
| `profile`                                                                                                                                  | `display_name` of assigned referees (via a view) | own row                                            | all |

Account creation and password reset use the Supabase Admin API from a server action that checks `role = 'btc'`. The service-role key never reaches the browser.

## 4. Rules engine (`src/domain/`)

Pure functions with no I/O. Inputs are plain objects and outputs are results plus a list of violations. The UI, the server actions and the import script all call the same functions.

### 4.1 Lineup validation: `validateLineup(match, side, attendance, slots, settings)`

Each check returns a violation `{ code, slotNo?, playerId?, message_key }`.

| Code              | Rule                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SLOT_INCOMPLETE` | Every slot has 2 distinct players                                                                                                                    |
| `NOT_PRESENT`     | Every slot player is in this match's attendance for that team                                                                                        |
| `MIN_SETS`        | Every present player plays ≥ `min_sets_per_player` slots                                                                                             |
| `MAX_SETS`        | No player plays > `max_sets_per_player` slots                                                                                                        |
| `CONSECUTIVE`     | No player appears in two consecutive slots (n and n+1)                                                                                               |
| `LOW_RANK_SLOT`   | Both players in a `low` slot have rank within `low_rank_range`                                                                                       |
| `HIGH_RANK_SLOT`  | Both players in a `high` slot have rank within `high_rank_range`                                                                                     |
| `COMPENSATION`    | If this team has **fewer present players** than the opponent and exactly **one** present player of rank `max_rank`, that player plays ≥ 2 slots (A3) |
| `MIN_PRESENT`     | Present players ≥ `min_players_present`. Otherwise the match is blocked and the BTC sees the "Disqualify team" action                                |
| `SUB_RANK`        | A substitute's rank is within ±1 of the replaced player's rank                                                                                       |

Violations are evaluated on the **effective** players, with substitutions applied.

- A **Referee** cannot save a lineup that has violations.
- A **BTC** member can save it with an override reason. That creates a `lineup_override` row.

Lineups are **locked** when the match moves to `lineup_locked`. The rules say the order cannot change once the match has started. After the lock, changes are possible only through substitutions, and the BTC can unlock with an audit entry.

### 4.2 Group-stage handicap: `slotHandicap(homePair, awayPair, cap)`

```
S_home = skill(home_p1) + skill(home_p2)   // effective players
S_away = skill(away_p1) + skill(away_p2)
h      = min(|S_home − S_away|, group_handicap_cap)
the side with the lower S starts with h; the other starts with 0
```

Example: 63 vs 54 gives the 54 pair a start of 9. A difference of 23 with cap 20 gives a start of 20.

### 4.3 Relay handicap: `relayHandicap(slots, cap)` (A1)

```
net = Σ over legs i=1..5 of (S_home,i − S_away,i)       // signed, effective players
h   = min(|net|, ko_handicap_cap)
if net > 0 the away team starts leg 1 with h; if net < 0 the home team does; else 0–0
```

Legs can lean opposite ways and cancel each other out. There is no per-leg clamp.

### 4.4 Score validation

**Group set:**

- Exactly one side has `set_target`, and the other has `< set_target`.
- Each side is ≥ its start points (the handicap).
- The set winner is the side at `set_target`.

**Relay leg i** (cumulative score `H_i`, `A_i`, with `H_0`, `A_0` = start handicap):

- `max(H_i, A_i) = milestone_i`
- `H_i ≥ H_{i−1}` and `A_i ≥ A_{i−1}`
- Legs are entered in order.

The match winner is whoever reaches the final milestone. A warning appears if `ko_handicap_cap ≥ milestone_1`.

**Match result (group):**

- Sets won decides the winner (5 sets, so there are no draws).
- **Scoreboard points**, including the handicap, feed the point difference (D14).

### 4.5 Forfeit and disqualification

- **Group forfeit:** the winner gets 5–0 in sets and 31–0 in every set. Lineups and handicaps are ignored.
- **Knock-out forfeit:** the winner advances, and the score is recorded as `125–0` (A5).
- **Disqualify team** (BTC action, e.g. fewer than `min_players_present` after 10 minutes). It requires a reason and a confirmation dialog that lists every affected match (A4).
  - **During the group stage:** every group match of the team is set to `annulled`, **including the matches already played**. Annulled matches:
    - do not count toward the standings or the player stats;
    - stay visible on the public match pages with an "Annulled" badge and the reason.

    The team is removed from the standings table and listed below it as "Disqualified".

  - **During the knock-out:** the team's next match becomes a knock-out forfeit and the opponent advances. Group results stay locked, because the group is already closed.
  - **Reinstate** (BTC, audited) restores the previous statuses. It is allowed only while the group is not closed.

### 4.6 Standings: `computeStandings(teams, matches, settings)`

Per team:

- Played (`P`), Won (`W`), Lost (`L`)
- Points = `W`
- Sets won and lost, set difference (`SD`)
- Points for and against, point difference (`PD`)

Only `completed` and `forfeit` matches count; `annulled` matches and disqualified teams are excluded.

**Ranking order** (rules §vii.3):

1. Points.
2. **Two teams level:** the winner of their head-to-head match.
3. **Three or more teams level:** a mini-table of only the matches among them, ordered by:
   1. head-to-head points;
   2. head-to-head set difference;
   3. head-to-head point difference.
4. Overall set difference.
5. Overall point difference.
6. Draw: the BTC orders the remaining tied teams manually on the Close-group screen.

The resolution procedure (A2):

- **Two teams** level on points are separated by step 2. One match is always decisive, because a match has 5 sets and cannot be drawn.
- **Three or more teams** level on points are ranked **in one pass** by the mini-table (3.1 → 3.2 → 3.3). The mini-table orders the whole group at once. It is **not** re-applied to a subgroup that is still level, and step 2 is never used inside a 3+ group.
- Teams still level after 3.3 go on to steps 4, 5 and 6, in that order.

Example: A, B and C each win one mini-table match (A > B, B > C, C > A), so they are level on 3.1. Step 3.2 (set difference among the three) ranks all three. If B is separated by 3.2 but A and C are still level after 3.3, A and C go to step 4. Their own head-to-head result is not used again.

The function returns the order and, for each team, **which criterion decided its position**. The UI shows that criterion as a hint (e.g. "ahead on head-to-head").

### 4.7 Schedule generation: `generateRoundRobin(teamIds)`

Circle method:

- An odd number of teams gets a bye.
- 7 teams produce 7 rounds × 3 matches = 21 matches.
- Codes run `V01`…`Vnn` in round order.
- Home/away alternates per round, so each team is "home" about half the time.

The BTC then assigns date, time, court and referee. Regenerating is allowed only while no match has a lineup or a score.

### 4.8 Bracket: `seedBracket(finalOrder, settings)`

`SF1 = #1 v #4`, `SF2 = #2 v #3`; the higher seed is home. `3RD` and `F` are filled automatically when both semi-finals finish. Bracket matches use the relay format (§4.3, §4.4).

## 5. Public screens

Every route lives under `/{locale}/{year}` with `locale ∈ {vi, en}`. `/` redirects to `/{vi}/{currentYear}`, and the locale is detected from `Accept-Language` on the first visit. The header has the season switcher, the language toggle and the theme toggle.

| ID  | Route                                       | Content and behavior                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | `/{year}`                                   | Hero (season name, dates, venue). "Now / Next" matches per court, latest 5 results, top 4 of the standings, link to the bracket once it exists. During `finished`: champion, runner-up and 3rd place with prizes.                                                                                            |
| P2  | `/{year}/standings`                         | Columns: `#`, Team, P, W, L, Pts, SW–SL, SD, PF–PA, PD. Top-4 highlight. Tie-break hint per row. Provisional badge until the group closes.                                                                                                                                                                   |
| P3  | `/{year}/matches`                           | Grouped by day, then time. Filters: day, team, court, stage. Each card shows the teams, the set score (e.g. 3–2) or "Upcoming", court, time and status.                                                                                                                                                      |
| P4  | `/{year}/matches/{code}`                    | Header: teams, set or relay score, status, court, referee. **Group:** 5 rows showing slot type, pairs (with rank and skill), handicap start, score, winner. **Relay:** leg table with cumulative scores, the start handicap and a progress bar to 125. Substitutions are marked. A forfeit shows its reason. |
| P5  | `/{year}/bracket`                           | SF1 and SF2 lead to the final, with the 3rd-place match below. Teams are TBD until the group closes.                                                                                                                                                                                                         |
| P6  | `/{year}/teams`, `/{year}/teams/{id}`       | Team cards (color, captain, record). Detail: roster sorted by rank, results list, team stats (SW–SL, PD).                                                                                                                                                                                                    |
| P7  | `/{year}/players`, `/{year}/players/{slug}` | List filterable by team, rank and gender. Profile: avatar, gender, team, rank, skill points; stats for the season (sets played, set wins and losses, PF–PA, most frequent partner); every set played; **history** across seasons.                                                                            |
| P8  | `/{year}/awards`                            | Award cards: name, sponsor, value, criteria, winners (player, pair or team chips that link through), related match.                                                                                                                                                                                          |
| P9  | `/{year}/rules`                             | Rule summary rendered from i18n content, with numbers from the season settings.                                                                                                                                                                                                                              |

**Auto-refresh:** on match days, P1–P5 poll every 30 s with `router.refresh()`, only while the tab is visible. A "Last updated" timestamp is shown.

**Empty states:**

- no schedule yet
- group not closed (bracket TBD)
- no awards yet

## 6. Admin screens

Routes live under `/{locale}/admin`. Logged-out users are redirected to `/admin/login`. A user with `must_change_password` is redirected to `/admin/change-password`.

| ID  | Route                                     | Role         | Content and behavior                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `/admin/seasons`, `/admin/seasons/{year}` | BTC          | Create or clone a season (copies settings, courts and the player list without teams). Edit details, `settings` (form backed by the Zod schema), courts, status transitions, "set as current".                                                                                                                        |
| A2  | `/admin/seasons/{year}/players`           | BTC          | Table: name, gender, rank, skill, team, member type, fee, paid ✓. Inline edit. **CSV import** (`full_name, gender, rank, skill_points, member_type`) with a preview, a diff and matching to existing persons by name or slug. Fee summary (collected vs expected).                                                   |
| A3  | `/admin/seasons/{year}/teams`             | BTC          | Create teams (name, color). **CSV import of the draw** (`full_name, team_name`). Drag players between teams. Set the captain (defaults to Rank 1). Warning when a team lacks a rank or the team sizes differ.                                                                                                        |
| A4  | `/admin/seasons/{year}/schedule`          | BTC          | "Generate round-robin" (§4.7). A grid of days × courts × time slots to assign matches. Referee dropdown. Conflict warnings: a team playing twice at once, a referee double-booked.                                                                                                                                   |
| A5  | `/admin/matches`, `/admin/matches/{id}`   | BTC, Referee | List with "My matches" first, then today's matches. The detail page is a **step flow**, described below.                                                                                                                                                                                                             |
| A6  | `/admin/seasons/{year}/close-group`       | BTC          | Live standings with the deciding criterion per team. When teams are tied after step 5, the BTC orders them by drag-and-drop and records a note. "Close group" locks the order (`group_closure`), sets the season status to `knockout` and seeds the bracket. "Reopen" is allowed while no bracket match has started. |
| A7  | `/admin/seasons/{year}/awards`            | BTC          | Award list (reorderable). Form: name VI/EN, criteria VI/EN, sponsor, value, note. Winners: kind (player, pair or team), picker, optional related match.                                                                                                                                                              |
| A8  | `/admin/users`                            | BTC          | List users. Create (email, display name, role, temporary password). Deactivate. Reset password (new temporary password, forces a change).                                                                                                                                                                            |

**A5 step flow:**

1. **Attendance:** tick the present players for each team. The team count is shown, and a warning appears below 5.
2. **Lineups:** a 5-row grid per team with player pickers filtered by slot type. Violations show live (§4.1). Handicaps preview live (§4.2 and §4.3).
3. **Lock:** both lineups are valid or overridden. The handicap snapshot is taken.
4. **Scores:** per set, or per leg cumulative, with validation (§4.4). Each row can be saved on its own, so a weak connection loses nothing.
5. **Complete.**

Side actions:

- **Substitute** (§4.1 `SUB_RANK`)
- **Forfeit** (with a reason)
- **Disqualify team** (BTC)
- **Unlock** or **reopen** (BTC, audited)

## 7. Internationalization and theming

- `next-intl` with `messages/vi.json` and `messages/en.json`. VI is the default and the source of truth, and CI fails when a key is missing in either file.
- Content is entered once and not translated:
  - names of people and teams
  - venue
  - award fields: the `_en` fields are optional and fall back to VI
- Numbers and dates use `Intl` with the active locale. Times are always in the season timezone and labeled "ICT".
- The light/dark theme follows the system by default and can be toggled. The choice is stored in a cookie.
- Branding: a neutral sporty palette with one accent color and an "ABT" wordmark until the logo arrives. Team colors appear only as chips and accents.

## 8. Non-functional requirements

| Area           | Requirement                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive     | Every screen works at 360 px, 768 px and 1280 px+. Tables become cards or scroll horizontally inside their container on phones, never the page. |
| Performance    | Public pages are server-rendered. LCP < 2.5 s on 4G. The payload of the public match list is < 100 KB.                                          |
| Accessibility  | WCAG 2.1 AA contrast in both themes, keyboard-operable admin forms, labels on every input.                                                      |
| Data integrity | Rules are enforced in the domain module **and** re-checked in server actions. Scores and lineups are audited.                                   |
| Security       | RLS on every table. The service-role key is server-only. No personal data in the repo (plan §7).                                                |
| Ops            | Keep-alive cron. Supabase daily backups (free tier) plus a manual `pg_dump` before each match day.                                              |

## 9. Data import: ABT 2026

`pnpm import:2026 --file <path/to/ABT_2026.xlsx> --env <local|staging|prod>` is a one-off, idempotent script that upserts by natural keys.

| Sheet                   | Maps to                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `Xếp Rank`              | `person`, `season_player` (rank, skill), `team` (by team number), `season_player_private` (fee)         |
| `Tổng hợp kết quả`      | `match` (code, day, time, court, referee name → profile), `match_slot` (pairs, handicap, scores)        |
| `Giải phụ`              | `award`, `award_winner` (+ members, parsed from the text where possible; otherwise added by hand in A7) |
| `TKV_*`, `Tổng Kết Vui` | Not imported (Phase 2 at most)                                                                          |

**Handicap mapping:** the sheet's "Chấp" number sits on the **stronger** side and means "this side concedes N". Import it as the _other_ side's `handicap_*`. Scores (columns L/N) already include the handicap and are stored as they are.

**Known fixes the script applies:**

- The SF headers are swapped against their set rows (rows `H155`/`H162`). Assign by the set-row codes (`BK1-*`, `BK2-*`) and map them to `SF1`/`SF2`.
- The final's date reads `29.03.2025`; use `2026-05-23`.
- Normalize name casing (one name in the results sheet has a stray capital letter) and match against `Xếp Rank`.
- 2026 relay legs carry **per-leg** handicaps (up to 20). Store `imported = true`, keep the per-leg values for display, and skip relay-handicap recomputation.

**Verification:** after import, the script prints the computed standings and team totals and diffs them against the sheet's summary columns (`Tổng hợp kết quả` S:AE, `TKV_Doi`). Any difference fails the run.

## 10. Rule interpretations (confirmed by the BTC on 2026-10-23)

The rules text leaves these points open. The BTC confirmed each answer, and each one is covered by a unit test.

| #   | Interpretation                                                                                                                                                                                                                | Where |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| A1  | Relay handicap has **no per-leg cap**. The signed sum is capped once at `ko_handicap_cap`.                                                                                                                                    | §4.3  |
| A2  | Three or more teams level on points are ranked in **one pass** of the mini-table (head-to-head points → set difference → point difference). Teams still level go to overall SD, then PD, then the draw. There is no re-split. | §4.6  |
| A3  | "Lowest rank" in roster compensation means rank `max_rank` (7).                                                                                                                                                               | §4.1  |
| A4  | A team disqualified in the group stage has **all** its group matches annulled, including the ones already played. It is removed from the standings so the stage stays fair to every team.                                     | §4.5  |
| A5  | A knock-out forfeit is recorded as 125–0 and the winner advances.                                                                                                                                                             | §4.5  |
| A6  | Lineups are public only once the match is `lineup_locked`, so the opponent cannot see them early.                                                                                                                             | §3.2  |
| A7  | A referee can enter results for any match; "My matches" only changes the sort order.                                                                                                                                          | §6 A5 |

## 11. Testing

- **Unit tests (Vitest), `src/domain/**`, target ≥ 95 % line coverage:**
  - one test file per function in §4;
  - table-driven cases for every violation code;
  - every tie-break branch, including the 3-way loop A > B > C > A and a partial split that falls through to overall SD;
  - disqualification annuls played and remaining matches, and Reinstate restores them.
- **Oracle test:** `src/domain/__oracle__/abt2026.test.ts` loads the real workbook from `ABT_2026_XLSX` when that variable is set and checks:
  - the standings order and totals against the sheet;
  - every group-stage handicap against §4.2.

  It is skipped when the variable is not set (CI).

- **Integration:** server actions against local Supabase, covering the RLS denials for anon and referee.
- **E2E smoke (Playwright, local Supabase with a fake seed):**
  1. A referee logs in and enters a full group match (attendance → lineup → lock → 5 scores), and the public standings update.
  2. The BTC closes the group with a manual draw order, and the bracket is seeded.
  3. A visitor switches the locale and the theme on the standings page.
- **CI:** every PR runs lint, typecheck, i18n key parity, Vitest and Playwright. Once the workflow exists, `staging` and `main` require it to pass.
