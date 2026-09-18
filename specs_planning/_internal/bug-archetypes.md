---
paths:
  - "specs_planning/_internal/neutral-eye-audits/**"
  - "plans/pending/SUBPLAN_DQU_*_NEUTRAL_EYE_*.md"
  - "plans/done/SUBPLAN_DQU_*_NEUTRAL_EYE_*.md"
---

# Bug Archetypes — Encore Audit Memory

> Append-only. New archetypes added at next free `ARCH-NNN`. Never renumber. Never reorder.
> Every neutral-eye audit subplan reads this file at Phase 0 and probes every archetype on its own module. Reproductions of `bug`-severity archetypes get filed as `BUG-{MODULE}-NNN.json` per LR-034. Reproductions of `discussion-item`-severity archetypes get flagged in findings, not filed.
> Drift archetypes (TC-MD vs live-DOM mismatches) get applied as TC-MD edits in the corresponding fix subplan, not bugs.

## ARCH-001 — save-enabled-on-invalid-form-no-feedback
- **Pattern**: Save button stays enabled when a required field is empty or invalid; clicking Save produces no toast, no dialog, no aria-invalid update — the form silently fails or silently submits an invalid POST.
- **First observed**: BUG-LI-001 (2026-04-10) primary symptom; reconfirmed SP-DQU-04 (2026-04-27); TC-LOS-BAS-016 colleague flag (Phone 1 accepts non-phone text, save stays enabled).
- **Probe steps**: For each required field on the module — (1) clear field via native value setter + input/change/blur events; (2) check Save button disabled state; (3) if Save enabled, click and watch network panel for POST + UI for toast/dialog; (4) record verbatim text of any feedback (or absence).
- **Severity / action**: bug — file `BUG-{MODULE}-NNN.json` per LR-034 if the symptom reproduces.

