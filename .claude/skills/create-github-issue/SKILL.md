---
name: create-github-issue
description: Verify a suspected bug by reproducing it, then file it as a GitHub issue with gh, including repro steps, evidence, affected files and a fix idea. Use when the user wants to turn a likely bug (e.g. an entry in docs/likely-bugs.md, or a free-text bug description) into a GitHub issue/ticket.
argument-hint: "<bug number from docs/likely-bugs.md | free-text bug description> [--yes]"
allowed-tools: Bash(gh auth status:*), Bash(gh repo view:*), Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh label list:*), Bash(git rev-parse:*), Bash(git status:*), Bash(node --version), Bash(pnpm --version)
---

# Create a GitHub issue from a likely bug

## Usage

Run it from the repo root in Claude Code:

```
/create-github-issue <bug number | "bug title" | free-text description> [--yes]
```

| Example                                                     | What it does                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/create-github-issue 1`                                    | Verifies bug #1 from `docs/likely-bugs.md`, then asks before filing it       |
| `/create-github-issue #12`                                  | Same, for bug #12 (the `#` is optional)                                      |
| `/create-github-issue "Search box doesn't filter"`          | Finds the `docs/likely-bugs.md` entry by its title                           |
| `/create-github-issue Delete button does nothing on Safari` | Treats the text as a new bug report and finds the code it points at          |
| `/create-github-issue 3 --yes`                              | Files without the confirmation step (still stops if the bug isn't confirmed) |

Before you start, you need `gh` logged in to github.com with access to the repo (`gh auth login`).

You get back the verdict and, once filed, the issue URL. For a bug from `docs/likely-bugs.md`, the entry gets an uncommitted `- **Issue:** <url>` line. Next step: `/resolve-github-issue <issue number> <base branch>`.

Input: `$ARGUMENTS`

The input is one of:

- A bug number or title from `docs/likely-bugs.md` (e.g. `1`, `#12`, `"Search box doesn't filter"`). Read that entry in full: Where, What, Repro, Fix idea, and any (verified)/(inferred) notes.
- A free-text bug description. Use it as-is, and look up the code it points at.

If `--yes` is present, skip the confirmation in step 5. Otherwise always confirm.

Work through the steps in order. **Never create an issue for a bug you couldn't reproduce or confirm.**

## 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner,defaultBranchRef`. If gh is missing, not authenticated, or can't see the repo behind `origin` (see `git remote -v`), stop and tell the user to run `gh auth login`.
2. Look for duplicates: `gh issue list --state all --search "<key words>"`. If an open or closed issue already covers this bug, show it to the user and stop, unless they say to continue.
3. Record the environment for the issue: `git rev-parse --short HEAD`, the branch name, `node --version` and `pnpm --version`.

## 2. Reproduce

The app lives in `practice-one/` (React + Vite + TypeScript, pnpm, Storybook 6.5). Pick the cheapest method that actually demonstrates the bug:

| Bug kind                                                                    | How to reproduce                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static / code-level (dead code, wrong props, bad class names, wrong config) | Read the exact lines and quote them. Trace the data flow to show the failure path. Run `pnpm build` (tsc) if types are involved.                                                                                                                                                                                                                                               |
| Tooling (lint, hooks, build, CI)                                            | Run the real command (`pnpm lint:eslint`, `pnpm build`, `ls -l .husky`, `git config core.hooksPath`…) and capture the exit code and the relevant output. For CI, read the failing run with `gh run view <id> --log-failed`.                                                                                                                                                    |
| Runtime UI behaviour                                                        | Start `pnpm dev` (http://localhost:3000) in the background, drive it with the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`…), follow the repro steps, then `browser_take_screenshot` and `browser_console_messages`. Fall back to the `claude-in-chrome` skill if Playwright isn't connected. Stop the server and `browser_close` afterwards. |
| Storybook                                                                   | `NODE_OPTIONS=--openssl-legacy-provider pnpm storybook` (needed on Node ≥ 17). Open the affected story ids.                                                                                                                                                                                                                                                                    |
| Network / config                                                            | Run the app with and without the relevant env var (e.g. `ROOT_URL`). Capture the request URLs, status codes and the visible result.                                                                                                                                                                                                                                            |

Rules:

- **Don't change tracked source files to reproduce.** If you need a probe (a script, a test, a temporary edit), put it in the scratchpad or a throwaway git worktree, and make sure `git status` is clean when you're done.
- **Redact secrets from all evidence.** Tokens, env values, home paths and usernames must not appear (this matters most for env-exposure bugs like #12). Show variable _names_ or counts, never values.
- Save screenshots and log excerpts to the scratchpad. Keep log excerpts short, just the lines that prove the bug.

Reach one verdict:

- **Confirmed**: the bug was observed. Continue.
- **Confirmed (static)**: it can't be observed at runtime, but the code path is unambiguous. Continue, and say so in the issue.
- **Not reproduced**: the observed behaviour is correct. Stop and report what you ran and saw. Offer to mark the entry in `docs/likely-bugs.md` as not reproduced.
- **Blocked**: you couldn't run what was needed (missing backend, tool, or permission). Stop and tell the user what's missing. Don't file the issue.

## 3. Choose title and labels

- Title: `[<Area>] <symptom in user terms>`, under ~70 chars. Example: `[Search] Typing in the search box doesn't filter books`.
- Labels: run `gh label list` and pick only labels that exist: a type (e.g. `bug`), and a severity/priority if the project has them. If the right labels don't exist, mention that and file without them. Don't create labels unless the user asks.

## 4. Draft the issue body

Write it to `<scratchpad>/issue-<slug>.md` using this template. Leave out sections that don't apply. Never write "N/A" padding.

```markdown
## Summary

<1–2 sentences: what is broken and who it affects.>

**Severity:** <High | Medium | Low>, <one-line justification>
**Verification:** <Confirmed by reproduction | Confirmed by code inspection> on `<short sha>` (`<branch>`), Node <ver>, pnpm <ver>

## Steps to reproduce

1. …
2. …

## Expected

…

## Actual

…

## Evidence

<command + trimmed output in a code block, and/or screenshots, and/or console errors>

## Root cause

<the faulty code, with `path:line` references relative to the repo root and a short quoted snippet>

## Suggested fix

<the fix idea; note any related bugs it interacts with, e.g. "fixing #14 will make #15 visible">

## Affected files

- `practice-one/src/...:<line>`

<sub>Source: docs/likely-bugs.md #<n></sub>
```

Screenshots: GitHub's API can't attach images to issues, so commit each one to the repo's `issue-assets` branch and link it from **Evidence**. Check every image for secrets first. Everyone who can see the repo can see the file.

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
DEST=<slug>/<image>.png   # e.g. search-box-filter/before.png
python3 -c 'import base64,json,sys; print(json.dumps({"message": "docs: add screenshot " + sys.argv[2], "branch": "issue-assets", "content": base64.b64encode(open(sys.argv[1], "rb").read()).decode()}))' \
  <scratchpad>/<image>.png "$DEST" > <scratchpad>/upload.json
gh api -X PUT "repos/$REPO/contents/$DEST" --input <scratchpad>/upload.json --jq .content.path
# markdown: ![<image>](https://github.com/<owner>/<repo>/blob/issue-assets/<DEST>?raw=true)
```

If the branch is missing (`gh api "repos/$REPO/branches/issue-assets"` returns 404), tell the user and file without the images instead of creating branches on your own. Screenshots from the GitLab era live on the `gitlab-uploads` branch; don't add to it.

## 5. Confirm

Unless `--yes` was passed, show the user the verdict, title, labels and the full body, and ask whether to create the issue, edit it, or cancel. Creating an issue is outward-facing, so don't skip this.

## 6. Create

```bash
gh issue create \
  --title "<title>" \
  --body-file <scratchpad>/issue-<slug>.md \
  --label "<label1>,<label2>"
```

Then:

1. Report the issue number and URL that gh prints.
2. If the bug came from `docs/likely-bugs.md`, add a `- **Issue:** <url>` line under that entry's heading, and change its marker to **(verified)** if reproduction confirmed it. Don't commit; tell the user the file changed.
3. Check that `git status` shows nothing besides that doc edit, and that no dev server or Storybook process is still running.
