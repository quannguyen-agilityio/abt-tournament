# ABT Tournament: Phase 2 Spec (Live Scoring)

> Status: draft for BTC review · Last updated: 2026-11-09
>
> Builds on [spec.md](spec.md) (Phase 1). Section numbers like **§4.4** refer to that doc. Decisions in this doc are numbered **L1…** and were settled with the BTC on 2026-11-09. Mockups: [design/live/](design/live/).

## 1. Scope

Phase 2 is **live point-by-point scoring only**. The other Phase 2 ideas in [plan.md](plan.md#phase-2-after-abt-2027-not-committed) (in-app draw, award voting, fun stats) are out of scope.

- The scorer enters every rally on a phone or tablet at the court.
- The app tracks score, serving side, server, receiver and service courts, and announces the change of ends.
- Public pages show the live score, the server and a rally timeline in real time.
- When a set or leg ends, the final score is written to `match_slot` exactly as Phase 1 does. Standings, the bracket, stats and validation (§4.4–§4.8) do not change.
- Phase 1 final-score entry stays available as the fallback for any slot that has not been started live.

### Reference: BWF scoring today

ABT keeps its own scoring rules (§2: set to 31 without a 2-point lead, handicap start points, relay to 125). From the BWF it borrows only the **doubles service rules** (Laws of Badminton, Law 11), which do not change with the BWF's 3×15 format that takes effect on 4 January 2027.

## 2. Decisions

| #   | Decision                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Serving side, server, receiver and service courts are tracked. At the start of each set (and of relay leg 1), the side that gives the handicap (starts at 0) serves first. Only a 0–0 start goes through choosing the serving side. The scorer always picks the ends, the server and the receiver. |
| L2  | Group stage: the break and change of ends happen when the side that **started at 0** reaches `(set_target + 1) / 2` (16 for a set to 31, 14 for a set to 27). Without a handicap, both start at 0, so whichever side gets there first. Once per set. |
| L3  | Relay: the teams choose ends before leg 1. Ends change at every leg change (new pairs), never inside a leg.                                                                                                                                           |
| L4  | Relay leg change: the team that won the last rally of the previous leg serves first. Only the server and the receiver are picked again (from the new pairs).                                                                                          |
| L5  | One scorer per match at a time. The scorer is a BTC member or a referee. Another eligible user can **take over** after a confirmation, which is audited.                                                                                             |
| L6  | In a **live-scored** match, no substitution once the lineups are submitted (locked). A player who cannot continue triggers the injury flow (§6). Matches entered as final scores keep the Phase 1 substitution rule (D18, `SUB_RANK`).            |
| L7  | Injury: a **medical timeout** (default 5 minutes), then the scorer resumes the match or records a **retirement**. There is no limit on the number of medical timeouts.                                                                              |
| L8  | Group retirement: the retiring side loses the current set (the opponent is credited `set_target`, the retiring side keeps its points). Later sets in which the injured player is lined up are forfeited 31–0. Other sets are played normally.       |
| L9  | Relay retirement: the retiring team loses the match. The opponent is credited the final milestone (125); the retiring team keeps its cumulative score.                                                                                               |
| L10 | No reset during a live match: every action is a new event, and nothing is deleted. The scorer can undo and fix the setup until a set or leg is confirmed. After that, only the BTC can **reopen** it (audited). |

## 3. Season settings (additions to §2)

| Setting                   | Default | Notes                                                                          |
| ------------------------- | ------- | ------------------------------------------------------------------------------ |
| `live_scoring`            | `true`  | Off: the A5 screen shows only Phase 1 final-score entry                        |
| `medical_timeout_minutes` | 5       | Length of one medical timeout. No limit on how many                            |

The change-of-ends point is derived from `set_target`, so it is not a setting. The break at the change of ends has no timer: the prompt stays until the scorer taps **Tiếp tục**. `set_target` must be odd, and the settings schema rejects an even value.

## 4. Doubles service rules (`src/domain/live.ts`)

The live state is a pure function of the slot setup and its event log:

```ts
replay(setup: SlotSetup, events: LiveEvent[], settings): LiveState
// LiveState: score, servingSide, server, receiver, positions (who stands in the right court per side),
//            changeEndsDue, ended, winnerSide, timeout?, retired?
```

The server recomputes it on every event to validate (no point after the set ended, no point during a timeout). The client uses the same function for the instant optimistic view.

### 4.1 Start of a set (or relay leg 1)

1. **Serving team:**
   - With a handicap (start points differ), the side that **starts at 0** (the one giving the handicap) serves first. The app sets it, and the scorer cannot change it.
   - At **0–0**, the scorer picks the serving team (the result of the toss).
2. The scorer picks the **server** from the serving pair. The server stands in the court that matches the serving team's score: **even → right court, odd → left court**. The serving team starts at 0, so it serves from the right court. (Parity still matters for the relay leg change, where the cumulative score is rarely 0.)
3. The scorer picks the **receiver** from the other pair. The receiver stands diagonally opposite (same court label: right faces right). Each partner takes the other court.
4. The scorer sets which team is on which end, as seen from the scorer's seat (left / right of the screen).

### 4.2 After each rally

| Rally won by       | Score                 | Positions                                     | Next server                                                                                   |
| ------------------ | --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The serving side   | Serving side +1       | Server and partner swap courts                | Same server, from the new court                                                               |
| The receiving side | Receiving side +1     | Nobody moves                                  | The new serving side's player in the court that matches its new score (even right, odd left) |

The receiver is always the opponent standing diagonally from the server.

### 4.3 Change of ends (L2, L3)

- **Group set:** `changeEndsDue` becomes true on the rally where the side that started at 0 reaches `(set_target + 1) / 2`. If neither side had a handicap, it is the first side to reach that score. The scorer sees a full-screen "Đổi sân" prompt. Tapping **Tiếp tục** mirrors the court diagram. Undoing that rally undoes the prompt.
- **Relay:** ends change at every leg change (§4.4). There is no change inside a leg.

### 4.4 End of a set or leg

- **Group set:** when a side reaches `set_target`, the scorer sees **"Kết thúc set?"** with the final score. The scorer can still undo. Confirming writes `score_home` and `score_away` to `match_slot` (validated by §4.4 of spec.md) and opens the setup of the next set. All 5 sets are played because set and point differences count.
- **Relay leg i:** the leg ends when either cumulative score reaches `milestone_i`. Confirming writes the cumulative score to `match_slot` (as Phase 1 does) and opens the **leg change** screen:
  - The ends change (L3).
  - The new pairs come from the locked lineup.
  - The serving team is the winner of the last rally (L4). The scorer picks its server (who stands by the parity of the team's cumulative score) and the receiver.
- **The final milestone (relay) or the last set (group):** confirming completes the match (`status = completed`, `winner_team_id` derived).

### 4.5 Corrections (L10)

There is no "reset" action. The event log is append-only, so a wrong tap is corrected by a new event and the history stays.

| Mistake                                     | Who                      | How                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong point                                 | Scorer                   | **Hoàn tác** adds an `undo` event that cancels the last uncancelled `point`. It can be repeated, back to the setup of the set.                                                                                                                                                                         |
| Wrong ends, server or receiver at the setup | Scorer                   | **Sửa thiết lập** (in the menu) opens the setup screen with the current choices. Saving adds a new `setup` event, and `replay` recomputes positions and servers for every rally after it. The score does not change. The serving team stays fixed when there is a handicap (L1) or at a relay leg change (L4). |
| Wrong final score, already confirmed        | BTC only                 | **Mở lại set** / **Mở lại lượt** on A5 adds a `reopened` event with a required reason, written to the audit log. The slot goes back to `live`, its `score_home`/`score_away` are cleared, and a `completed` match goes back to `in_progress`, so the standings and public caches update. The scorer then undoes or adds points and confirms again. |

- The scorer cannot undo past an `end_confirmed` event. The undo button is disabled and says that the BTC must reopen the set.
- **Relay:** leg scores are cumulative, so the BTC can reopen only the last confirmed leg, and only while the next leg has no point yet. To fix an earlier leg, reopen the legs from the last one backwards.
- **Group:** sets are independent, so any confirmed set can be reopened while another set is live.
- Reopening a set that ended by retirement also clears the forfeits it caused (§6), after a confirmation that lists them.

## 5. Scorer lock (L5)

- `match.scorer_id` (fk → `profile`) and `match.scorer_since` hold the current scorer.
- **Start live scoring** on A5 claims the lock if nobody holds it. It requires `role = btc` or `role = referee`, and the match must be `lineup_locked` or `in_progress`.
- Any other eligible user sees the live screen **read-only**, with the line "Đang chấm bởi {name}" and a **Nhận quyền chấm** button. Takeover shows a confirmation, moves the lock, and writes an audit entry. The previous scorer's screen switches to read-only on the next event or realtime message.
- Events from a user who is not the current scorer are rejected.

## 6. Injury flow (L6–L9)

1. **Medical timeout:** the scorer taps **Chấn thương**, picks the injured player and starts the timeout. Scoring is paused. A countdown of `medical_timeout_minutes` runs on the scorer's screen and on the public match page.
2. Within or after the timeout, the scorer picks:
   - **Tiếp tục**: the timeout ends and scoring resumes; or
   - **Bỏ cuộc**: the retirement flow.
   - When the countdown hits 0, the screen shows "Hết giờ" and still waits for one of the two choices. The decision belongs to the referee on court.
3. **Retirement:** the scorer confirms on a screen that lists every consequence before it is applied.

**Group stage (L8):**

| Slot                                                | Result                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Current set                                         | `retired_side` set. Opponent score := `set_target`; retiring side keeps its score (e.g. 18–22 is stored 18–31) |
| A later set with the injured player in the lineup   | Forfeited 31–0 (`forfeit_side` set). Handicap start points are ignored, as in a match forfeit (§4.5)           |
| A later set without the injured player              | Played normally                                                                                                |
| Sets already finished                               | Unchanged                                                                                                      |

The current set's stored score still satisfies §4.4 (one side at target, the other below it, each side at or above its start points). The validator skips the start-points check for a forfeited slot. A retired set counts in player stats as a set played; a forfeited set does not, as for a match forfeit.

**Relay (L9):** the match ends. In the current leg, the opponent's cumulative score := the final milestone (125), and the retiring team keeps its score. Later legs stay empty. `match.retired_team_id` is set and the opponent wins.

**Public display:** the slot or match shows the badge **"Bỏ cuộc (chấn thương)"** / "Retired (injury)" with the injured player's name.

## 7. Data model (additions to §3)

**`live_event`**: append-only log, one row per scorer action.

| Column           | Type           | Notes                                                                                                         |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `match_slot_id`  | fk             |                                                                                                               |
| `seq`            | int            | 1, 2, 3… per slot; unique (`match_slot_id`, `seq`)                                                            |
| `kind`           | enum           | `setup`, `point`, `undo`, `ends_changed`, `timeout_start`, `timeout_end`, `retire`, `end_confirmed`, `reopened`            |
| `payload`        | jsonb          | `setup`: serving side, server, receiver, ends. `point`: `side`. `undo`: the `seq` it cancels. `timeout_*`/`retire`: player |
| `client_at`      | timestamptz    | When the scorer tapped (the device clock), for the timeline                                                   |
| `created_by`     | fk → `profile` |                                                                                                               |

`undo` is an event rather than a delete, so the log is the audit trail. `replay` skips cancelled events.

**`match_slot` (new columns):** `live_status` (`pending` / `live` / `finished`), `retired_side?`, `retired_player_id?`, `forfeit_side?`, `started_at?`, `ended_at?`.

**`match` (new columns):** `scorer_id?`, `scorer_since?`, `retired_team_id?`.

**RPC `live_apply(slot_id, expected_seq, kind, payload)`** (security definer):

- checks that the caller is the current scorer, and that `expected_seq` = last `seq` + 1;
- replays the log with the new event and rejects it if it is invalid;
- inserts the event; on `end_confirmed` it writes the slot score, and on the last slot it completes the match, in the same transaction;
- accepts `reopened` only from a BTC member, with a non-empty reason (§4.5). It clears the slot score and reopens the match in the same transaction. A later event from the scorer needs no takeover: the lock is unchanged.

**RLS:** anon can read `live_event` and the new columns of matches that are `in_progress` or `completed` (no personal data beyond names already public). Only the RPC writes.

## 8. Screens

### 8.0 Entry flow

How each user reaches live scoring, from login to the scoring screen.

```text
Login (BTC / referee)
  → Admin › Matches (A5 list)          live matches first, then "My matches" for a referee
  → Match (A5): Attendance → Lineups → Lock      no substitution after the lock in a live match (L6)
  → Scores step (L-A)
       ├─ Start live scoring        → set / leg setup (L-B) → scoring (L-C)
       ├─ Resume (I hold the lock)  → scoring (L-C) at the current set
       ├─ Someone else is scoring   → read-only viewer (L-H) · Take over
       └─ Enter final scores        Phase 1 fallback, only for slots with no live event
```

**A5 list (Matches):**

- A section **Đang chấm trực tiếp** at the top lists every `in_progress` match with a live slot. Each row has the LIVE chip, the court, the current set and score (`Set 3 · 9–16`) and the scorer's name.
- A match whose lineups are locked shows **Sẵn sàng chấm**.
- Tapping a live match opens A5 at the Scores step.

**A5 Scores step (L-A):** a **Live scoring** card above the Phase 1 entry grid. Its state follows the lock (§5):

| State                                   | Card                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Lineups not locked                      | Disabled, with "Khoá đội hình trước khi chấm"                                                                                            |
| Locked, nobody scoring, no live event   | **Bắt đầu chấm trực tiếp** (primary). Claims the lock and opens the setup of set 1 (or relay leg 1)                                       |
| I hold the lock                         | **Tiếp tục chấm** with the current set and score. Opens the scoring screen; a set that ended but is not confirmed opens its L-E prompt  |
| Another user holds the lock             | "Đang chấm bởi {name} · từ {time}", **Xem trực tiếp** (L-H) and **Nhận quyền chấm** (confirmation, audited)                               |
| Match completed                         | Summary per set; **Mở lại set** for the BTC (§4.5)                                                                                         |

- The Phase 1 entry grid stays below the card. A row whose slot has live events is read-only there ("Chấm trực tiếp"), so the two ways cannot overwrite each other. A slot entered as a final score cannot be scored live.
- Opening the scoring screen asks for a screen Wake Lock. If the lock moves while the screen is open, it switches to read-only (§5).

**Direct link:** the scoring screen has its own route, `/admin/seasons/{year}/matches/{code}/live`. It needs the same role and shows the A5 card state when the user does not hold the lock, so a bookmark or a link shared in chat works.

**Public:** visitors need no action. P1 and P3 show the LIVE chip on live matches (§8.2), and tapping one opens P4 with the live panel.

### 8.1 Scorer (admin, phone first)

| ID  | Screen            | Content                                                                                                                                                                                                                     |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-A | Entry on A5       | After **Lock**, the A5 Scores step shows **Bắt đầu chấm trực tiếp** next to the Phase 1 entry. It shows who holds the lock, if anyone. While the season has `live_scoring` on, the **Substitute** action is not offered after the lock (L6). It comes back only if the BTC switches the match to Phase 1 final-score entry before any rally is scored.                                                                                   |
| L-B | Set / leg setup   | Court diagram. Steps: choose ends (left/right) → serving team → server → receiver. Shows the start points (handicap) and the resulting service court. The serving-team step is skipped (fixed) when there is a handicap (L1) and at a relay leg change (L4).             |
| L-C | Scoring           | Big score, court diagram with the 4 players and the shuttle on the server, two large **+1** buttons in the team colors, **Hoàn tác**, set strip 1–5 (or leg progress to 125), menu (Sửa thiết lập, Chấn thương, Nhận quyền chấm). |
| L-D | Change of ends    | Full-screen prompt at the L2 point, with **Tiếp tục**.                                                                                                                                                                       |
| L-E | End of set / leg  | Final score, **Xác nhận** / **Hoàn tác điểm cuối**. After confirming, only the BTC can reopen (§4.5).                                                                                                                                                                         |
| L-F | Medical timeout   | Countdown, injured player, **Tiếp tục** / **Bỏ cuộc**.                                                                                                                                                                      |
| L-G | Retirement        | List of consequences (§6) before confirming.                                                                                                                                                                                |
| L-H | Read-only viewer  | The same screen without controls, "Đang chấm bởi {name}", **Nhận quyền chấm**.                                                                                                                                             |

**Layout:** phone portrait is the main target. The two +1 buttons fill the lower half and are at least 96 px tall. On a tablet or a phone in landscape, the screen splits into two halves, each team's button on its own side of the court, matching the ends. The screen stays awake (Wake Lock API) while scoring.

**Connection state:** a small badge shows **Đã đồng bộ** / **Đang chờ gửi (n)** / **Mất kết nối**. Events are queued in IndexedDB and sent in order when the connection returns. If the server rejects the queue because the lock moved, the screen says so and switches to read-only.

### 8.2 Public

| Screen  | Change                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4      | **Live panel** at the top while a slot is live: score, server (shuttle icon), "Đổi sân" or timeout state, and a rally timeline (score worm) of the current set. Finished sets keep the Phase 1 rows. |
| P1, P3  | Live matches show a **LIVE** chip and the current set score (for example `Set 3 · 14–11`). On P1, the "Now" block per court puts live matches first, with the set score of the match (`1–1`) and the current set score. P3 lets visitors filter on **Đang live**. |

**Realtime:** P4 subscribes to `live_event` inserts for its match through Supabase Realtime and replays the log in the browser. P1 and P3 keep the 30 s refresh (§5). If the realtime channel drops, P4 falls back to the same 30 s refresh.

## 9. Testing

- **Unit (`src/domain/live.test.ts`):** service courts and server rotation in the BWF doubles examples, the side that starts at 0 serves first when there is a handicap (only 0–0 takes the toss), start parity at a relay leg change, change of ends with and without handicap, undo across the change of ends and of the winning point before confirming, a new `setup` event that recomputes servers without changing the score, relay leg change and serve carry-over, timeout blocks points, retirement results for group and relay.
- **RPC:** a non-scorer is rejected, a stale `seq` is rejected, a point after the end is rejected, an undo past `end_confirmed` is rejected, `reopened` from a referee is rejected, reopening a relay leg is rejected once the next leg has a point, the last `end_confirmed` completes the match and `reopened` puts it back to `in_progress`.
- **Playwright:** score a full set on a 375 px viewport; take over the lock from a second session; go offline, score 3 rallies, reconnect and check the public page.