## ARCH-002 — non-numeric-doesnt-revert
- **Pattern**: Numeric/spinbutton field accepts non-numeric input without reverting; field shows the invalid value (or shows 0.00 silently) with Save still enabled. LR-011 violation pattern.
- **First observed**: TC-LOS-ECT-010 colleague flag (non-numeric input doesn't revert; shows 0.00 with save enabled).
- **Probe steps**: Two distinct behaviors to test [catalog-refinement 2026-04-28]: **(A) Pure-non-numeric** — type pure alpha ("abc") or special chars + Tab; expected: field reverts to last valid value, aria-invalid stays false. **(B) Ambiguous-numeric** — paste multi-decimal ("1.2.3"), scientific notation ("1e5"), leading-zero strings ("000123"), pure negative ("-5"); expected: field accepts partial parse, boundary check fires (aria-invalid=true if value outside min/max). For each numeric/spinbutton field on the module: (1) clear field; (2) test (A) — type "abc", blur, observe; (3) test (B) — paste "1.2.3", blur, observe; (4) check Save state in each scenario; (5) record both behaviors per field.
- **Severity / action**: bug — file `BUG-{MODULE}-NNN.json` per LR-034. NOT a bug if (A) reverts AND (B) partially-accepts-with-aria-invalid. IS a bug if (A) leaves invalid value with Save enabled (LR-011 violation) OR (B) accepts out-of-range value silently (no aria-invalid, no error).

## ARCH-003 — stale-default-vs-actual
- **Pattern**: TC-MD claims default value X for a field; live DOM on baseline office shows value Y. Test fires on wrong precondition.
- **First observed**: TC-LOS-BAS-032 (logo checkboxes default-on); SP-DQU-04 LI LDW=0.04 claim vs actual 0.00; SP-DQU-04 LI prompt-for-approval=unchecked claim vs actual checked.
- **Probe steps**: For each field on the module — (1) read TC-MD's claimed default for this field; (2) read live DOM rendered value on baseline office (1604 for Encore); (3) if mismatch, record actual value and which TCs are affected.
- **Severity / action**: drift — TC-MD edit in the corresponding fix subplan; no BUG file.

## ARCH-004 — stale-section-or-label
- **Pattern**: TC-MD references section names or field labels that no longer match live DOM.
- **First observed**: TC-LOS-BAS-025 (all sections active but section names different); TC-LOS-ECT-007 (sections "Event Profit Target" + "Labor Cost Assumption" do not match live).
- **Probe steps**: For each section/label referenced in TC-MD — (1) grep TC-MD for the literal label text; (2) read live DOM for that label; (3) if not found OR text differs, record actual text and TC IDs to update.
- **Severity / action**: drift — TC-MD edit in the corresponding fix subplan; no BUG file.

## ARCH-005 — parent-checkbox-doesnt-disable-children
- **Pattern**: A parent checkbox that should gate child fields/checkboxes (per the parent-enables-children pattern used elsewhere) leaves child controls enabled or checked when parent is unchecked. **Sibling-modifier subtype** (LDW/C&C/Service Charge variant): the percentage input child is correctly gated by the parent, but a "calc-on-net-amount" / behavioral-modifier sibling checkbox is NOT — it stays checked + enabled when parent unchecked. This subtype is missed if the probe only enumerates the percentage input as a child.
- **First observed**: BUG-LI-002 (SP-DQU-04, 2026-04-27) — Service Charge children active when allow-service-charge=unchecked. **Sibling-modifier subtype** (PLAN_FIND_BUGS_LI_FOLLOWUP, 2026-04-28) — BUG-LI-003: Apply LDW + Apply C&C calc-on-net sibling checkboxes stay active when parent unchecked (same systemic pattern across 3 LI groups).
- **Probe steps**: For each parent-child checkbox group on the module (identify by section grouping or naming convention) — (1) read parent state; (2) **enumerate ALL siblings within the group, not just the obvious percentage/value child** — include calc-on-net-amount checkboxes, "show-as-X" modifier checkboxes, "include-in-Y" toggles, etc.; (3) read each sibling's state + disabled flag in parent-checked AND parent-unchecked states (toggle the parent if needed); (4) if parent=unchecked AND any sibling=checked OR enabled, record the violation. **Catalog-refinement 2026-04-28** [catalog-refinement]: explicitly enumerate sibling-modifier checkboxes when scanning a parent group; the SP-DQU-04 audit and the SP-DQU-05 fix both missed BUG-LI-003 because their probe only looked at the percentage input child.
- **Severity / action**: bug — file `BUG-{MODULE}-NNN.json` per LR-034. If multiple parent groups in the same module exhibit the same subtype, file ONE bug covering all instances rather than per-group; cite the systemic pattern in `relatedBugs`.

## ARCH-006 — missing-verbatim-assertion-text
- **Pattern**: TC asserts that an error/toast/dialog appears, but does NOT include the verbatim text of the assertion. Test passes on any text, including misleading ones.
- **First observed**: TC-LOS-BAS-005 colleague flag (missing save dialog text + toast text).
- **Probe steps**: For each TC in the module's TC-MD that mentions "save dialog" / "toast" / "error message" / "validation" — (1) check whether the TC's Expected or Steps quotes the verbatim text; (2) if not, record TC ID + which assertion lacks verbatim text.
- **Severity / action**: drift — TC-MD edit in the corresponding fix subplan; capture verbatim text from live DOM during this audit.

## ARCH-007 — aria-required-or-aria-invalid-missing
- **Pattern**: Required fields render with no `aria-required` attribute; invalid fields render with `aria-invalid` either missing or set to "false" instead of "true". WCAG 2.1 / WAI-ARIA gap.
- **First observed**: BUG-LI-001 secondary symptom (2026-04-10, partial fix observed 2026-04-27 — aria-invalid now sets correctly; aria-required still null).
- **Probe steps**: For each required field on the module — (1) read aria-required attribute on default; (2) read aria-required after focus + blur of empty; (3) read aria-invalid before and after invalid input. Record nulls or wrong values.
- **Severity / action**: discussion-item — flag in findings § "Suspected APP bugs" with `discussion-item` label per `feedback_discussion_item_not_bug.md`. Do NOT file BUG-* (a11y is pre-existing on old site too per OSB-ACCESS-VERIFY-2026-04-24).

## ARCH-008 — tc-md-missing-fields-that-exist-in-live-dom
- **Pattern**: TC-MD's Field Inventory header claims N interactive fields; live DOM count is N+k. The k extra fields have ZERO TCs covering them — the audit walk would never have surfaced them.
- **First observed**: SP-DQU-04 LI (2026-04-27) — TC-MD claimed 52 fields, live count was 54; 3 newly-disabled checkboxes (use-esign, enable-product-group, discount-guidance) had no TCs at all.
- **Probe steps**: (1) Read TC-MD's Field Inventory header for claimed counts; (2) enumerate live DOM via `data-testid` selector audit + Radix `[role=checkbox]` + `[role=combobox]` + `[role=radiogroup]`; (3) compare counts and field-set; (4) for each field in live DOM but not in TC-MD, record: testid, default state, disabled flag.
- **Severity / action**: gap — list missing fields in findings § "Diff vs our CSV"; fix subplan adds TCs covering each missing field's default + interaction.

## ARCH-009 — missing-cascade-dependency-tc
- **Pattern**: A parent-child or cross-field dependency exists in live DOM (parent toggle changes child state) but no TC in TC-MD covers the cascade. Even if the dependency works correctly, regressions are uncaught.
- **First observed**: SP-DQU-04 LI (2026-04-27) — Service Charge parent/child relationship had no TC covering "uncheck parent, expect children disable+reset"; the cascade itself surfaced BUG-LI-002 candidate but was also a TC gap.
- **Probe steps**: For each parent-controllable group (parent checkbox + dependent fields/checkboxes/inputs) — (1) identify the group via section structure or naming convention; (2) grep TC-MD for any TC asserting parent-toggle → child-state-change; (3) if no TC found, record the group + the missing cascade behaviors.
- **Severity / action**: gap — list missing cascades in findings § "Diff vs our CSV"; fix subplan adds cascade TCs (toggle parent → assert child state on each child + assert reset on disable).

## ARCH-010 — missing-boundary-or-format-validation-tc
- **Pattern**: A field accepts text/numeric input but no TC covers boundary values (min, max, just-past-max), format violations (non-numeric in numeric, special chars, unicode, paste of multi-char strings), or length violations (max-length probe). Field's actual constraints are untested.
- **First observed**: SP-DQU-04 LI (2026-04-27) — Oracle Product (maxLength=25 per v1) had no TC for paste of 30-char strings or SQL chars; percentage spinbuttons had no TC for negatives, >100, decimals beyond step.
- **Probe steps**: For each input/spinbutton field — (1) grep TC-MD for boundary TCs by field name; (2) check if max-length / min-value / max-value / non-numeric / paste cases are covered; (3) record each field that lacks any of: boundary-min, boundary-max, format-violation, paste-overflow.
- **Severity / action**: gap — list missing boundary TCs in findings § "Diff vs our CSV"; fix subplan adds NEGATIVE-type TCs covering each field's boundary + format space.

## ARCH-011 — tc-assumes-stale-framework-or-architecture
- **Pattern**: TC-MD's Steps or Expected references framework constructs (Angular Reactive Forms, `if (!form.valid)`, ng-dirty/ng-touched, $scope, etc.) that no longer apply to the current live app architecture (e.g., Next.js + RHF + Server Actions). TC describes mechanism rather than user-observable behavior.
- **First observed**: SP-DQU-04 LI (2026-04-27) — multiple TCs reference Angular form-validity gating; live app is Next.js + RHF + Server Action POSTs. v1 requirements doc still uses Angular vocabulary.
- **Probe steps**: (1) `grep -iE "angular|ng-dirty|ng-touched|ng-valid|\\$scope|reactive form|formGroup|FormControl" {tc-md-path}` — record matches; (2) for each match, identify the underlying user-observable behavior the TC is trying to assert; (3) flag the TC for rewrite in user-observable terms.
- **Severity / action**: gap — record framework-assumption violations in findings § "Diff vs our CSV"; fix subplan rewrites affected TCs to user-observable assertions (DOM state, network, toast text) regardless of underlying framework.

## ARCH-012 — tc-encodes-bug-as-expected-behavior
- **Pattern**: TC's `Expected` or `Steps` validate what is actually a known bug as if it were the contract. The TC currently passes (or is marked Manual) because it asserts the wrong thing. Most dangerous archetype — TC actively legitimizes broken behavior, blocks regression detection, ships to client as "verified".
- **First observed**: SP-DQU-04 LI (2026-04-27) — TC-LOC-LI-008A asserts "Click Save button and verify save completes (no immediate validation)" on an invalid Oracle Product field — but per BUG-LI-001 + old-site baseline, Save SHOULD be disabled on invalid form. The TC encodes the BUG-LI-001 regression as the contract.
- **Probe steps**: (1) For each `BUG-{MODULE}-NNN.json` filed (or candidate from current audit), grep TC-MD for any TC asserting the bug's `actualBehavior` as Expected; (2) cross-reference TC Expected lines against old-site baseline (per LR-ENC-001) — if Expected matches new-site behavior but contradicts old-site baseline AND is on a non-baseline-absent feature, flag; (3) record TC ID + the offending Expected line + the documented correct behavior.
- **Severity / action**: gap (high-priority) — fix subplan rewrites affected TCs against documented expected behavior, adds `Status: Blocked by BUG-*` metadata. The bug must be filed/linked even if originally undocumented (audit obligation).

## ARCH-013 — save-cycle-state-machine
- **Pattern**: A module's save cycle has multiple legitimate end-states (dirty-preserved across in-page tab switch, save-then-discard rollback, save-then-reload server persistence, navigate-away unsaved-changes dialog, sequential-save HIST row count, cross-tab save isolation) and one of these transitions silently breaks — dirty state lost on tab switch, discard fails to restore, reload shows old value, sequential save merges into one HIST row, or cross-tab save accidentally edits an unrelated tab's fields. The user expects each transition to behave independently; the framework silently couples them.
- **First observed**: PLAN_SHARED_SETUP_DQU GIVER section (2026-05-12, this pilot — Shared Setup multi-field stress test surfaced the need for an explicit save-cycle archetype; pre-pilot archetypes ARCH-001..012 catalogue point-bugs in single fields, not save-cycle transitions). Authored inline by GIVER per parent plan v5 §5 Phase 4 archetype matrix design.
- **Probe steps** (6 — execute in order on each field-with-save-impact within the module):
  1. **Dirty-state preserved across in-page tab switch**: modify field A on tab T1 (form dirty, Save enabled) → activate tab T2 (within same page route — no URL change) → return to T1 → verify field A retains the dirty value AND Save still enabled.
  2. **Save-then-discard rollback**: modify field A → click Cancel / Discard / Reset → verify field A returns to last saved value AND Save disabled (form pristine).
  3. **Save-then-reload server persistence**: modify field A → click Save → confirm dialog → reload page (Ctrl-R or `goto` same URL) → verify field A shows the saved value (server-side persistence proven).
  4. **Navigate-away-without-saving + return + verify state**: modify field A → click a different route (sidebar/breadcrumb) → "Unsaved changes — leave?" alertdialog appears → click "Leave" / "Discard" → navigate back to original route → verify field A reverted to last saved value (no leak across navigation).
  5. **Sequential-save HIST row count**: modify field A → save → (without reload) modify field B → save → open History/audit tab → verify TWO new HIST rows present (one per save action), NOT one merged row. Each save = one audit-trail event.
  6. **Cross-tab save isolation**: modify field A on tab T1 → save (commits T1 changes only) → activate tab T2 → verify T2 fields untouched UNLESS explicitly cross-linked per documented business rule (e.g., shared dependency declared in REQUIREMENTS.md).
- **Severity / action**: bug — file `BUG-{MODULE}-NNN.json` per LR-034 if any of the 6 transitions reproduces a defect (e.g., dirty state lost on tab switch = persistence bug; sequential save merges into one HIST row = audit-trail bug). NOT a bug if behavior matches REQUIREMENTS.md OR documented intentional UX. For modules where a transition is N/A (single-tab module: step 1 N/A; module with no HIST: step 5 N/A), record `N/A — reason` in coverage matrix; do NOT file a bug for absent capability.

## ARCH-014 — cross-field-interaction
- **Pattern**: A module has fields A and B where changing A should trigger an observable effect on B (state, validation, visibility, limit, dropdown options, save combinations) and the effect either fails to fire or fires incorrectly — B stays enabled when A's value should disable it, B's validity ignores A's change, B's visibility doesn't update, B's max/min stays stale, B's option list doesn't refresh, OR saving A+B together drops one value's update. Cross-field coupling is implicit business logic; when it breaks silently, no single-field TC catches it.
- **First observed**: PLAN_SHARED_SETUP_DQU GIVER section (2026-05-12, this pilot — multi-field stress test for the cross-field section of v5 Matrix D). Authored inline by GIVER per parent plan v5 §5 Phase 4 archetype matrix design. Pre-pilot archetypes (ARCH-005 parent-checkbox-doesnt-disable-children, ARCH-009 missing-cascade-dependency-tc) cover parent-child checkbox cascades only; ARCH-014 generalizes to all 6 cross-field interaction sub-dimensions.
- **Probe steps** (6 — execute in order for every documented or inferable A→B field pair within the module):
  1. **State dependency (D1)**: change field A's value → observe field B's `disabled` attribute / readonly state. Expected: B enables or disables per documented rule (e.g., REQUIREMENTS "B is disabled when A=X"). Failure: B's state doesn't track A's change.
  2. **Validation dependency (D2)**: change field A to a value that should invalidate field B (per documented cross-field rule, e.g., "B must be >= A") → observe B's `aria-invalid` + the Save button's enabled state. Expected: B fires `aria-invalid=true` and Save disables. Failure: B accepts the stale value silently, Save stays enabled.
  3. **Conditional visibility (D3)**: change field A → observe whether field B appears/disappears in the DOM. Expected: B's visibility matches documented rule (e.g., "B is visible when A=Y"). Failure: B stays mounted (or stays unmounted) when A changes.
  4. **Limit dependency (D4)**: change field A's value (quantity/range/numeric) → observe whether field B's `min` / `max` / `step` attribute updates accordingly. Expected: B's bounds reflect A's new value. Failure: B's bounds stale, allowing invalid combinations.
  5. **Cascading options (D5)**: change parent dropdown A's selection → observe whether child dropdown B's option list re-fetches/refreshes. Expected: B shows only options valid under A's new value. Failure: B retains stale options, allowing invalid pair.
  6. **Save combinations (D6)**: modify A + B + C together in one form-dirty session → click Save → reload → verify all three values persisted independently. Expected: each field's new value is committed; HIST shows all three changes (combined row OR separate rows per module's HIST design). Failure: one of A/B/C silently drops during save (last-write-wins on overlapping fields, or backend ignores one field's payload).
- **Severity / action**: bug — file `BUG-{MODULE}-NNN.json` per LR-034 if any of the 6 sub-dimensions reproduces a defect. NOT a bug if (i) the field pair is documented as independent (record `N/A-INDEPENDENT` in coverage matrix with one-line justification per parent plan v5 Matrix D vocabulary), OR (ii) the observed coupling matches documented intentional UX. Probe **all** A→B field pairs within the module — failure to enumerate exhaustively = LR-040 closure-gate violation.

## ARCH-015 — radix-combobox-dom-mutation-crashes-host
- **Pattern**: External DOM mutation of Radix Select / combobox nodes (text-only or with synthetic events) triggers Angular host page tear-down (`Application error: a client-side exception has occurred`). Defensive mutation-observer guard blocks safe DOM-based negative testing.
- **First observed**: TC-LOC-LGL-019 Phase 4 audit (2026-05-27); both Path C and Path C-with-synthetic-events crashed; Path D-PIVOT moved to negative-listbox-enumeration + legitimate save-cycle to preserve test value.
- **Probe steps**: (1) open Radix combobox via Playwright; (2) `page.evaluate()` to mutate `textContent` on the trigger span; (3) observe page crash.
- **Test strategy when found**: skip DOM-tamper negative tests, use negative listbox enumeration via `getRoleOptions()` + legitimate save-cycle via `saveAndVerifyCase()` runner.
- **Severity / action**: discussion-item — defensive posture is correct behavior; not a BUG; document so future FCC pilots on Radix don't waste hours re-discovering.
- **Cross-ref**: `agent-mistakes.md` ALL-088; `field-case-catalogs/legal-2026-05-27.md` §TC-019 implementation outcome.
