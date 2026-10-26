---
name: create-github-issue
description: Verify a suspected bug by reproducing it, then file it as a GitHub issue with gh, including repro steps, evidence, root cause, affected files, a fix idea and acceptance criteria. Use when the user wants to turn a likely bug (a free-text description, a failing check, a spec mismatch) into a GitHub issue/ticket.
argument-hint: "<free-text bug description> [--yes]"
allowed-tools: Bash(gh auth status:*), Bash(gh repo view:*), Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh label list:*), Bash(git rev-parse:*), Bash(git status:*), Bash(node --version), Bash(pnpm --version)
---

# Create a GitHub issue from a likely bug

## Usage

Run it from the repo root in Claude Code:

```
/create-github-issue <free-text bug description> [--yes]
```

| Example                                                            | What it does                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `/create-github-issue Locale switcher drops the season year`       | Finds the code it points at, reproduces it, then asks before filing          |
| `/create-github-issue anon can read season_player_private`         | Checks the RLS claim against the local database before filing                |
| `/create-github-issue Standings tiebreak differs from spec §4.6`   | Compares the rules engine with the spec, and files it if they really differ  |
| `/create-github-issue Locale switcher drops the season year --yes` | Files without the confirmation step (still stops if the bug isn't confirmed) |

Before you start, you need `gh` logged in to github.com with access to the repo (`gh auth login`), and Docker running if the bug involves the database.

You get back the verdict and, once filed, the issue URL. Next step: `/resolve-github-issue <issue number> dev`.

Input: `$ARGUMENTS`. A free-text bug description. Use it as-is, and look up the code, spec section or screen it points at. If `--yes` is present, skip the confirmation in step 5. Otherwise always confirm.

Work through the steps in order. **Never create an issue for a bug you couldn't reproduce or confirm.**

## 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner,defaultBranchRef`. If gh is missing, not authenticated, or can't see the repo behind `origin` (see `git remote -v`), stop and tell the user to run `gh auth login`.
2. Look for duplicates: `gh issue list --state all --search "<key words>"`. Also check the open story/task issues for the same area: the behaviour may simply not be built yet. That's a missing feature tracked by its own issue, not a bug. If an issue already covers it, show it to the user and stop, unless they say to continue.
3. Record the environment for the issue: `git rev-parse --short HEAD`, the branch name, `node --version` and `pnpm --version`.

## 2. Reproduce

The app is Next.js 16 + React 19 + TypeScript at the repo root, with Supabase, `next-intl` (`/vi/…`, `/en/…`), Vitest and Playwright. Scripts and layout: `README.md`. The expected behaviour comes from `docs/spec.md`, `docs/plan.md` and the mockups in `docs/design/`. Pick the cheapest method that actually demonstrates the bug:

| Bug kind                                             | How to reproduce                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static / code-level (wrong logic, types, config)     | Read the exact lines and quote them. Trace the data flow to show the failure path. Run `pnpm typecheck` if types are involved.                                                                                                                                                                                                                                              |
| Rules engine (`src/domain/`)                         | Write a probe Vitest test **in the scratchpad or a throwaway worktree**, with an input from the spec, and show the actual vs. the expected output. Quote the spec section.                                                                                                                                                                                                  |
| Tooling (lint, typecheck, build, tests, CI)          | Run the real command (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm i18n:check`) and capture the exit code and the relevant output. For CI, read the failing run with `gh run view <id> --log-failed`.                                                                                                                                                   |
| Database (schema, constraints, RLS, triggers)        | With the local stack up (`pnpm exec supabase status`; `pnpm db:start` if needed), run SQL against it (`psql` with the `DB_URL` from `pnpm exec supabase status -o env`, or Studio at http://127.0.0.1:54323). Test RLS as `anon` and `authenticated`. Don't `pnpm db:reset` without asking, because the stack is shared with other sessions. Clean up any rows you add. |
| Runtime UI behaviour                                 | Start `pnpm dev` (http://localhost:3000) in the background, drive it with the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`…), follow the repro steps in both locales if text is involved, then `browser_take_screenshot` and `browser_console_messages`. Stop the server (by PID, not `pkill -f`) and `browser_close` afterwards. |
| Config / env                                         | Run the app with and without the relevant setting. Show variable _names_, never values.                                                                                                                                                                                                                                                                                    |

Rules:

- **Don't change tracked source files to reproduce.** If you need a probe (a script, a test, a temporary edit), put it in the scratchpad or a throwaway worktree under `.claude/worktrees/`, and make sure `git status` is clean when you're done.
- **Redact secrets from all evidence.** The repo is public. Keys, `.env.local` values, JWTs, home paths, usernames and real people's names must not appear. Show variable _names_ or counts, never values.
- Save screenshots and log excerpts to the scratchpad. Keep log excerpts short, just the lines that prove the bug.

Reach one verdict:

- **Confirmed**: the bug was observed. Continue.
- **Confirmed (static)**: it can't be observed at runtime, but the code path is unambiguous. Continue, and say so in the issue.
- **Not a bug yet**: the behaviour belongs to a story or task that isn't done. Stop, and point to that issue.
- **Not reproduced**: the observed behaviour is correct. Stop and report what you ran and saw.
- **Blocked**: you couldn't run what was needed (Docker down, missing tool or permission). Stop and tell the user what's missing. Don't file the issue.

## 3. Choose title and labels

- Title: the symptom in user terms, under ~70 chars, in the same style as the existing issues (`gh issue list --limit 20`). Prefix the screen id if there is one, e.g. `P3 · Matches filter by court shows other courts`.
- Labels: run `gh label list` and pick only labels that exist: `bug`, plus the area labels that fit (`database`, `auth`, `i18n`, `domain`, `admin`, `public`, `infra`, `testing`, `accessibility`…). Don't create labels unless the user asks.
- Milestone: use the milestone of the story the bug belongs to, if any (`gh issue view <story> --json milestone`).

## 4. Draft the issue body

Write it to `<scratchpad>/issue-<slug>.md` using this template. Leave out sections that don't apply. Never write "N/A" padding.

```markdown
## Summary

<1–2 sentences: what is broken and who it affects (public viewers, BTC admins, referees).>

**Refs:** <spec §…, screen id, related story #n>
**Severity:** <High | Medium | Low>, <one-line justification>
**Verification:** <Confirmed by reproduction | Confirmed by code inspection> on `<short sha>` (`<branch>`), Node <ver>, pnpm <ver>

## Steps to reproduce

1. …
2. …

## Expected

<per the spec, quoted where it helps>

## Actual

…

## Evidence

<command + trimmed output in a code block, SQL + result, and/or screenshots, and/or console errors>

## Root cause

<the faulty code, with `path:line` references relative to the repo root and a short quoted snippet>

## Suggested fix

<the fix idea; note any related issues it interacts with>

## Affected files

- `src/...:<line>`

### Acceptance criteria

- [ ] <the expected behaviour, testable>
- [ ] <a regression test: Vitest for domain logic, SQL check for the database, Playwright for UI flows>
```

Screenshots: GitHub's API can't attach images to issues. If the repo has an `issue-assets` branch (`gh api "repos/{owner}/{repo}/branches/issue-assets"`), commit each image there and link it from **Evidence**:

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
DEST=<slug>/<image>.png   # e.g. locale-switcher-year/before.png
python3 -c 'import base64,json,sys; print(json.dumps({"message": "docs: add screenshot " + sys.argv[2], "branch": "issue-assets", "content": base64.b64encode(open(sys.argv[1], "rb").read()).decode()}))' \
  <scratchpad>/<image>.png "$DEST" > <scratchpad>/upload.json
gh api -X PUT "repos/$REPO/contents/$DEST" --input <scratchpad>/upload.json --jq .content.path
# markdown: ![<image>](https://github.com/<owner>/<repo>/blob/issue-assets/<DEST>?raw=true)
```

If the branch is missing (404), don't create it on your own. Describe what the screenshot shows in **Evidence**, leave the file in the scratchpad, and tell the user. Check every image for secrets and real names first, because everyone can see the repo.

## 5. Confirm

Unless `--yes` was passed, show the user the verdict, title, labels, milestone and the full body, and ask whether to create the issue, edit it, or cancel. Creating an issue is outward-facing, so don't skip this.

## 6. Create

```bash
gh issue create \
  --title "<title>" \
  --body-file <scratchpad>/issue-<slug>.md \
  --label "bug,<area>" \
  [--milestone "<milestone>"]
```

Then:

1. Report the issue number and URL that gh prints.
2. Check that `git status` is unchanged, that no throwaway worktree is left (`git worktree list`), and that no dev server is still running.
