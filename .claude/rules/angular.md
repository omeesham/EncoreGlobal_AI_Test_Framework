---
description: Angular form / dirty-state discipline for tests and page objects
paths:
  - "tests/**/*.spec.ts"
  - "src/pages/**/*.ts"
  - "src/selectors/**/*.ts"
---

# Angular Form & Dirty-State Discipline

Path-scoped rule pack — loads when working on Angular-targeting tests / page objects.

## LR-009: Angular form dirty tracking — never test recovery to original value

When testing "error recovery" (invalid → valid), the recovery value must be
DIFFERENT from the server-saved value. Restoring to the original value makes
Angular detect "no net change" → Save stays disabled → test fails with correct app behavior.
Example: Delivery default=0, invalid=-5, recovery=-1 (NOT 0).
**Trigger**: Any test that validates Save button enables after correcting an error.

## LR-010: Cross-field validation is ALWAYS async — use expect.poll

Angular cross-field validators (e.g., a field that must be >= another field) fire asynchronously
after input events. Immediate `getAttribute('aria-invalid')` returns stale state.
Always use `expect.poll(() => isFieldInvalid(key))` or the `expectInvalid()`/`expectValid()`
polling helpers from the page object. Same-field validation (e.g., "abc" in numeric) is synchronous.
**Trigger**: Any assertion on aria-invalid after changing a field with cross-field dependencies.

## LR-011: Reload after non-numeric input to clear Angular model corruption

Typing non-numeric values (e.g., "abc") into numeric Angular inputs corrupts the
internal model to NaN. Typing a valid value back does NOT reliably fix the model.
The ONLY safe cleanup is page reload (`reloadBasicInfo` or `safeNavigateTo`).
**Trigger**: Any test that enters non-numeric text into a numeric field.

## LR-026: Angular form dirty state is unreliable — always handle defensively

Angular's form dirty state (`FormControl.dirty`) does NOT reliably reset after save.
Three known manifestations:

1. **Save button disables but form stays dirty** — the app explicitly disables the button
   after save API completes, but doesn't call `markAsPristine()`. Navigating to another
   tab triggers "Unsaved changes" alertdialog even though save succeeded.
2. **Dirty state persists across test boundaries** — save cycle doesn't reset dirty tracking.
   Must reload page between tests that modify and save data.
3. **Net-zero changes not detected** — reverting to original value makes Angular detect
   "no net change" → Save stays disabled. Recovery values must differ from server-saved (see LR-009).

Fix patterns:

- After save: wait for button disabled (confirms API done) BUT don't assume form pristine
- Any tab navigation: check for `[role="alertdialog"]` and dismiss with "Discard" if visible
- Between serial tests that save: reload page to reset form state
- Recovery values must differ from the server-saved original

**Trigger**: Any test that saves data then navigates, or any serial test after a save.
**Graduated from**: LR-009 + Angular dirty-state manifestations observed across multiple spec sessions.
