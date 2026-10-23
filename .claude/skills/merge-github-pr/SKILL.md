---
name: merge-github-pr
description: Merge a GitHub pull request safely. Check that it is mergeable (draft, reviews, unresolved threads, CI checks), resolve merge conflicts locally in an isolated worktree if there are any, test the merge result (lint, build, runtime smoke), then merge exactly the tested commit and verify the linked issues closed. Use when the user wants a PR (number or URL) merged, or its conflicts resolved.
argument-hint: "<PR number | PR URL> [--yes]"
allowed-tools: Bash(gh auth status:*), Bash(gh repo view:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr diff:*), Bash(gh pr checks:*), Bash(gh run view:*), Bash(gh issue view:*), Bash(git status:*), Bash(git fetch:*), Bash(git log:*), Bash(git diff:*), Bash(git show:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git ls-remote:*), Bash(git merge-base:*), Bash(git worktree list:*)
---

# Merge a GitHub PR, resolving conflicts if needed

## Usage

Run it from the repo root in Claude Code:

```
/merge-github-pr <PR number | PR URL> [--yes]
```

| Example                                                                            | What it does                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/merge-github-pr 24`                                                              | Checks PR #24, resolves conflicts if any, tests, and asks once before merge |
| `/merge-github-pr #24`                                                             | Same (the `#` is optional)                                                  |
| `/merge-github-pr https://github.com/quannguyen-agilityio/claude-training/pull/24` | Takes the PR number from the URL                                            |
| `/merge-github-pr 24 --yes`                                                        | Pushes the conflict resolution and merges without asking, if all tests pass |

Before you start, you need:

- `gh` logged in to github.com with access to the repo, and SSH push access to `origin` (only needed if there are conflicts).
- A PR you have reviewed. Usually it comes from `/resolve-github-issue`. This skill checks that the merge is _safe_. It doesn't replace your code review.

Your working tree is never touched. Conflict resolution happens in a throwaway `git worktree`, so uncommitted changes and your current branch stay as they are.

You get back the merged PR's URL, the merge commit, how conflicts were resolved (if any), whether the linked issues closed, and whether the remote head branch was deleted. If anything fails, nothing is merged and you get told why.

Input: `$ARGUMENTS`

- **PR:** a number (`24`, `#24`) or a URL (`…/pull/24`). Take the trailing number as the PR number.
- `--yes`: skip the confirmations before pushing a conflict resolution (step 3.9) and before merging (step 5). It does **not** cover a draft PR, marking a draft ready always needs a yes (step 2). It also never overrides a stop condition.

Work through the steps in order.

**Hard rules:**

- Never push to the base branch.
- Never force-push, and never rebase a branch that's already pushed. Conflicts are resolved by merging the base into the head branch.
- Never bypass required reviews, unresolved review threads or failing checks (no `--admin`). Never merge a commit you didn't test (always pass `--match-head-commit`).
- Never delete branches yourself with `git push --delete` or the API, and don't pass `--delete-branch` to `gh pr merge` (it also deletes and switches the user's local branch). The remote head branch is removed by the repo's "Automatically delete head branches" setting. Never delete a local branch unasked.

## Gotchas in this environment

- **zsh doesn't word-split `$VAR`.** List files explicitly instead of `eslint --fix $FILES`.
- **zsh treats `$VAR:x` as a modifier** (`:r`, `:h`, `:t`, `:a`…), so `"$SHA:refs/heads/x"` silently becomes something else. Always write `"${SHA}:refs/heads/x"`.
- **Never name a zsh variable `path`.** It's tied to `$PATH`; `read … path` wipes it and every following command fails with "command not found".
- **Don't `pkill -f <pattern>`.** The pattern matches the shell running the command and kills it. Find PIDs with `ps -eo pid,args | grep -E "storyboo[k]|vite/bin/vit[e]"` and `kill` them.
- **pnpm:** every script goes through `pnpm --config.verify-deps-before-run=false …`. **Never run `pnpm install`** (see `/resolve-github-issue` step 3 for why).

## 1. Preflight

1. Run `gh auth status` and `gh repo view --json nameWithOwner,defaultBranchRef`. If gh isn't authenticated or can't see the repo behind `origin` (see `git remote -v`), stop and tell the user to run `gh auth login`.
2. Load the PR:
   ```bash
   gh pr view <n> --json number,title,state,isDraft,headRefName,baseRefName,headRefOid,isCrossRepository,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,url,body
   ```
   - `state` is `MERGED`: report it and stop. `CLOSED`: stop and ask whether to reopen. That's out of scope by default.
   - `isCrossRepository: true` (fork PR): you can merge it if there are no conflicts, but you can't push a resolution to it. If it has conflicts, stop and ask the author to resolve them.
