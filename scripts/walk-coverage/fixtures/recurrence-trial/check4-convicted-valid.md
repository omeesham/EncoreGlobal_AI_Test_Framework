# RCA: Old Validation Improvement

## Prior-Fix Trial

### Fix 1: Basic input check
- **Verdict**: CONVICTED
- **Old fix location**: `src/validators/input.mjs:23`
- **Evidence**: Only validated string length, not format.

### Removal diff
Removed the length-only check and replaced with format+length validation.

### Protection-parity table

| Protective Function | Surviving Mechanism |
|---|---|
| String length validation | New format+length validator at `src/validators/input.mjs:23-30` |
| Empty input rejection | Retained in new validator |
