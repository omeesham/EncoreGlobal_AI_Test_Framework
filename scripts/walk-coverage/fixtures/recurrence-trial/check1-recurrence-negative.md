# RCA: Repeated LR-012 Failure

## Root Cause

The rule LR-012 was insufficient to prevent cross-page selector collision in dialog components.

## Prior-Fix Trial

### Fix 1: LR-012 namespace rule
- **Verdict**: CONVICTED
- **Old fix location**: `.claude/rules/specs.md:45`
- **Evidence**: The rule only checked top-level selectors, missing dialog-interior ones.

### Removal diff
Removed the incomplete namespace check and replaced with comprehensive validation.

### Protection-parity table

| Protective Function | Surviving Mechanism |
|---|---|
| Top-level selector collision prevention | New comprehensive namespace validator at `.claude/rules/specs.md:45-60` |
| Cross-page boundary enforcement | LR-017 (unchanged) |
