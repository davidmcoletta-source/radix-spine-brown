# Contributing — Design Review Gate

Every visual change to `neuro-edu` goes through a mandatory review gate. No visual PR merges without David's approval.

## What triggers the gate

Any PR that modifies:

- `client/src/**/*.tsx`, `.ts`, `.css`
- `client/index.html`
- `client/public/**` (images, logo, favicon)
- `tailwind.config.ts`
- `design-review/**` or `scripts/design-review.mjs`

Data-only, copy-only, or backend-only changes bypass the gate.

## What happens on a triggered PR

1. GitHub Actions builds `main` and the PR head into two separate servers.
2. `scripts/design-review.mjs` runs and produces:
   - **Side-by-side screenshots** at desktop (1280) and mobile (375) for every route (landing, categories, epilepsy, category-functional, about). Baseline on the left, candidate on the right.
   - **Deviation report** (`design-review/out/report.md`) checking:
     - Every `--bh-*` token still matches the NPSI web palette.
     - No Brown Red (`#ED1C24`) appears outside the Coat of Arms.
     - `--font-display` is Raleway.
     - H1/H2 render in Raleway.
     - Nav background meets WCAG AA contrast ≥ 4.5.
     - Logo min-size and clear-space guidance.
3. Report is posted as a PR comment. Screenshots and JSON audit uploaded as workflow artifacts.
4. If any deviation is an **error**, the `design-review` job fails and the PR is blocked.
5. Even if the job passes, GitHub branch protection requires **David's explicit review approval** before merge.

## Brand source of truth

| Source | Path | Role |
|---|---|---|
| Brown Health Brand Guide v1.0 (Oct 2024) | `space_files/LS1002_BrownUniversityHealth_visualguidelines_update_100924.pdf` | **Authoritative.** PDF wins on any conflict. |
| Extracted machine-readable spec | `design-review/brand-standards.json` | Colors, type, spacing, logo, forbidden red rule. |
| Frozen local token baseline | `design-review/token-baseline.json` | The `--bh-*` values and font vars we've approved. |

## How to run locally

```bash
# In two terminals:
#  1) main branch server on 5000
git worktree add /tmp/neuro-edu-main main
cd /tmp/neuro-edu-main && npm ci && npm run build
NODE_ENV=production PORT=5000 node dist/index.cjs

#  2) your branch server on 5001
cd <this-repo> && npm ci && npm run build
NODE_ENV=production PORT=5001 node dist/index.cjs

# Then:
node scripts/design-review.mjs \
  --baseline-url http://localhost:5000 \
  --candidate-url http://localhost:5001 \
  --out design-review/out

open design-review/out/compare/landing-desktop.png
cat design-review/out/report.md
```

## What David reviews on every PR

1. Open every image in `design-review/out/compare/`.
2. Read the deviation report.
3. Either **Approve** the PR (design bar met) or **Request changes** with specifics.
4. Even a passing automated gate does not merge without David's approval — branch protection enforces this.

## Adding a new route to the review

Edit `scripts/design-review.mjs` and add to the `ROUTES` array. Then rebuild the baseline shots.

## Waiving a deviation

Deviations flagged as `error` block the gate. To waive, David comments on the PR with:

> Waive: <deviation category> — <justification>

and adds his approving review. The workflow does not auto-detect the waiver; the waiver is a documented human override.

## Enforcement (active)

GitHub Pro is enabled on this account, so `main` is hard-protected. The following are enforced on the server side — the Merge button is disabled unless every rule passes:

**Ruleset:** `Protect main — design review required` (active)

**Classic branch protection on `main`:**
- Required status checks (strict / up-to-date): `Design Review Gate / design-review`, `Design Review Gate / human-approval-check`
- Required PR reviews: **1 approving review**
- Dismiss stale reviews on new commits: **on**
- Require approval of most recent push: **on**
- Required conversation resolution: **on**
- Force pushes: **blocked**
- Branch deletion: **blocked**

**Repo settings:**
- CODEOWNERS auto-requests David on every visual-path PR
- `allow_auto_merge=false` — a human must click Merge
- Only squash merges allowed (linear history)
- Branches auto-delete on merge

The result: no visual change reaches `main` without (a) the design-review workflow passing and (b) David submitting an approving PR review.
