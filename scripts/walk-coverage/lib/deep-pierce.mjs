// scripts/walk-coverage/lib/deep-pierce.mjs
// PLAN_EXHAUSTIVE_WALK_GUARANTEE — Phase 1 shared library.
//
// Provides the machine-enumeration primitives reused by both `enumerate-page.mjs`
// (the walk enumerator) and `cross-check.mjs` (the M4 lens cross-check):
//
//   inPageEnumerate()        — runs INSIDE the browser via page.evaluate(); shadow-pierces the
//                              whole DOM and tags every element by Heuristic-A v2 (interactive
//                              widget net) AND Heuristic-B (focusable), keyed per M2. Also stashes
//                              `cursor:pointer` candidates on `window.__wcCands` for the Node-side
//                              CDP `DOMDebugger.getEventListeners` G1-recovery pass.
//   collapseArchetypes()     — Node-side F3/G8 archetype collapse: homogeneous repeating-row
//                              cell-sets (grid bodies, virtualized rows) → one per-column archetype.
//   setAlgebra()             — Node-side M4 union / intersection / symmetric-difference (A△B).
//   renderManifest()         — Node-side: render the `## Coverage Manifest` markdown block (M3).
//
// Provenance: the shadow-pierce `deepAll` idiom is reused from `.playwright-cli/pricing-state-eval.js`
// (recon 2026-06-18). The Heuristic-A v2 predicate is the pilot §7.4 net (canonical
// accessibility-scanner role/native/attr set; landmark + bare-container roles excluded).

/**
 * Runs in the browser (serialized via page.evaluate). Self-contained — no module-scope refs.
 * @returns {{entries: Array, candidates: Array, stats: object}}
 *   entries:    [{ key, role, name, why, inA, inB, disabled }]  (the union, deduped by element-key)
 *   candidates: [{ idx, key, role, name }]  (cursor:pointer G1 candidates; idx → window.__wcCands)
 *   stats:      { scanned, shadowHosts, uniqueKeys, skeletons }
 */
