# Field Inventory — Corporate Pricing › Product Group Override (Class 3 Replay Fixture)

**Module**: corporate-pricing-override
**Client**: encore
**MCP_Session_Date**: 2026-07-20
**Coverage_Ratio**: 40/40
**CrossCheck**: clean
**Completion_Record**: scripts/walk-coverage/fixtures/replay/class3/completion-record.json
**Walk_State**: office=1101 currency=USD tab=Equipment+Labor

---

## Coverage Manifest

| # | Control Key | Label | Disposition |
|---|---|---|---|
| 1 | `role:button:select-location` | Select Location Launcher | `covered-by-TC: TC-CPR-OVR-001` |
| 2 | `role:checkbox:modal-active` | Location Modal Active Filter | `covered-by-TC: TC-CPR-OVR-002` |
| 3 | `role:textbox:modal-search` | Location Modal Search | `covered-by-TC: TC-CPR-OVR-003` |
| 4 | `role:button:modal-select` | Location Modal Select | `covered-by-TC: TC-CPR-OVR-004` |
| 5 | `role:button:modal-cancel` | Location Modal Cancel | `covered-by-TC: TC-CPR-OVR-005` |
| 6 | `role:button:modal-close` | Location Modal Close | `covered-by-TC: TC-CPR-OVR-006` |
| 7 | `role:combobox:currency-filter` | Currency Filter | `covered-by-TC: TC-CPR-OVR-007` |
| 8 | `role:tab:equipment` | Equipment Tab | `covered-by-TC: TC-CPR-OVR-008` |
| 9 | `role:tab:labor` | Labor Tab | `covered-by-TC: TC-CPR-OVR-009` |
| 10 | `role:spinbutton:override-price-equip` | Override Price (Equipment) | `covered-by-TC: TC-CPR-OVR-010` |
| 11 | `role:spinbutton:max-discount-equip` | Max Discount % (Equipment) | `covered-by-TC: TC-CPR-OVR-011` |
| 12 | `role:checkbox:active-equip` | Active Checkbox (Equipment) | `covered-by-TC: TC-CPR-OVR-012` |
| 13 | `struct:picker-dblclick-equip` | Picker Double-Click (Equipment) | `covered-by-TC: TC-CPR-OVR-013` |
| 14 | `struct:picker-drag-equip` | Picker Drag (Equipment) | `covered-by-TC: TC-CPR-OVR-014` |
| 15 | `role:spinbutton:override-price-labor` | Override Price (Labor) | `covered-by-TC: TC-CPR-OVR-015` |
| 16 | `role:spinbutton:max-discount-labor` | Max Discount % (Labor) | `covered-by-TC: TC-CPR-OVR-016` |
| 17 | `role:checkbox:active-labor` | Active Checkbox (Labor) | `covered-by-TC: TC-CPR-OVR-017` |
| 18 | `struct:picker-dblclick-labor` | Picker Double-Click (Labor) | `covered-by-TC: TC-CPR-OVR-018` |
| 19 | `struct:picker-drag-labor` | Picker Drag (Labor) | `covered-by-TC: TC-CPR-OVR-019` |
| 20 | `role:button:grid-options` | Grid Options Button | `covered-by-TC: TC-CPR-OVR-020` |
| 21 | `role:button:export` | Export Button | `covered-by-TC: TC-CPR-OVR-021` |
| 22 | `role:button:import` | Import Button | `covered-by-TC: TC-CPR-OVR-022` |
| 23 | `role:textbox:filter` | Filter Product Groups | `covered-by-TC: TC-CPR-OVR-023` |
| 24 | `role:button:save` | Save Button | `covered-by-TC: TC-CPR-OVR-024` |
| 25 | `role:button:save-confirm` | Save Confirm Button | `covered-by-TC: TC-CPR-OVR-025` |
| 26 | `role:button:save-cancel` | Save Cancel Button | `covered-by-TC: TC-CPR-OVR-026` |
| 27 | `role:combobox:rows-per-page` | Rows Per Page | `covered-by-TC: TC-CPR-OVR-027` |
| 28 | `role:alertdialog:save-changes` | Save Changes Dialog | `covered-by-TC: TC-CPR-OVR-028` |
| 29 | `role:button:sort-location` | Sort Location Column | `covered-by-TC: TC-CPR-OVR-029` |
| 30 | `role:button:sort-product-group` | Sort Product Group Column | `covered-by-TC: TC-CPR-OVR-030` |
| 31 | `role:button:sort-pg-name` | Sort Product Group Name Col | `covered-by-TC: TC-CPR-OVR-031` |
| 32 | `role:button:sort-currency` | Sort Currency Column | `covered-by-TC: TC-CPR-OVR-032` |
| 33 | `role:button:sort-current-price` | Sort Current Price Column | `covered-by-TC: TC-CPR-OVR-033` |
| 34 | `role:button:sort-mod-date` | Sort Mod Date Column | `covered-by-TC: TC-CPR-OVR-034` |
| 35 | `role:button:sort-updated-by` | Sort Updated By Column | `covered-by-TC: TC-CPR-OVR-035` |
| 36 | `struct:app-nav-home` | App Nav Home | `out-of-scope: outside-module — global Navigator app-shell chrome, not the Product Group Override surface` |
| 37 | `struct:app-nav-inbox` | App Nav Inbox | `out-of-scope: outside-module — global Navigator sidebar inbox element, separate app-frame coverage` |
| 38 | `struct:app-nav-setup` | App Nav Setup | `out-of-scope: outside-module — global Navigator sidebar setup link, separate app-frame coverage` |
| 39 | `struct:app-user-menu` | App User Menu | `out-of-scope: outside-module — global Navigator user menu trigger, separate app-frame coverage scope` |
| 40 | `struct:app-sidebar-restore` | App Sidebar Restore | `out-of-scope: outside-module — global Navigator sidebar restore toggle, separate app-frame coverage` |

---

## Summary

- **Covered**: 35 controls
- **Out-of-scope**: 5 controls (13%)
- **Total manifest rows**: 40
- **OOS budget**: 5/40 = 13% (cap: 15%)