3. Load the repo's merge settings and the base branch's protection:
   ```bash
   gh api "repos/{owner}/{repo}" --jq '{default_branch, allow_merge_commit, allow_squash_merge, allow_rebase_merge, delete_branch_on_merge}'
   gh api "repos/{owner}/{repo}/branches/<base>/protection"   # 404, or 403 "Upgrade to GitHub Pro" on a free private repo: no protection
   ```
4. Read the context:
   - Commits: `gh pr view <n> --json commits --jq '.commits[] | "\(.oid[0:7]) \(.messageHeadline)"'`.
   - Changed files: `git diff --stat origin/<base>...origin/<head>` after `git fetch origin`.
   - Linked issues and unresolved review threads (gh 2.63 has no `--json` field for either, so use GraphQL):
     ```bash
     gh api graphql -F owner='{owner}' -F repo='{repo}' -F n=<n> -f query='
       query($owner: String!, $repo: String!, $n: Int!) {
         repository(owner: $owner, name: $repo) { pullRequest(number: $n) {
           closingIssuesReferences(first: 20) { nodes { number state } }
           reviewThreads(first: 100) { nodes { isResolved path line
             comments(first: 1) { nodes { author { login } body } } } } } } }' \
       --jq '.data.repository.pullRequest | {closes: .closingIssuesReferences.nodes, unresolved: [.reviewThreads.nodes[] | select(.isResolved | not)]}'
     ```

   You'll need this to resolve conflicts in a way that keeps the PR's intent.

5. Remember the user's current branch and `git status --porcelain`, so you can confirm in step 7 that they're unchanged.

## 2. Decide what's blocking

Re-read `mergeable` and `mergeStateStatus`. If either is `UNKNOWN`, GitHub is still computing it: wait a few seconds and re-read, up to ~30 s. Then act on the status:

| Status                                                       | Action                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLEAN` or `HAS_HOOKS`                                       | Go to step 4, unless step 1.4 found unresolved review threads (then stop, as for `BLOCKED`).                                                                                                                                                                                             |
| `DRAFT` (`isDraft: true`)                                    | The PR is a draft, which means someone wanted a review before merging. Ask the user whether they've reviewed it and want it marked ready, even with `--yes`. If yes, run `gh pr ready <n>`, verify `isDraft: false`, and re-evaluate. If no, stop.                                       |
| `DIRTY` (`mergeable: CONFLICTING`)                           | Go to step 3.                                                                                                                                                                                                                                                                            |
| `BEHIND`                                                     | The base's protection requires the head to contain the latest base. Go to step 3. Merging the base in satisfies it with no history rewrite. Use `gh pr update-branch <n>` only if the user explicitly prefers GitHub to make that merge.                                                 |
| `BLOCKED`                                                    | Find out why and stop: `reviewDecision` is `REVIEW_REQUIRED` or `CHANGES_REQUESTED` (say who needs to approve or what was asked), unresolved threads (list author, file:line, first line; resolving them is the reviewer's call), or required checks pending/failing (see the next row). |
| `UNSTABLE`, or checks pending/failing in `statusCheckRollup` | Run `gh pr checks <n>`. If checks are running, watch them until they finish (`gh pr checks <n> --watch --interval 60`, no tight polling). If any failed, stop and show the failed jobs (`gh run view <run id> --log-failed`, trimmed). Don't re-run or skip them.                        |
| anything else                                                | Stop and report the status as-is.                                                                                                                                                                                                                                                        |

Even when GitHub says `CLEAN`, a PR that's been open for a while may be well behind the base. That's fine. Step 4 tests the actual merge result.

## 3. Resolve conflicts in a worktree

Only when step 2 sent you here. Work in the scratchpad:

```bash
git fetch origin
WT=<scratchpad>/merge-<n>
git worktree add --detach "$WT" origin/<head>
ln -s "$PWD/practice-one/node_modules" "$WT/practice-one/node_modules"   # lint/build need it; never pnpm install
```

The worktree is **detached** on `origin/<head>`, so it works even if the user has the head branch checked out. If the user has a local `<head>` branch that's ahead of `origin/<head>` (`git log origin/<head>..<head>`), stop and ask. They have unpushed work on it.

1. **Baseline** (before merging, so you can tell new failures from old ones): in `$WT/practice-one`, run `rm -rf dist && pnpm --config.verify-deps-before-run=false lint:eslint` and record the counts. Run the same on `origin/<base>` too (`git -C "$WT" switch --detach origin/<base>`, lint, then switch back to `origin/<head>`). The merged result must be no worse than the worse of the two.
2. **Merge:** `git -C "$WT" merge --no-ff --no-commit origin/<base>`. List the conflicted files with `git -C "$WT" diff --name-only --diff-filter=U`.
3. **Understand both sides before editing each file:**
   - `git log --oneline $(git merge-base origin/<head> origin/<base>)..origin/<base> -- <file>` shows what the base changed, and why. Read those commits and their PRs.
   - The same command with `..origin/<head>` shows what this PR changed.
   - `git -C "$WT" diff <file>` shows the conflict, with both sides (use `git checkout --conflict=diff3 <file>` to see the merge base as well).
4. **Resolve each hunk so both intents survive.** Keep the PR's fix _and_ the base's change, adapted to each other. For example: the base renamed a function the PR calls, so the PR's code uses the new name. The base added a reducer case next to the PR's, so keep both cases.
   - Take one side wholesale only if the other side's change is truly superseded (e.g. the base already contains the same fix). Say so in the merge commit body.
   - Also check **non-conflicting semantic breaks**. Files that merged cleanly can still break: a call to something the other side removed, a type that changed shape, a duplicated import. `tsc` catches most of these. Grep for the symbols both sides touched.
   - Match the surrounding style (path aliases, Tailwind, the `useCallback` pattern in `stores/book/index.tsx`).
5. **Stop and ask** (show both sides and your proposed resolution) when:
   - Both sides changed the same logic in incompatible ways and you can't keep both behaviours.
   - The conflict is in `package.json`, `pnpm-lock.yaml` or any lockfile. You can't regenerate a lockfile here.
   - A conflicted file is binary, or one side deleted a file the other modified.
   - The resolution needs code beyond reconciling the two sides (new logic, new dependency, touching unrelated files).
6. **Check the resolution:**
   ```bash
   cd "$WT/practice-one"
   git -C "$WT" diff --check                          # leftover markers / whitespace
   grep -rnE '^(<<<<<<<|=======|>>>>>>>)( |$)' . --exclude-dir=node_modules || true
   pnpm --config.verify-deps-before-run=false exec eslint --fix <resolved files under practice-one, listed explicitly>
   pnpm --config.verify-deps-before-run=false exec tsc --noEmit
   ```
   The husky hooks don't run (they aren't executable), so this is the hook's job done by hand, on the resolved files only.
7. **Commit the merge.** Stage the resolved files by name, then `git -C "$WT" commit` with:

   ```
   Merge branch '<base>' into <head>

   Resolve conflicts with <base>:
   - <file>: <what each side did and how they were combined>

   Refs #<n>

   <commit attribution trailer the session requires>
   ```

   commitlint's config-conventional ignores `Merge …` subjects by default. Validate anyway with `printf '%s\n' "<message>" | pnpm --config.verify-deps-before-run=false exec commitlint --config=commitlint.config.cjs`.

8. **Test the merge result.** Do all of step 4's checks inside `$WT`. Also exercise the areas where the conflicts were, not just the PR's own feature.
9. **Push** (ask first unless `--yes`). Show the user the conflicted files, a one-line resolution per file, `git -C "$WT" show --stat HEAD`, and the test summary. Then:
   ```bash
   git -C "$WT" push origin "HEAD:refs/heads/<head>"
   ```
   This is a plain fast-forward push. If it's rejected, someone pushed to the head branch meanwhile. **Don't force.** Fetch, start step 3 over from the new `origin/<head>`, and tell the user.
10. Re-read the PR until `headRefOid` equals your pushed `HEAD` and `mergeStateStatus` settles. The push re-runs CI, so go back to step 2 and wait for the checks.

## 4. Test the merge result

CI (`.github/workflows/ci.yml`) only runs lint and build, so this local check is still the gate for runtime behaviour. Test **what will actually land on the base**, not just the head branch:

- If step 3 ran and its tests (3.8) passed on the exact commit you pushed, this step is done. Go to step 5.
- Otherwise, create a worktree and simulate the merge:
  ```bash
  git worktree add --detach "$WT" origin/<base>
  ln -s "$PWD/practice-one/node_modules" "$WT/practice-one/node_modules"
  git -C "$WT" merge --no-ff --no-commit origin/<head>     # must apply cleanly
  ```

Then run these in `$WT/practice-one`:

1. **Static:** `rm -rf dist && pnpm --config.verify-deps-before-run=false lint:eslint`, then `pnpm --config.verify-deps-before-run=false build`, then `rm -rf dist`. No new ESLint errors or warnings compared with `origin/<base>`'s baseline (step 3.1, or run it now), and the build passes.
2. **Runtime smoke:** run it if the PR changes runtime code under `src/`. Start the dev server and drive it with the Playwright MCP tools exactly as in `/resolve-github-issue` step 6 (no backend, http://localhost:3000, `--isolated` browser). Run the dev server from `$WT/practice-one`.
   - Re-run the PR's "How it was tested" steps from its description, and confirm they still hold on the merged code.
   - If there were conflicts, also exercise the base-side feature that conflicted.
   - Check the console for new errors.
   - Skip this check for docs-only or config-only PRs, and say so.
3. Stop every server you started (by PID, see Gotchas). Remove the worktree with `git worktree remove --force "$WT" && git worktree prune`.

If anything fails, **don't merge.**

- If you made the conflict resolution in step 3, fix it with a new commit on the worktree before pushing, or with a follow-up commit pushed the same way, never amend after pushing.
- If the failure is in the PR's own code (no conflicts involved), stop and report it. Fixing the PR is the author's job, or a job for `/resolve-github-issue`.

## 5. Merge

Re-read the PR once more. `mergeStateStatus` must be `CLEAN` (or `HAS_HOOKS`), the checks must have passed, and `headRefOid` must equal the commit you tested (the head; after step 3, your pushed merge commit). If `headRefOid` changed, go back to step 2. New commits haven't been tested.

Unless `--yes` was passed, show the user the following and ask before merging:

- `#<n>` title, `<head>` → `<base>`
- The commits (`git log --oneline origin/<base>..origin/<head>`) and `git diff --stat origin/<base>...origin/<head>`
- The merge options:
  - Method: a merge commit (`--merge`) if `allow_merge_commit` is on; otherwise the one the repo allows (`--squash` or `--rebase`). Use squash or rebase only if the user asks, or if it's the only method allowed.
  - Head branch deletion: happens automatically when `delete_branch_on_merge` is on. If it's off, say the branch will stay and that the user can delete it on the PR page.
