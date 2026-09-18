# RCA: Repeated LR-012 Failure

## Root Cause

The rule LR-012 was insufficient to prevent cross-page selector collision in dialog components.
The existing HARD STOP for namespace separation failed on nested dialogs.

## Proposed Fix

Add comprehensive dialog-interior selector namespace validation.
