# Exploratory Crawl — Bug Report

**Application:** https://cloudapps-e2e.encoreglobal.com/navigator/
**Run:** 2026-09-17T16:01:35.341Z → 2026-09-17T16:03:16.077Z (101s)
**Stopped because:** action budget of 40 reached

| | |
| --- | --- |
| Pages visited | 4 |
| Actions performed | 40 |
| Scenarios explored | 14 |
| **Bugs found** | **9** |
| Raw findings before dedup | 13 |
| Crawl errors | 0 |
| Pages/actions not tested | 45 |

## Severity

| Severity | Count |
| --- | --- |
| Critical | 0 |
| Major | 1 |
| Minor | 7 |
| Trivial | 1 |

## Category

| Category | Count |
| --- | --- |
| Accessibility | 3 |
| Stability | 3 |
| Functional | 1 |
| Validation | 1 |
| UI | 1 |

## Bugs

| ID | Severity | Priority | Module | Title | Seen |
| --- | --- | --- | --- | --- | --- |
| BUG-CTRL-001 | Major | P2 | Locations > Inbox | "All mail" does nothing when clicked | 1x |
| BUG-LABEL-001 | Minor | P3 | Locations > Inbox | 1 form control(s) have no accessible label on Locations > Inbox | 3x |
| BUG-INPUT-001 | Minor | P3 | Locations > Orders | Field "Current page number" silently truncates input | 2x |
| BUG-A11Y-002 | Minor | P3 | Locations > Inbox | 3 control(s) have no accessible name on Locations > Inbox | 1x |
| BUG-CONSOLE-001 | Minor | P3 | Locations > Orders | Console error: [useOrderSearchSectionDropdowns] Statuses fetch failed: Forbidden | 1x |
| BUG-CONSOLE-002 | Minor | P3 | Locations > Orders | Console error: [useOrderSearchSectionDropdowns] Billing methods fetch failed: Forbidden | 1x |
| BUG-CONSOLE-003 | Minor | P3 | Locations > Orders | Console error: [useOrderSearchSectionDropdowns] Order types fetch failed: Forbidden | 1x |
| BUG-LAYOUT-001 | Minor | P3 | Locations > Orders | Text is cut off by its container on Locations > Orders | 1x |
| BUG-A11Y-001 | Trivial | P4 | Locations > Home | Screen has 2 <h1> headings (Locations > Home) | 2x |

### BUG-CTRL-001 — "All mail" does nothing when clicked

| Field | Value |
| --- | --- |
| **Severity** | Major |
| **Priority** | P2 |
| **Category** | Functional |
| **Module / Page** | Locations > Inbox |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox |
| **Detector** | `dead-control` |
| **Occurrences** | 1 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Inbox.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox
3. Open the "All mail" tab.
4. Observe that nothing on the page changes.

**Expected result:** Clicking the tab navigates, opens something, or changes what is on screen.

**Actual result:** After the click the URL is unchanged, no dialog opened, and the page content is byte-identical — the control has no visible effect.

**Evidence:** ![BUG-CTRL-001](evidence/BUG-CTRL-001.png)

**Selector:** `#radix-_r_16_-trigger-all`

---

### BUG-LABEL-001 — 1 form control(s) have no accessible label on Locations > Inbox

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | Accessibility |
| **Module / Page** | Locations > Inbox |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox |
| **Detector** | `missing-label` |
| **Occurrences** | 3 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Inbox.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox
3. Inspect the form controls listed above and confirm none carries a label association.

**Expected result:** Every form control is named by a <label for>, aria-label or aria-labelledby, so assistive technology can announce it.

**Actual result:** 1 control(s) are named only by placeholder text or by nothing at all: button[type=button] (Filter by label)

**Evidence:** ![BUG-LABEL-001](evidence/BUG-LABEL-001.png)

**Selector:** `div > div:nth-of-type(1) > div:nth-of-type(1) > button`

**Also seen on**

- https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders
- https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/fulfillments

---

### BUG-INPUT-001 — Field "Current page number" silently truncates input

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | Validation |
| **Module / Page** | Locations > Orders |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders |
| **Detector** | `input-boundary` |
| **Occurrences** | 2 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Orders.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders
3. Type 300 characters into the "Current page number" field.
4. Observe that only 1 characters are kept and nothing explains why.

**Expected result:** A field that limits length declares it (maxlength, a counter, or a validation message) so the user knows the value was cut.

**Actual result:** 300 characters were entered and the field kept 1, with no maxlength attribute and no message.

**Evidence:** ![BUG-INPUT-001](evidence/BUG-INPUT-001.png)

**Selector:** `div > div:nth-of-type(2) > span > input`

**Also seen on**

- https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/fulfillments

---

### BUG-A11Y-002 — 3 control(s) have no accessible name on Locations > Inbox

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | Accessibility |
| **Module / Page** | Locations > Inbox |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox |
| **Detector** | `accessibility` |
| **Occurrences** | 1 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Inbox.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox

**Expected result:** Every button, link and tab has text or an aria-label, so it can be announced and reached by voice.