export function inPageEnumerate(rootSelector) {
  // ---- role sets (WAI-ARIA 1.2 widget roles vs. composite-container / landmark / structure) ----
  var WIDGET_ROLES = { button:1, checkbox:1, combobox:1, textbox:1, searchbox:1, radio:1, switch:1,
    tab:1, link:1, menuitem:1, menuitemcheckbox:1, menuitemradio:1, slider:1, option:1,
    spinbutton:1, treeitem:1, gridcell:1, scrollbar:1 };
  var CONTAINER_ROLES = { menu:1, menubar:1, tablist:1, tree:1, grid:1, listbox:1, treegrid:1, radiogroup:1 };
  var NONINTERACTIVE_ROLES = { banner:1, navigation:1, main:1, region:1, heading:1, list:1, listitem:1,
    img:1, tooltip:1, status:1, alert:1, progressbar:1, tabpanel:1, presentation:1, none:1, document:1,
    article:1, complementary:1, contentinfo:1, group:1, rowgroup:1, table:1, row:1, separator:1,
    toolbar:1, columnheader:1, rowheader:1, dialog:1, alertdialog:1 };

  // ---- shadow-pierce: every element in the document, descending into open shadow roots ----
  function deepAll(root) {
    var found = [];
    function walk(node) {
      var kids;
      try { kids = node.querySelectorAll('*'); } catch (e) { return; }
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        found.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }
    walk(root);
    return found;
  }

  function attr(el, a) { try { return el.getAttribute(a); } catch (e) { return null; } }
  function tag(el) { return el.tagName ? el.tagName.toLowerCase() : ''; }

  function isHidden(el, cs) {
    if (el.hidden) return true;
    if (attr(el, 'inert') !== null) return true;
    if (el.closest) { try { if (el.closest('[inert]')) return true; } catch (e) {} }
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
    return false;
  }

  function isDisabled(el) {
    if (el.disabled === true) return true;
    if (attr(el, 'disabled') !== null) return true;
    if (attr(el, 'aria-disabled') === 'true') return true;
    return false;
  }

  function accName(el) {
    var n = attr(el, 'aria-label') || attr(el, 'placeholder') || attr(el, 'title') || attr(el, 'name');
    if (!n) { try { n = (el.textContent || '').trim(); } catch (e) { n = ''; } }
    return (n || '').replace(/\s+/g, ' ').slice(0, 40);
  }

  // ancestor-path for the M2 structural key: prefer testid, then name/id, else tag; up to 6 hops,
  // piercing shadow boundaries via the host. Works for new-site (testid-rich) AND testid-less baseline.
  function ancestorPath(el) {
    var a = el.parentElement || (el.getRootNode && el.getRootNode() && el.getRootNode().host) || null;
    var parts = [], hops = 0;
    while (a && hops < 6) {
      var t = a.getAttribute && (a.getAttribute('data-testid') || a.getAttribute('name') || a.id);
      parts.unshift(t ? t : (a.tagName ? a.tagName.toLowerCase() : '?'));
      a = a.parentElement || (a.getRootNode && a.getRootNode() && a.getRootNode().host) || null;
      hops++;
    }
    return parts.join('/');
  }

  // M2 element-key: testid → name/id → structural fingerprint (role + accessible-name + ancestor-path).
  function keyOf(el) {
    var t = attr(el, 'data-testid');
    if (t) return 'testid:' + t;
    var nm = attr(el, 'name');
    if (nm) return 'name:' + nm + '|' + (attr(el, 'role') || tag(el));
    if (el.id) return 'id:' + el.id;
    var role = attr(el, 'role') || tag(el);
    return 'struct:' + role + '|' + accName(el) + '|' + ancestorPath(el);
  }

  // Heuristic-A v2 (interactive widget net). Returns a reason string or null.
  function matchReasonA(el) {
    var t = tag(el);
    if (attr(el, 'data-testid') !== null) return 'testid';
    var role = attr(el, 'role');
    if (role && WIDGET_ROLES[role]) return 'role:' + role;
    if (t === 'button' || t === 'select' || t === 'textarea') return 'native:' + t;
    if (t === 'input' && (attr(el, 'type') || '') !== 'hidden') return 'native:input';
    if (t === 'a' && el.hasAttribute('href')) return 'native:a[href]';
    if (t === 'area' && el.hasAttribute('href')) return 'native:area[href]';
    if (t === 'summary') return 'native:summary';
    if (t === 'details') return 'native:details';
    if ((t === 'audio' || t === 'video') && el.hasAttribute('controls')) return 'native:' + t + '[controls]';
    if (t === 'iframe' || t === 'object' || t === 'embed') return 'native:' + t;
    var ce = attr(el, 'contenteditable');
    if (ce !== null && ce !== 'false') return 'contenteditable';
    var ti = attr(el, 'tabindex');
    if (ti !== null && !isNaN(parseInt(ti, 10))) return 'tabindex';
    if (attr(el, 'draggable') === 'true') return 'draggable';
    return null;
  }

  // Heuristic-B: native-focusable ∪ [tabindex>=0]. Disabled ⇒ not focusable (so disabled controls
  // land in A∖B and become the A△B review set per M4 — they are not silently dropped).
  function isFocusable(el) {
    if (isDisabled(el)) return false;
    var t = tag(el);
    var ti = attr(el, 'tabindex');
    if (ti !== null && !isNaN(parseInt(ti, 10)) && parseInt(ti, 10) >= 0) return true;
    if (t === 'a' || t === 'area') return el.hasAttribute('href');
    if (t === 'button' || t === 'select' || t === 'textarea') return true;
    if (t === 'input') return (attr(el, 'type') || '') !== 'hidden';
    if (t === 'iframe' || t === 'summary') return true;
    if ((t === 'audio' || t === 'video') && el.hasAttribute('controls')) return true;
    var ce = attr(el, 'contenteditable');
    if (ce !== null && ce !== 'false') return true;
    return false;
  }

  // Cause-4 fix: scope enumeration to <main> to exclude app-shell chrome.
  // If rootSelector is provided and no matching element exists, throw CONTAINER_NOT_FOUND
  // rather than silently falling back to document — a fallback reintroduces the exact bug.
  var rootEl;
  if (rootSelector) {
    rootEl = document.querySelector(rootSelector);
    if (!rootEl) {
      throw new Error('CONTAINER_NOT_FOUND: no <' + rootSelector + '> element found on ' + location.href + '. Refusing to enumerate — no fallback to document.');
    }
  } else {
    rootEl = document;
  }
  var all = deepAll(rootEl);
  var shadowHosts = 0;
  var map = {};            // element-key -> entry (union, deduped)
  var order = [];
  window.__wcCands = [];   // cursor:pointer candidate element refs (for CDP G1-recovery, by index)
  var candidates = [];

  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (el.shadowRoot) shadowHosts++;

    // One getComputedStyle per element (cheap to read after; gate behind a pre-filter on very large
    // pages — for the pricing surface ~900 elements this is negligible).
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { cs = null; }
    if (isHidden(el, cs)) continue;   // genuinely non-rendered → out of scope (also skips G1 cursor)

    var role0 = attr(el, 'role');
    var reasonA = matchReasonA(el);
    // Exclude bare composite containers + non-interactive landmark/structure roles from Pass A,
    // even when testid'd or role-matched (deepAll already walks their children independently).
    if (reasonA && role0 && CONTAINER_ROLES[role0]) reasonA = null;
    if (reasonA && reasonA.indexOf('role:') === 0 && role0 && NONINTERACTIVE_ROLES[role0]) reasonA = null;

    var focB = isFocusable(el);

    if (reasonA || focB) {
      var key = keyOf(el);
      var e = map[key];
      if (!e) {
        e = { key: key, role: role0 || tag(el), name: accName(el),
              why: reasonA || 'focusable', inA: false, inB: false, disabled: isDisabled(el), occurrences: 1 };
        map[key] = e; order.push(key);
      } else {
        e.occurrences = (e.occurrences || 1) + 1;
      }
      if (reasonA) { e.inA = true; if (e.why === 'focusable') e.why = reasonA; }
      if (focB) e.inB = true;
      continue;
    }

    // G1 candidate: cursor:pointer, pointer-events != none, outermost in its pointer subtree,
    // not already a hard-interactive element. Needs CDP getEventListeners confirm (Node side).
    if (cs && cs.cursor === 'pointer' && cs.pointerEvents !== 'none') {
      var par = el.parentElement;
      var parPointer = false;
      if (par) { try { parPointer = getComputedStyle(par).cursor === 'pointer'; } catch (e2) {} }
      if (!parPointer) {
        var idx = window.__wcCands.length;
        window.__wcCands.push(el);
        candidates.push({ idx: idx, key: keyOf(el), role: role0 || tag(el), name: accName(el) });
      }
    }
  }

  var entries = order.map(function (k) { return map[k]; });
  return { entries: entries, candidates: candidates,
           stats: { scanned: all.length, shadowHosts: shadowHosts, uniqueKeys: entries.length,
                   // loading placeholders still on the page — readiness consumes this so it
                   // costs no extra round-trip (shadcn/ui convention, app-wide not per-surface)
                   skeletons: (rootEl.querySelectorAll ? rootEl : document).querySelectorAll('[data-slot="skeleton"]').length } };
}

