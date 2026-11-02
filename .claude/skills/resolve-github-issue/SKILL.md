---
name: resolve-github-issue
description: Resolve one or more GitHub issues (story, task or bug) end to end. Branch off a given base branch, implement the change as small conventional commits, test it (lint, typecheck, unit tests, build, migrations, runtime check), push, and open a draft pull request for the user to review. With several issues, put overlapping ones in a single PR and keep independent ones in separate PRs. Use when the user wants an issue/ticket (number or URL), or several, resolved and turned into draft PRs.
argument-hint: "<issue number | issue URL> [<issue>...] <base branch> [--yes]"
allowed-tools: Bash(gh auth status:*), Bash(gh repo view:*), Bash(gh issue view:*), Bash(gh issue list:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh run view:*), Bash(git status:*), Bash(git fetch:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git ls-remote:*), Bash(node --version), Bash(pnpm --version)
---

# Resolve GitHub issues and open draft PRs

## Usage

Run it from the repo root in Claude Code:

```
/resolve-github-issue <issue number | issue URL> [<issue>...] <base branch> [--yes]
```

| Example                                                                                     | What it does                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/resolve-github-issue 12 dev`                                                              | Resolves #12 on a new branch off `dev` and asks once before pushing            |
| `/resolve-github-issue https://github.com/quannguyen-agilityio/abt-tournament/issues/12 dev` | Takes the issue number from the URL                                            |
| `/resolve-github-issue 8 9 dev`                                                             | Resolves #8 and #9: one PR if they overlap, two separate PRs if not (step 1.7) |
| `/resolve-github-issue 12 dev --yes`                                                        | Pushes and opens the draft PR without asking (only if all checks pass)         |

Before you start, you need:

- `gh` logged in to github.com with access to the repo, and SSH push access to `origin`.
- No uncommitted changes to tracked files. Untracked files are fine.
- Docker running, if the issue touches the database (local Supabase stack).

You get back one **draft** PR per group of issues, from `<type>/<number>-<slug>` into your base branch, with `Closes #<number>`, one entry per commit, and how it was tested. Review it on GitHub, then mark it ready and merge it yourself (or with `/merge-github-pr`). This skill never merges. Afterwards you're switched back to the branch you started on. If checks fail, nothing is pushed and the branch stays local for you to inspect.

Input: `$ARGUMENTS`

- **Issue:** a number (`12`, `#12`) or a URL (`…/issues/12`). Take the trailing number as the issue number. Several issues may be given (`8 9`, `#8 #9`). Then do steps 1.2–1.3 for each one, and step 1.7 decides how to group them.
- **Base branch:** the branch to start from and to target with the PR (usually `dev`, the default branch). If it's missing, ask. Don't guess.
- `--yes`: skip the confirmation before pushing in step 7.

Work through the steps in order. The end result is a **draft** PR. **Never merge, never push to the base branch, never force-push a branch you didn't create in this run.**

