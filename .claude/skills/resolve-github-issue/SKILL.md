---
name: resolve-github-issue
description: Fix a GitHub issue end to end. Branch off a given base branch, implement the fix as small conventional commits, test it (lint, build, runtime repro), push, and open a draft pull request for the user to review. Use when the user wants an issue/ticket (number or URL) resolved and turned into a draft PR.
argument-hint: "<issue number | issue URL> <base branch> [--yes]"
allowed-tools: Bash(gh auth status:*), Bash(gh repo view:*), Bash(gh issue view:*), Bash(gh issue list:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh run view:*), Bash(git status:*), Bash(git fetch:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git ls-remote:*), Bash(node --version), Bash(pnpm --version)
---

# Resolve a GitHub issue and open a draft PR

## Usage

Run it from the repo root in Claude Code:

```
/resolve-github-issue <issue number | issue URL> <base branch> [--yes]
```

| Example                                                                                       | What it does                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/resolve-github-issue 3 sample-project`                                                      | Fixes issue #3 on a new branch off `sample-project` and asks once before pushing |
| `/resolve-github-issue #3 main`                                                               | Same, branching off and targeting `main`                                         |
| `/resolve-github-issue https://github.com/quannguyen-agilityio/claude-training/issues/3 main` | Takes the issue number from the URL                                              |
| `/resolve-github-issue 3 sample-project --yes`                                                | Pushes and opens the draft PR without asking (only if all tests pass)            |

Before you start, you need:

- `gh` logged in to github.com with access to the repo, and SSH push access to `origin`.
- No uncommitted changes to tracked files. Untracked files are fine.
- An issue filed with enough detail, ideally by `/create-github-issue`.

You get back a **draft** PR from `fix/<number>-<slug>` into your base branch, with `Closes #<number>`, one entry per commit, and how it was tested. Review it on GitHub, then mark it ready and merge it yourself (or with `/merge-github-pr`). This skill never merges. Afterwards you're switched back to the branch you started on. If tests fail, nothing is pushed and the branch stays local for you to inspect.

Input: `$ARGUMENTS`

- **Issue:** a number (`3`, `#3`) or a URL (`…/issues/3`). Take the trailing number as the issue number.
- **Base branch:** the branch to start from and to target with the PR (e.g. `sample-project`, `main`). If it's missing, ask. Don't guess.
- `--yes`: skip the confirmation before pushing in step 7.

Work through the steps in order. The end result is a **draft** PR. **Never merge, never push to the base branch, never force-push a branch you didn't create in this run.**

## 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner,defaultBranchRef`. If gh isn't authenticated or can't see the repo behind `origin` (see `git remote -v`), stop and tell the user to run `gh auth login`.
2. Read the issue in full: `gh issue view <number> --comments`. Take note of Steps to reproduce, Expected, Root cause, Suggested fix, Affected files, and anything related it mentions.
   - If the issue is closed, stop and ask whether to continue.
3. Look for existing work: `gh pr list --state all --search "<number> in:body"` and `git ls-remote --heads origin "*/<number>-*"`. If a PR or branch already exists for this issue, show it to the user and stop, unless they say to continue.
4. The working tree must have no modified tracked files (`git status --porcelain | grep -v '^??'`). If it does, stop and ask. Don't stash or discard the user's work. Untracked files are fine. Remember the current branch so you can switch back to it in step 8.
5. Check that the base branch exists: `git fetch origin` then `git rev-parse --verify origin/<base>`.

## 2. Create the branch

Name: `<type>/<number>-<slug>`

- `<type>`: `fix` for bugs. Use `feat`, `refactor`, `chore` or `docs` only if the issue clearly is one of those.
- `<slug>`: 3–5 lowercase, hyphenated words from the issue title, without the `[Area]` prefix. Example: issue #3 `[Search] Typing in the search box doesn't filter books` becomes `fix/3-search-box-filter`.

```bash
git switch -c <branch> origin/<base>
```

Check that the bug is still present on this base: the faulty code from the issue's Root cause is still there. If it's already fixed, stop, switch back, delete the local branch, and report.

## 3. Baseline

The app lives in `practice-one/` (React 18 + Vite 4 + TypeScript, pnpm, Storybook 6.5). Run the static checks **before** changing anything, so you can tell pre-existing failures apart from new ones. Save the output to the scratchpad.

> **pnpm:** `pnpm-lock.yaml` is lockfile v5.4. The installed pnpm (11) rejects it and tries to reinstall `node_modules` before every script, which aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. So every `pnpm` script or `exec` in this skill goes through `pnpm --config.verify-deps-before-run=false …`. **Never run `pnpm install`** as part of a fix, because it would rewrite the lockfile and `node_modules`.

```bash
cd practice-one
rm -rf dist                     # a stale dist/ makes ESLint report thousands of errors
pnpm --config.verify-deps-before-run=false lint:eslint                # record the error/warning counts
pnpm --config.verify-deps-before-run=false build                      # tsc && vite build
rm -rf dist
```

The project has **no unit-test runner**. Don't add one unless the user asks.

## 4. Plan the commits

Break the fix into small commits that each build on their own and are easy to review, for example: (1) the store/action change, (2) the UI wiring, (3) a follow-up hardening the issue calls for. A one-line fix is one commit. Write the plan in one short message to the user, then carry on. Don't wait for an answer.

Scope:

