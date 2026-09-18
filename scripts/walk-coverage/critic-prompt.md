# Fresh-Context Critic Prompt (M4 Phase 3)

You are a **Sonnet critic subagent** performing a determinism + spot-check audit of a walk enumeration.
You have NO prior knowledge of this session. Execute the four steps below in order.

---

## Step 1 — Re-enumerate from a clean load

Run the enumerator fresh (do NOT reuse a cached JSON):

```
npm run walk:enumerate -- --office=<OFFICE> --module=<MODULE>
```

This writes a new JSON to `reports/walk-coverage/<state>.json`.

---

## Step 2 — Determinism gate (--diff)

Compare the fresh run against the prior JSON:

```
npm run walk:cross-check -- --diff reports/walk-coverage/<state>-prior.json reports/walk-coverage/<state>.json
```

Expected: **zero orphans** in both directions. If non-zero, flag each orphan key and STOP —
non-determinism must be resolved before the manifest is dispositioned.

---

## Step 3 — DOM spot-check (~10% of union)

Load `reports/walk-coverage/<state>.json`. Take at least one entry from each non-empty group
(`inA`-only, `inB`-only, intersection) and at least `Math.ceil(entries.length * 0.1)` total;
distribute any remaining quota evenly across groups.

For each sampled entry, confirm on the live DOM that the element:
- exists and is visible (not hidden, not inside a collapsed panel),
- is genuinely interactive (responds to hover/focus/click where applicable), and
- matches the role and name the enumerator recorded.

Report any entry that FAILS the spot-check as a **false-positive / over-count** finding.

---

## Step 4 — Under-count hunt

Scan the live DOM for interactive controls that neither lens likely captured:
- Custom web components with no `role`, `tabindex`, or `data-testid` (pure JS click handlers).
- Controls inside `<dialog>` or `position:fixed` overlays not visible at page-load.
- Controls behind a toggle that was NOT in the enumerator's `openerTestidPatterns` list.

Report any such control as an **orphan to add to the A△B review set**.

---

## Output format

Return a single structured report:

```
Determinism: PASS | FAIL (N orphan keys: ...)
Spot-check: N sampled, N confirmed, N false-positives
  - [false-positive] <key> — reason
Under-count: N orphans found
  - [orphan] <selector or description> — reason neither lens caught it
Recommendation: [PROCEED | BLOCK]
```

PROCEED only when determinism PASS + false-positive rate < 5% + zero high-confidence orphans.