**Actual result:** 3 control(s) announce as nothing. First: div > div:nth-of-type(1) > div > button:nth-of-type(1)

**Evidence:** ![BUG-A11Y-002](evidence/BUG-A11Y-002.png)

**Selector:** `div > div:nth-of-type(1) > div > button:nth-of-type(1)`

---

### BUG-CONSOLE-001 — Console error: [useOrderSearchSectionDropdowns] Statuses fetch failed: Forbidden

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | Stability |
| **Module / Page** | Locations > Orders |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders |
| **Detector** | `console-error` |
| **Occurrences** | 1 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Orders.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders

**Expected result:** The browser console stays clean while the screen is used.

**Actual result:** The console logged: [useOrderSearchSectionDropdowns] Statuses fetch failed: Forbidden

**Evidence:** ![BUG-CONSOLE-001](evidence/BUG-CONSOLE-001.png)

**Console**

```
[useOrderSearchSectionDropdowns] Statuses fetch failed: Forbidden
```

---

### BUG-CONSOLE-002 — Console error: [useOrderSearchSectionDropdowns] Billing methods fetch failed: Forbidden

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | Stability |
| **Module / Page** | Locations > Orders |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders |
| **Detector** | `console-error` |
| **Occurrences** | 1 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Orders.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders

**Expected result:** The browser console stays clean while the screen is used.

**Actual result:** The console logged: [useOrderSearchSectionDropdowns] Billing methods fetch failed: Forbidden

**Evidence:** ![BUG-CONSOLE-002](evidence/BUG-CONSOLE-002.png)

**Console**

```
[useOrderSearchSectionDropdowns] Billing methods fetch failed: Forbidden
```

---

### BUG-CONSOLE-003 — Console error: [useOrderSearchSectionDropdowns] Order types fetch failed: Forbidden

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | Stability |
| **Module / Page** | Locations > Orders |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders |
| **Detector** | `console-error` |
| **Occurrences** | 1 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Orders.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders

**Expected result:** The browser console stays clean while the screen is used.

**Actual result:** The console logged: [useOrderSearchSectionDropdowns] Order types fetch failed: Forbidden

**Evidence:** ![BUG-CONSOLE-003](evidence/BUG-CONSOLE-003.png)

**Console**

```
[useOrderSearchSectionDropdowns] Order types fetch failed: Forbidden
```

---

### BUG-LAYOUT-001 — Text is cut off by its container on Locations > Orders

| Field | Value |
| --- | --- |
| **Severity** | Minor |
| **Priority** | P3 |
| **Category** | UI |
| **Module / Page** | Locations > Orders |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders |
| **Detector** | `layout` |
| **Occurrences** | 1 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Orders.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home
2. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders

**Expected result:** Text either fits, wraps, or is truncated deliberately with an ellipsis and a full value on hover.

**Actual result:** 1 element(s) hide overflowing text with no ellipsis: span: "Grid Options"

**Evidence:** ![BUG-LAYOUT-001](evidence/BUG-LAYOUT-001.png)

---

### BUG-A11Y-001 — Screen has 2 <h1> headings (Locations > Home)

| Field | Value |
| --- | --- |
| **Severity** | Trivial |
| **Priority** | P4 |
| **Category** | Accessibility |
| **Module / Page** | Locations > Home |
| **URL** | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home |
| **Detector** | `accessibility` |
| **Occurrences** | 2 |

**Preconditions**

- Signed in to the application with the automation account.
- Application reachable at https://cloudapps-e2e.encoreglobal.com.
- Screen under test: Locations > Home.

**Steps to reproduce**

1. Open https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home

**Expected result:** A screen has exactly one <h1>, so its heading outline has a single root.

**Actual result:** The page renders 2 <h1> elements.

**Evidence:** ![BUG-A11Y-001](evidence/BUG-A11Y-001.png)

**Also seen on**

- https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/fulfillments

---

## Coverage

### Pages visited

| # | Module | URL | Depth | Elements | Actions | Bugs | Reached via |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Locations > Home | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home | 0 | 30 | 12 | 1 | start URL |
| 2 | Locations > Inbox | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox | 1 | 31 | 12 | 3 | link "Inbox" |
| 3 | Locations > Orders | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders | 1 | 131 | 12 | 6 | link "Order Search" |
| 4 | Locations > Fulfillments | https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/fulfillments | 1 | 40 | 4 | 3 | link "Job Search" |

### Scenarios explored

| Scenario | Outcome | Detail |
| --- | --- | --- |
| Exercise button: 1604 Parker Palm Springs | explored | The screen re-rendered in response. |
| Exercise menuitem: 1604 Parker Palm Springs | explored | The screen re-rendered in response. |
| Exercise button: Actions | explored | The screen re-rendered in response. |
| Exercise menuitem: Search Statistics | explored | The screen re-rendered in response. |
| Exercise select: Filter by label | explored | The screen re-rendered in response. |
| Exercise select: All labels | explored | The screen re-rendered in response. |
| Exercise button: 1604 Parker Palm Springs | explored | The screen re-rendered in response. |
| Exercise menuitem: 1604 Parker Palm Springs | explored | The screen re-rendered in response. |
| Exercise button: Actions | explored | The screen re-rendered in response. |
| Exercise menuitem: Search Statistics | explored | The screen re-rendered in response. |
| Exercise select: All | explored | The screen re-rendered in response. |
| Exercise select: 50 | explored | The screen re-rendered in response. |
| Exercise select: 10 20 30 40 50 | explored | The screen re-rendered in response. |
| Exercise select: 30 | explored | The screen re-rendered in response. |