## Repo facts

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript at the repo root, Tailwind 4 + shadcn/ui, `next-intl` with locale-prefixed routes (`/vi/…`, `/en/…`), Supabase (Postgres + Auth, RLS), Vitest, Playwright. Layout and scripts: `README.md`. Product rules: `docs/plan.md` and `docs/spec.md`. Screen mockups: `docs/design/`.
- **This Next.js has breaking changes from what you know.** Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`) and heed deprecation notices. `AGENTS.md` may show up as a diff after `next dev` runs. Leave it out of your commits unless the user says otherwise.
- `src/domain/` is pure TypeScript: no `next`, `react` or `@supabase` imports (ESLint enforces it). The rules engine and its Vitest tests live there.
- Supabase clients: `src/lib/supabase/{client,server,admin}.ts`. `admin.ts` (service role, bypasses RLS) is for Server Actions only, after a `btc` role check.
- Schema changes are new SQL files in `supabase/migrations/` (`pnpm exec supabase migration new <name>`). Never edit a migration that's already on the base branch. After a schema change, `pnpm db:types` regenerates `src/lib/database.types.ts`, and the result is committed.
- **The repo is public.** Never commit `.env.local`, keys or real people's names. Seed data and fixtures use fake names (plan §5). Never run `supabase link` or `supabase db push`: remote projects aren't this skill's business.
- The repo allows **squash merge only**, and head branches are deleted after merge.
- There are no git hooks and no commitlint, so you do their job by hand (step 5).

## Gotchas in this environment

- **pnpm 11 deps check:** in a fresh worktree, or after switching to a base with a newer lockfile, `pnpm <script>` can abort in `runDepsStatusCheck`. Install as in step 3. If it still aborts, run scripts as `pnpm --config.verify-deps-before-run=false <script>`.
- **`pnpm install` can rewrite `pnpm-workspace.yaml`.** It adds placeholder `allowBuilds` entries such as `'@swc/core': set this to true or false`. Restore the file with `git checkout pnpm-workspace.yaml` and never commit that change. Never run `pnpm add`, `pnpm update` or `pnpm approve-builds` unless the issue needs a new dependency and the user agreed.
- **zsh doesn't word-split `$VAR`.** List files explicitly, for example `prettier --write a.ts b.ts`, never `$FILES`.
- **Don't `pkill -f <pattern>`.** The pattern matches the shell running the command and kills it. Find PIDs with `ps -eo pid,args | grep -E "next de[v]|next star[t]"` and `kill` them.
- **The local Supabase stack is shared** by every checkout and worktree on this machine. `pnpm db:reset` wipes the local database and recreates it from the migrations and the seed. If another session might be using it (e.g. the other lane in `docs/session-plan.md`), ask before resetting.

## 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner,defaultBranchRef`. If gh isn't authenticated or can't see the repo behind `origin` (see `git remote -v`), stop and tell the user to run `gh auth login`.
2. Read each issue in full: `gh issue view <number> --comments --json title,body,labels,state,milestone,comments`. Take note of:
   - the type from its labels (`story`, `task`, `bug`) and its area labels (`database`, `auth`, `i18n`, `domain`, `admin`, `public`, `infra`, `testing`, …)
   - the **Acceptance criteria** checklist, which is your definition of done
   - the **Refs** (e.g. `spec §3.1`, a screen id like `P8` or `A3`). Read those sections of `docs/spec.md`/`docs/plan.md` and the matching mockup in `docs/design/`.
   - for a bug: Steps to reproduce, Expected, Root cause, Suggested fix, Affected files
   - If the issue is closed, stop and ask whether to continue.
3. Look for existing work: `gh pr list --state all --search "<number> in:body"` and `git ls-remote --heads origin "*/<number>-*"`. If a PR or branch already exists for this issue, show it to the user and stop, unless they say to continue.
4. **Dependencies:** check that what the issue builds on is already on the base branch. Look at the tables and files the spec section relies on, any "depends on #n" in the issue, and the **Chờ merge** column of `docs/session-plan.md` if that file exists. If a prerequisite PR isn't merged yet, stop and tell the user. Don't stack a branch on an unmerged PR (see step 1.7 for why).
5. The working tree must have no modified tracked files (`git status --porcelain | grep -v '^??'`). If it does, stop and ask. Don't stash or discard the user's work. Untracked files are fine. Remember the current branch so you can switch back to it in step 8.
6. Check that the base branch exists: `git fetch origin` then `git rev-parse --verify origin/<base>`.
7. **Several issues: pick a grouping.** Separate PRs that touch the same files conflict as soon as the first one is merged. The repo only allows squash merges, so stacking one PR on another doesn't help either: the squash rewrites the first PR's commits, and the second PR conflicts anyway. So group issues **before** branching:
   - If the issues make up one row of `docs/session-plan.md` (e.g. "A3 · #8, #9"), that row is already planned as one session and one PR. Group them.
   - Otherwise, list the files each issue will likely change: its Affected files and spec refs, plus a quick grep of the code it names. Count this repo's hot spots too: `src/lib/database.types.ts` (regenerated whole by every schema change), `supabase/migrations/` and `supabase/seed.sql`, `messages/*.json`, `package.json`/`pnpm-lock.yaml`, `src/app/[locale]/layout.tsx` and shared shells, `src/proxy.ts`, `src/components/ui/`, config files.
   - **Combined:** put issues in **one branch and one PR** if their file sets overlap, if one depends on the other's change, or if one change would rewrite code the other touches. The commits stay separate per issue (step 4), so the PR can still be reviewed issue by issue.
   - **Separate:** keep issues that don't overlap at all in their own PRs. Run steps 2–8 once per group, one group after the other, each branched off `origin/<base>`.
   - Several groups are fine. For example, with #8, #9 and #20, #8 and #9 can go in one PR and #20 in its own.

   Tell the user the grouping in one short message, with the overlapping files that drove it, then carry on. Don't wait for an answer. In the steps below, `<number>` means every issue in the current group.

## 2. Create the branch

Name: `<type>/<number>-<slug>`

- `<type>`: the Conventional Commits type of the main change. `feat` for a story or a new capability, `fix` for a bug, and `chore`, `ci`, `test`, `docs` or `refactor` for tasks that are clearly one of those. Examples: `feat/7-core-tables-migration`, `fix/31-player-import-encoding`.
- `<slug>`: 3–5 lowercase, hyphenated words from the issue title, without prefixes like `P8 ·` or `[Area]`.
- Combined group: join the numbers and use a slug that covers all of them, e.g. `feat/8-9-match-tables-audit-log`.

