---
name: grill-me
description: Grill the user relentlessly about a plan, decision, or idea until you both share one understanding of it. Asks in rounds over a design tree, each question with a recommended answer. Use only when the user invokes /grill-me.
argument-hint: "<idea, plan or decision to stress-test>"
disable-model-invocation: true
---

# Grill me

Adapted from Matt Pocock's [`grill-me` / `grilling`](https://github.com/mattpocock/skills/tree/main/skills/productivity) skills.

## Usage

Start it in a fresh conversation, with plan mode off (plan mode hurries to a plan; this skill keeps asking):

```
/grill-me <loose idea, plan or decision>
```

| Example                                             | What it does                                                   |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `/grill-me add dark mode to the book manager`       | Interviews you about scope, theming, persistence, testing…     |
| `/grill-me should we move CI from GitHub to GitLab` | Works through the decision and what hangs off it               |
| `/grill-me`                                         | Asks what you want to stress-test, then starts the first round |

It writes no files. The result is a set of decisions you settled and can defend. If it turns out to be code, carry on in the same conversation (the context is the value), e.g. into an issue with `/create-github-issue`.

Input: `$ARGUMENTS`

If the input is empty, ask the user what idea, plan or decision they want grilled, then begin.

## How to grill

Interview the user relentlessly until you reach a shared understanding. Map the subject as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer. The user can then reply per question (`Q1 yes, Q2 no: …, Q3 don't know`).

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

## Facts are yours, decisions are theirs

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (the codebase, docs, git history, `gh`, the web), look it up yourself, or dispatch an `Explore` sub-agent for a broad search. Never ask the user for anything you could look up. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait; ask the rest of the frontier now.

The _decisions_ are the user's: put each to them and wait. Never answer one on their behalf, and never treat silence as a yes.

## Keep it honest

- Push back when an answer contradicts an earlier one, or rests on an assumption you think is wrong. Say why, then let the user decide.
- "I don't know" is a real answer. If a question can't be settled by talking (how a UI should feel, which layout reads better), call it **ungrillable**: suggest building a throwaway prototype, park the branch, and move on.
- If the tree grows too big for one session, say so and propose splitting the subject into smaller pieces to grill one at a time.
- Answer in the user's language.

## Finishing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Then give a short summary of the settled decisions (and any parked, ungrillable branches) and ask the user to confirm you have reached a shared understanding. Do not act on it — no code, no files, no issues — until they confirm and ask for the next step.