- Linked issues that will close.
- The CI result and the local test summary.

Merging is outward-facing and effectively irreversible.

```bash
gh pr merge <n> --merge --match-head-commit <tested sha>
```

Don't add `--admin`, `--auto`, `--delete-branch`, or a custom `--subject`/`--body` unless the user asks. Keep GitHub's default merge commit message, which references the PR.

Verify with `gh pr view <n> --json state,mergeCommit,mergedAt`: `state: MERGED`, and note `mergeCommit.oid` and `mergedAt`.

- If the merge was refused (gh exits non-zero, or the state is still `OPEN`), re-read `mergeStateStatus`, report it, and go back to step 2 once.
- Don't retry blindly.

## 6. After the merge

1. `git fetch origin --prune`. Confirm the merge commit is on `origin/<base>` (`git branch -r --contains <merge sha>`).
2. **Linked issues:** for each issue in `closes` (step 1.4), check `gh issue view <i> --json state` → `CLOSED`. GitHub only auto-closes issues when the PR merges into the repo's **default branch**. If the base isn't the default branch, or an issue is still open, tell the user and offer to close it with `gh issue close <i> --reason completed --comment "Fixed by #<n>"`. Don't close it without asking.
3. **Head branch:** confirm it's gone with `git ls-remote --heads origin <head>` (`git fetch --prune` above already dropped `origin/<head>`). If it still exists, report it; don't delete it yourself. If the user has a local `<head>` branch that's now merged (`git branch --merged origin/<base>`), offer `git branch -d <head>`. Don't run it unasked.
4. **Local base:** if the user's local `<base>` is behind `origin/<base>`, mention it (e.g. `git pull --ff-only` when they're on it). Don't pull for them, since their tree may have uncommitted work.
5. **CI on the base:** the merge commit triggers a CI run on `<base>`. Mention its URL (`gh run list --branch <base> --limit 1`); you don't need to wait for it.

## 7. Wrap up

1. Report:
   - The PR URL, `<head>` → `<base>`, and the merge commit sha.
   - Whether conflicts were resolved: one line per file, plus the commit that resolved them.
   - The CI result and a one-line local test summary.
   - The linked issues' state.
   - Whether the remote head branch was deleted (or why it was kept).
2. Check that the user's branch and `git status --porcelain` match step 1.5, that `git worktree list` shows no leftover worktree, and that no dev server or Storybook process is still running.
3. If the PR came from `docs/likely-bugs.md` (the issue says `Source: docs/likely-bugs.md #<n>`), suggest marking that entry fixed with a `- **Merged:** <PR url>` line. Don't edit it yourself.
