# Commission Tier/Flat — Bug Report (NM-3350)

2026-11-12

## Summary

Four open defects in Setup → Commissions → Tier/Flat, three of them High. Three are regressions of fixed tickets. All reproduce on e2e.

- **Environment:** e2e, account s-prd-clickauto
- **Page:** /navigator/locations/{office}/commissions/tiers
- **Location:** 1101 (corporate); BUG-COM-TF-011 on 1105

| Bug | Severity | Defect | Related ticket | Automated test |
| --- | --- | --- | --- | --- |
| BUG-COM-TF-007 | High | Reset-day lists offer only a blank and "1" | NM-3510 (regression) | TC-COM-TF-081 |
| BUG-COM-TF-011 | High | A saved reset day isn't stored | NM-3633 | TC-COM-TF-083 |
| BUG-COM-TF-014 | High | Importing an export fails with a raw error | NM-3425 (regression) | TC-COM-TF-073 |
| BUG-COM-TF-012 | Medium | A band overwritten by a copy has a blank Currency in History | NM-4692 (regression) | TC-COM-TF-099 |

## BUG-COM-TF-007: Reset-day lists offer only a blank and "1"

Every month in the Reset Dates modal offers only a blank and "1", so no reset day other than the 1st can be chosen.

- **Severity:** High
- **Related:** regression of NM-3510
- **Location:** 1101

**Steps to reproduce**

1. Open Setup → Commissions → Tier/Flat for office 1101 and click Search.
2. Click Reset Dates.
3. Open the January dropdown, then the February dropdown.
4. Click Cancel.

**Expected:** a blank, then 1–31 for January and 1–28 for February (each month offers the days it has).

**Actual:** every month offers only a blank and "1".

**Automated test:** TC-COM-TF-081

## BUG-COM-TF-011: A saved reset day isn't stored

Saving a reset day shows no error, but nothing is stored: the month is blank when the modal is reopened, and Reset Date History stays empty.

- **Severity:** High
- **Related:** NM-3633
- **Location:** 1105

**Steps to reproduce**

1. Open Setup → Commissions → Tier/Flat for office 1105 and click Search.
2. Click Reset Dates, set January to 1, and click Save. No error appears.
3. Click Cancel, then click Reset Dates again.
4. Open the Commission Tier/Flat Reset Date History tab.

**Expected:** January shows 1, and Reset Date History lists the change.

**Actual:** January is blank, and Reset Date History says "0 items found".

**Automated test:** TC-COM-TF-083

## BUG-COM-TF-014: Importing an export fails with a raw error

Importing the page's own export, unchanged, fails at 50% with a raw server error instead of a success message.

- **Severity:** High
- **Related:** regression of NM-3425
- **Location:** 1101

**Steps to reproduce**

1. Open Setup → Commissions → Tier/Flat for office 1101 and click Search.
2. Click Export to download TierFlatCommissions-1101.xlsx.
3. Click Import and choose that same file, unchanged. The upload starts by itself.
4. Click Cancel.

**Expected:** a success message with counts; the data doesn't change.

**Actual:** the progress bar stops at 50%, and the dialog shows "Unexpected error: An item with the same key has already been added. Key: 1101".

**Also seen:** a file with invalid values (for example, a negative boundary) shows the same raw message instead of row-by-row errors.

**Automated test:** TC-COM-TF-073

## BUG-COM-TF-012: A band overwritten by a copy has a blank Currency in History

When Copy Within Location overwrites a band, History records the old band as Remove with an empty Currency. A normal delete records USD.

- **Severity:** Medium
- **Related:** regression of NM-4692
- **Location:** 1101

**Steps to reproduce**

1. Open Setup → Commissions → Tier/Flat for office 1101 and click Search.
2. Click Add Row twice. Give one row Service Type A and the other Service Type B, each with a band. Click Save.
3. Click Copy → Copy Within Location. Choose A as the source, tick B, click Apply, and confirm the overwrite.
4. Open the Commission Tier/Flat History tab.

**Expected:** B's old band appears as Remove with its Currency (USD), the same as a Remove made by a normal delete.

**Actual:** B's old band appears as Remove with an empty Currency.

**Automated test:** TC-COM-TF-099