```bash
git switch -c <branch> origin/<base>
```

Check that the work is still needed on this base: for a bug, the faulty code is still there; for a story or task, the acceptance criteria aren't already met. If it's already done, stop, switch back, delete the local branch, and report.

## 3. Dependencies and baseline

1. **Dependencies:** if `node_modules` is missing, or `pnpm-lock.yaml` differs from the one it was installed from (any `pnpm <script>` aborting in `runDepsStatusCheck` is the sign), run:
   ```bash
   pnpm install --frozen-lockfile --offline --config.strict-dep-builds=false \
     || pnpm install --frozen-lockfile --config.strict-dep-builds=false
   git checkout pnpm-workspace.yaml   # undo the allowBuilds placeholders, if any
   ```
   `--frozen-lockfile` never rewrites the lockfile.
2. **Baseline:** run the checks **before** changing anything, so you can tell failures that were already there from new ones. Save the output to the scratchpad.
   ```bash
   pnpm lint
   pnpm typecheck        # next typegen && tsc --noEmit
   pnpm format:check
   pnpm test             # Vitest, src/**/*.test.ts
   pnpm i18n:check       # if the script exists: messages/vi.json and en.json in sync
   pnpm build
   ```
3. **Database**, only if the issue touches the schema, the seed, RLS or data access: check `pnpm exec supabase status`. If the stack is down, `pnpm db:start` (Docker), and remember that you started it. Make sure `.env.local` exists with the local keys. If it doesn't, stop and tell the user to follow the README's Local setup. Don't create or print it.

## 4. Plan the commits

Break the work into small commits that each build on their own and are easy to review. For example: (1) the migration plus the regenerated types, (2) domain logic plus its tests, (3) the Server Action or data access, (4) the UI plus the `messages/` strings. A one-line fix is one commit. In a combined group, each commit belongs to exactly one issue (`Refs #<that issue>`). Do the issue the others depend on first. Write the plan in one short message to the user, mapping each acceptance criterion to a commit, then carry on. Don't wait for an answer.

Scope:

- Do what the issue and its acceptance criteria describe, following the spec. If the spec and the issue disagree, follow the spec and say so in the PR.
- Don't build related work the issue only mentions. List it under **Out of scope** in the PR.
- If the work needs a much bigger change than the issue suggests (a new dependency, a change to an existing migration, touching many unrelated files, or a spec decision that isn't written down), stop and ask before going on.
- Match the surrounding code: the `@/…` path alias, server components by default, the Supabase client that fits the context, `next-intl` messages for every user-facing string (both `vi` and `en`), Tailwind tokens from the theme, shadcn/ui components from `src/components/ui/`.
- Add Vitest tests for new logic in `src/domain/` and other pure helpers. Add or extend Playwright tests in `e2e/` only when the issue asks for it.

## 5. Implement, commit by commit

For each planned commit:

1. Make the change.
   - **Schema:** `pnpm exec supabase migration new <name>`, write the SQL, then `pnpm db:reset` (it must apply cleanly) and `pnpm db:types`. Commit the regenerated `src/lib/database.types.ts` with the migration.
2. Do what git hooks would do, on the files you touched only:
   ```bash
   pnpm exec prettier --write <changed files>
   pnpm exec eslint --fix <changed files>      # .ts/.tsx/.js/.mjs only
   pnpm typecheck
   ```
   Don't run `pnpm format` or `eslint --fix .` on the whole repo, because they would rewrite unrelated files.
3. Check that `git diff` contains only intended changes, then stage files by name. Never use `git add -A` or `git add .`: the repo root has untracked files that aren't yours, such as `docs/session-plan.md`.
4. Commit with a Conventional Commits message, matching the history (`git log --oneline -15`):

   ```
   <type>(<scope>): <imperative summary, lower case, no period, ≤ 72 chars>

   <why, wrapped at 72 cols, if not obvious>

   Refs #<number>
   ```

   The scope is the area: `db`, `supabase`, `auth`, `i18n`, `theme`, `domain`, `admin`, `public`, `ci`, … Add the commit attribution trailer the session requires.

## 6. Test carefully

All of these must pass before pushing. Save the output and screenshots to the scratchpad.

1. **Static and unit:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm i18n:check` (if it exists) and `pnpm build`. Nothing may be worse than the baseline: no new errors or warnings, every test passes, and the build succeeds.
2. **Database**, if you changed the schema, the seed or RLS: `pnpm db:reset` from scratch, then check each constraint, policy or trigger against the local database with SQL. Run it through `psql "$(pnpm exec supabase status -o env | sed -n 's/^DB_URL=//p' | tr -d '"')"`, or through Studio's SQL editor. Insert valid rows, prove that invalid rows are rejected, and check RLS as `anon` and as `authenticated` where it matters. Clean up any rows you added. Re-run `pnpm db:types` and confirm `git diff src/lib/database.types.ts` is empty, so the committed types match.
3. **Runtime**, if the change is visible in the app: start `pnpm dev` in the background (http://localhost:3000; check the port is free first) and drive it with the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, …). The server runs `--isolated`, so every session starts with no cookies.
   - Walk through every acceptance criterion (for a bug, the Steps to reproduce) under both `/vi/…` and `/en/…` when strings changed. Check light and dark theme and a phone-width viewport (`browser_resize`) when the UI changed. Compare against the mockup in `docs/design/`.
   - Take a screenshot of the result with `browser_take_screenshot`, and check `browser_console_messages` for new errors or hydration warnings.
   - Also check neighbouring behaviour the change could break, such as the locale switcher, navigation in the shell, and other pages that read the same table.
   - Admin pages need a signed-in user. Use a fake account from the seed. Never use real credentials.
4. **E2E:** if you touched `e2e/` or the issue asks for it, stop the dev server first and run `pnpm test:e2e`. Its `webServer` builds the app and runs `pnpm start` on port 3000. If the browsers are missing, run `pnpm exec playwright install chromium` once.
5. Stop every server you started (by PID, see Gotchas) and run `browser_close`. Stop the Supabase stack only if you started it in step 3.

If something fails, fix it with a new commit (or amend the commit that caused it, since nothing has been pushed yet) and repeat this step. If you can't get it green, **don't push**. Report what fails and leave the branch local.

If the change can't be seen at runtime (types, config, a pure domain function), say so and rely on the tests plus a quoted before/after.

## 7. Push and open the draft PR

Unless `--yes` was passed, show the user the branch, `git log --oneline origin/<base>..HEAD`, `git diff --stat origin/<base>` and the test summary, and ask before pushing. Pushing and creating a PR are outward-facing.

Write the PR description to `<scratchpad>/pr-<number>.md` (combined group: `pr-8-9.md`):

```markdown
## Summary

<1–2 sentences: what this adds or fixes, with spec refs.>

Closes #<number>
<combined group: one `Closes #<n>` line per issue, plus a line on why they share a PR (the overlapping files)>

## Changes

- `<short sha>` <commit subject>: <one line on what and why>
- …

## How it was tested

- Acceptance criteria: <each criterion → how it was verified>
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: <result vs. baseline>
- Database: <db:reset, SQL checks run, RLS checks>
- Runtime: <pages and steps followed, locales and themes, what was observed; combined group: one line per issue>

## Out of scope / follow-ups

- <related issues or work noticed but not done, with issue numbers>

## Reviewer notes

<deviations from the issue or spec, trade-offs, decisions the spec didn't cover, anything to look at closely>
```

Leave out sections that don't apply. Screenshots: GitHub's API can't attach images to a PR body. If the repo has an `issue-assets` branch (`gh api "repos/{owner}/{repo}/branches/issue-assets"`), upload them the same way as `/create-github-issue` step 4. If it doesn't, describe what the screenshots show and leave the files in the scratchpad for the user. Check every image for secrets and real names first, because the repo is public.

End the PR description with the pull request attribution line the session requires.

```bash
git push -u origin <branch>
gh pr create --draft \
  --head <branch> --base <base> \
  --title "<first commit subject, or a summary in the same conventional style>" \
  --body-file <scratchpad>/pr-<number>.md
```

The PR title becomes the squash commit on the base branch, so make it a valid Conventional Commits subject.

Confirm with `gh pr view <branch> --json number,isDraft,baseRefName,url`: `isDraft: true` and the right base branch. GitHub only closes the issue on merge when the base is the repo's default branch (`dev`). If it isn't, say so in the report.

**CI:** if `.github/workflows/` has a workflow that runs on `pull_request`, watch it with `gh pr checks <branch> --watch --interval 60`. If a job fails, read it with `gh run view <run id> --log-failed`, fix it with a new commit and push again. If there's no PR workflow yet (only the keep-alive cron), say so: the local checks are the only gate.

## 8. Wrap up

1. Report the PR URL, the branch, the commits, a one-line test summary, the CI result, and which acceptance criteria are met. With several groups, report each PR and say which issues it closes. If separate PRs still share a file after all, name it and suggest merging them one at a time with `/merge-github-pr` (it checks the remaining PRs for conflicts after each merge).
2. Switch back to the branch the user started on (`git switch <original>`). Check that `git status` matches what it was in step 1, and that no dev server is still running.