### Not tested

These were discovered but deliberately or unavoidably left alone. Anything here is a gap in
the crawl, not a clean bill of health.

| Target | Reason |
| --- | --- |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Sourcing Dashboard". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Commissions". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Approve Equipment Transfers". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Tax". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Release Notes". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Setup". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Warehouse". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Studio". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "DRO Search". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Item Statistics". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Payment Search". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Fix Unlinked CRM Orders". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "ECT Search". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "FAQ". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Event Agendas". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Ask Encore". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "PC prd click auto". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/home :: Click "Click to restore sidebar". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Open the "Unread" tab. | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Open the "Archive" tab. | destructive action ("archive") — safety.allowDestructive is off |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Sourcing Dashboard". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Commissions". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Approve Equipment Transfers". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Tax". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Release Notes". | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Setup". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/inbox :: Click "Warehouse". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Use the "Go to first page" pagination control. | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Open the "All USD CAD EUR GBP" dropdown. | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Toggle the "on" checkbox. | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Click "1604 Parker Palm Springs". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Type a test value into the the unnamed input field. | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Use the "Go to previous page" pagination control. | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Open the "Orders and Credit Memos" dropdown. | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Click "Actions". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Use the "Go to next page" pagination control. | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Open the "Orders and Credit Memos Orders Credit Memos" dropdown. | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/orders :: Click "Commissions". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/fulfillments :: Use the "Go to first page" pagination control. | control is disabled |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/fulfillments :: Click "1604 Parker Palm Springs". | not interactable: pointer-events is none |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/assets | queued but not reached before the crawl budget ran out |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/customers | queued but not reached before the crawl budget ran out |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/packages | queued but not reached before the crawl budget ran out |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/products | queued but not reached before the crawl budget ran out |
| https://cloudapps-e2e.encoreglobal.com/navigator/locations/1604/settings | queued but not reached before the crawl budget ran out |

## What was checked

| Detector | Looks for |
| --- | --- |
| `page-crash` | The screen rendered a crash banner, a stack trace, or nothing at all. |
| `console-error` | The page logged an uncaught error or a console error while it was being used. |
| `network-failure` | A request the screen made failed, or answered 4xx/5xx. |
| `broken-link` | Links that point nowhere, and links whose destination answers 4xx/5xx. |
| `dead-control` | A control that neither navigates, opens anything, nor changes the page. |
| `unexpected-route` | Navigation that lands somewhere other than where the control advertised. |
| `form-validation` | Fields that accept a value their own type says is invalid, without telling the user. |
| `input-boundary` | Boundary values that make the screen throw, hang, or silently mangle the input. |
| `placeholder-text` | Unresolved values, i18n keys or template fragments rendered as user-visible text. |
| `missing-label` | Form controls a screen reader cannot announce, because nothing names them. |
| `accessibility` | Unnamed controls, missing image alternatives, absent headings, duplicate ids. |
| `layout` | Horizontal overflow, text clipped by its container, and controls that overlap. |
| `page-title` | The browser tab names the screen. |

## Configuration used

```json
{
  "startUrl": "https://cloudapps-e2e.encoreglobal.com/navigator/",
  "allowedOrigins": [
    "https://cloudapps-e2e.encoreglobal.com"
  ],
  "excludeUrlPatterns": [
    "logout",
    "signout",
    "sign-out",
    "\\/api\\/auth\\/signout",
    "login\\.microsoftonline\\.com",
    "b2clogin\\.com",
    "\\.(pdf|csv|xlsx|xls|zip|docx|png|jpe?g|gif|svg|woff2?|ttf)(\\?|$)",
    "^mailto:",
    "^tel:",
    "^javascript:",
    "\\/api\\/",
    "\\/_next\\/",
    "\\/auth\\/signin",
    "\\/reports\\/download"
  ],
  "includeUrlPatterns": [],
  "auth": {
    "mode": "storage-state",
    "signedInSelector": "h1"
  },
  "limits": {
    "maxPages": 8,
    "maxActionsPerPage": 12,
    "maxTotalActions": 40,
    "maxDepth": 3,
    "maxDurationMs": 420000,
    "settleMs": 900,
    "actionTimeoutMs": 8000,
    "navigationTimeoutMs": 30000
  },
  "safety": {
    "allowWrites": false,
    "allowDestructive": false
  },
  "enabledDetectors": [
    "page-crash",
    "console-error",
    "network-failure",
    "broken-link",
    "dead-control",
    "unexpected-route",
    "form-validation",
    "input-boundary",
    "placeholder-text",
    "missing-label",
    "accessibility",
    "layout",
    "page-title"
  ],
  "captureScreenshots": true,
  "outputDir": "reports/bugs/crawler"
}
```