// ---------------------------------------------------------------------------------------------
// Node-side helpers
// ---------------------------------------------------------------------------------------------

/** Normalize a key into its repeating-row TEMPLATE by collapsing digit runs to '#'. */
export function templateKey(key) {
  return String(key).replace(/\d+/g, '#');
}

/**
 * F3 / G8 archetype collapse. Homogeneous repeating-row cell-sets (grid bodies, virtualized rows)
 * differing only by a row index collapse to ONE per-column archetype with a rowCount annotation,
 * so the denominator is data-volume-INDEPENDENT (32 rows × 4 controls → 4 archetypes, not 128).
 * "Homogeneous" = same `role` AND same `why`. Groups below `threshold` are left as individual rows.
 * Item 6: collapse key incorporates column identity so two cells in different columns (Override
 * Price vs Max Discount) are never merged even if they display the same value.
 * @param {Array} entries  [{ key, role, name, why, inA, inB, disabled }]
 * @param {number} threshold  minimum group size to collapse (default 4)
 */
export function collapseArchetypes(entries, threshold = 4) {
  const groups = new Map();
  for (const e of entries) {
    // Item 6: include column identity in the collapse key. Column identity is derived from the
    // accessible name or the last path segment of struct: keys (the innermost ancestor).
    const tk = templateKey(e.key);
    const colId = extractColumnIdentity(e);
    const groupKey = colId ? `${tk}||col:${colId}` : tk;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(e);
  }
  const out = [];
  for (const [gk, members] of groups) {
    const tk = templateKey(members[0].key);
    const homogeneous = members.every(m => m.role === members[0].role && m.why === members[0].why);
    if (members.length >= threshold && homogeneous && tk !== members[0].key) {
      out.push({
        key: `${tk} [archetype×${members.length}]`,
        role: members[0].role,
        name: members[0].name,
        why: members[0].why,
        inA: members.some(m => m.inA),
        inB: members.some(m => m.inB),
        disabled: members.every(m => m.disabled),
        archetype: true,
        rowCount: members.length,
      });
    } else {
      out.push(...members);
    }
  }
  return out;
}