- Fix what the issue describes. Follow its Suggested fix unless you find it's wrong, and explain why in the PR if you deviate.
- Don't fix related bugs it only mentions (e.g. "see likely-bugs #3"). List them under **Out of scope** in the PR.
- If a correct fix needs a much bigger change than the issue suggests (new dependency, API change, touching many unrelated files), stop and ask before going on.
- Match the surrounding code style: path aliases (`@components/…`), Tailwind classes, the `useCallback` pattern in `stores/book/index.tsx`, and so on.

## 5. Implement, commit by commit

For each planned commit:

1. Make the change.
2. Run the checks on the changed files. The Husky hooks in `practice-one/.husky` aren't executable, so **they don't run. Do what they would do by hand**, but only on the files you touched. The real hook runs `eslint --fix .` on the whole project, which would rewrite unrelated files.
   ```bash
   pnpm --config.verify-deps-before-run=false exec eslint --fix <changed files>
   pnpm --config.verify-deps-before-run=false exec tsc --noEmit
   ```
3. Check that `git diff` contains only intended changes, then stage files by name. Never use `git add -A` or `git add .` (the repo root has untracked files that aren't yours).
4. Commit with a Conventional Commits message (commitlint `config-conventional`):

   ```
   <type>(<scope>): <imperative summary, lower case, no period, ≤ 72 chars>

   <why, wrapped at 72 cols, if not obvious>

   Refs #<number>
   ```

   Add the commit attribution trailer the session requires. Validate the message before committing, because the commit-msg hook won't run: `printf '%s\n' "<message>" | pnpm --config.verify-deps-before-run=false exec commitlint --config=commitlint.config.cjs`.

The last commit may use `Closes #<number>` instead of `Refs`, but the PR description already closes the issue, so `Refs` everywhere is fine.

## 6. Test carefully

All of these must pass before pushing. Save the output and screenshots to the scratchpad.

1. **Static:** `rm -rf dist && pnpm --config.verify-deps-before-run=false lint:eslint`, then `pnpm --config.verify-deps-before-run=false build`, then `rm -rf dist`. ESLint must show no new errors or warnings compared with the baseline, and the build must succeed.
2. **Runtime repro:** follow the issue's Steps to reproduce on the fixed code and confirm the Expected behaviour.
   - No backend is needed: data comes from `MockDb` (seeded from `src/data/books.json`, persisted to `localStorage`). Start the app with `pnpm --config.verify-deps-before-run=false dev` (http://localhost:3000). Don't create or edit `.env`.
   - Drive the page with the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`…). The server runs `--isolated`, so every session starts from the seed data. Check the visible result, take one screenshot of the fixed behaviour with `browser_take_screenshot`, and check `browser_console_messages` for new errors. Fall back to the `claude-in-chrome` skill if Playwright isn't connected.
   - Also check neighbouring behaviour the change could break (e.g. for search: category filter and sort still work, clearing the box restores the full list, the mobile search bar works too).
3. **Storybook:** only if you changed a component that has a story. Run `NODE_OPTIONS=--openssl-legacy-provider pnpm --config.verify-deps-before-run=false storybook` and open the affected stories. Some stories are already broken (likely-bugs #9). Only regressions count.
4. Stop every server you started (the dev server, Storybook), run `browser_close`, and delete `dist/`.

If something fails, fix it with a new commit (or amend the commit that caused it, since nothing has been pushed yet) and repeat this step. If you can't get it green, **don't push**. Report what fails and leave the branch local.

If the change can't be observed at runtime (types, config, dead code), say so and rely on the static checks plus a quoted before/after.

## 7. Push and open the draft PR

Unless `--yes` was passed, show the user the branch, `git log --oneline origin/<base>..HEAD`, `git diff --stat origin/<base>` and the test summary, and ask before pushing. Pushing and creating a PR are outward-facing.

Write the PR description to `<scratchpad>/pr-<number>.md`:

```markdown
## Summary

<1–2 sentences: what was broken and what this changes.>

Closes #<number>

## Changes

- `<short sha>` <commit subject>: <one line on what and why>
- …

## How it was tested

- `pnpm lint:eslint`: <result vs. baseline>
- `pnpm build`: passed
- Runtime: <steps followed, against what backend, what was observed>
- Regression checks: <what else was exercised>

<screenshot markdown>

## Out of scope / follow-ups

- <related issues/bugs noticed but not fixed>

## Reviewer notes

<deviations from the issue's suggested fix, trade-offs, anything to look at closely>
```

Add screenshots the same way as `/create-github-issue` step 4 (commit them to the `issue-assets` branch and link the `?raw=true` URL). Check them for secrets, tokens and home paths first. Leave out sections that don't apply.

End the PR description with the pull request attribution line the session requires.

```bash
git push -u origin <branch>
gh pr create --draft \
  --head <branch> --base <base> \
  --title "<first commit subject, or a summary in the same conventional style>" \
  --body-file <scratchpad>/pr-<number>.md
```

Confirm with `gh pr view <branch> --json number,isDraft,baseRefName,url`: `isDraft: true` and the right base branch. GitHub only closes the issue on merge when the base is the repo's default branch; if it isn't, say so in the report.

The push starts the **CI** workflow (`.github/workflows/ci.yml`: lint and build). Check it with `gh pr checks <branch> --watch` (or come back to it later). If a job fails, read it with `gh run view <run id> --log-failed`, fix it with a new commit and push again. Report the CI result with the PR.

## 8. Wrap up

1. Report the PR URL, the branch, the commits, a one-line test summary and the CI result.
2. Switch back to the branch the user started on (`git switch <original>`). Check that `git status` matches what it was in step 1, and that no dev server or Storybook process is still running.
3. If the issue came from `docs/likely-bugs.md`, suggest adding a `- **PR:** <url>` line under that entry. Don't edit it on the fix branch.