/** Extract column identity from an entry's key for collapse dedup (Item 6). */
function extractColumnIdentity(entry) {
  const key = entry.key;
  // testid: keys often encode column info as the last hyphenated segment before row digits
  if (key.startsWith('testid:')) {
    const parts = key.slice(7).split('-');
    // Find the column portion by stripping trailing numeric parts (row indices)
    const nonNumeric = parts.filter(p => !/^\d+$/.test(p));
    return nonNumeric.length > 0 ? nonNumeric.join('-') : null;
  }
  // struct: keys encode ancestor path; column is typically in the accessible name
  if (key.startsWith('struct:')) {
    const segments = key.slice(7).split('|');
    const name = segments[1] || '';
    if (name) return name;
  }
  // name: keys have format "name:fieldName|role"
  if (key.startsWith('name:')) {
    return key.slice(5).split('|')[0] || null;
  }
  return null;
}

/**
 * M4 set algebra over union entries carrying inA / inB membership.
 * @returns {{ unionCount, intersectionCount, symDiffCount, symDiff: Array, crossCheckHint: string }}
 *   symDiff = the A△B REVIEW set (each needs a disposition; NOT an auto-DENY per F2).
 */
export function setAlgebra(entries) {
  const union = entries;
  const intersection = entries.filter(e => e.inA && e.inB);
  const symDiff = entries.filter(e => (e.inA && !e.inB) || (!e.inA && e.inB))
    .map(e => ({ key: e.key, role: e.role, name: e.name, in: e.inA ? 'A-only' : 'B-only',
                 disabled: !!e.disabled }));
  return {
    unionCount: union.length,
    intersectionCount: intersection.length,
    symDiffCount: symDiff.length,
    symDiff,
    // Hint only — the real CrossCheck verdict is "every union element dispositioned AND every
    // A△B element classified" (computed from the filled manifest, not from raw counts).
    crossCheckHint: symDiff.length === 0 ? 'A==B (no review set)' : `${symDiff.length} A△B element(s) to review`,
  };
}

/**
 * Render the `## Coverage Manifest (machine-enumerated)` markdown block (M3). The disposition
 * column is emitted UNFILLED — the agent dispositions every row; Coverage_Ratio starts at 0/N.
 * @param {object} o  { walkState, entries, machineFoundDate, sourceJson }
 */
export function renderManifest({ walkState, entries, machineFoundDate, sourceJson, completionRecord, baseState }) {
  const N = entries.length;
  const lines = [];
  lines.push('## Coverage Manifest (machine-enumerated)');
  lines.push('');
  lines.push('<!-- Frontmatter keys to copy into the artifact header (LR-062): -->');
  lines.push('<!--');
  lines.push(`Coverage_Ratio: 0/${N} (0%)   # update as you disposition; closure Cx requires 100%`);
  lines.push(`Walk_State: ${walkState}`);
  lines.push('CrossCheck: <pending>          # "clean" once every A△B review-set element is classified');
  if (completionRecord) {
    lines.push(`Completion_Record: ${sourceJson} (status=${completionRecord.status}, elements=${completionRecord.element_count})`);
  }
  if (baseState) {
    lines.push(`base_state: atRest=[${(baseState.atRest || []).join(', ')}] atEmit=[${(baseState.atEmit || []).join(', ')}]`);
  }
  lines.push('-->');
  lines.push('');
  lines.push(`Machine denominator: **${N}** element(s). Provenance JSON: \`${sourceJson}\`.`);
  lines.push('Disposition every row (no blanks): `covered-by-TC: <TC-ID>` / `affordance-probed: <LR-057 token>` / `read-only-verified` / `out-of-scope: <reason ≥20 chars>`.');
  lines.push('Grid / list / table / result surfaces ALSO carry `behavior-cases: <families>` (LR-065 — §3 surface families: result-fidelity/pagination/sorting/combination/render-state/empty-vol/persistence; ≥1 QUICK TC per applicable family, inapplicable → `out-of-scope:<family>=<reason ≥20 chars>`). Sub-rules: link-cell → render assertion; file-control → file-I/O.');
  lines.push('');
  lines.push('| element-key | role | machine-found (date) | disposition |');
  lines.push('|---|---|---|---|');
  for (const e of entries) {
    const lens = e.inA && e.inB ? '' : (e.inA ? ' _(A∖B review)_' : ' _(B∖A review)_');
    const dis = e.disabled ? ' _(disabled)_' : '';
    const occ = e.occurrences && e.occurrences > 1 ? ` (×${e.occurrences} live)` : '';
    lines.push(`| \`${e.key}\`${lens}${dis}${occ} | ${e.role} | ${machineFoundDate} | _undispositioned_ |`);
  }
  lines.push('');
  return lines.join('\n');
}
