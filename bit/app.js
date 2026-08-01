/*
  app.js - orchestrates the Bit Gamer graph: loads content, builds the
  hierarchy (children) and cross-link (related) lookups, drives the
  overview-plus-focus navigation model, and renders the info panel and
  navigation chrome (breadcrumb, back/home, drawer, URL hash). graph.js
  stays a dumb renderer of whatever "scene" it's handed; all content,
  hierarchy, and routing logic lives here.
*/

(async function () {
  const stage = document.getElementById('graphStage');
  const panel = document.getElementById('nodePanel');
  const statusEl = document.getElementById('graphStatus');
  const breadcrumbEl = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  const homeBtn = document.getElementById('homeBtn');
  const drawerToggleBtn = document.getElementById('drawerToggle');
  const drawer = document.getElementById('navDrawer');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');
  const drawerList = document.getElementById('drawerList');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const panelPortal = document.getElementById('panelPortal');
  const graphLayout = document.querySelector('.graph-layout');

  // .instrument uses backdrop-filter, which makes it a containing block
  // for position:fixed descendants - the mobile bottom-sheet treatment
  // needs #nodePanel to actually escape to the real viewport, so it
  // moves to a body-level portal at the mobile breakpoint and back into
  // its normal grid slot at desktop widths. This only reparents a DOM
  // node on a media-query flip, not a full relayout - no geometry
  // recomputation is involved.
  const mobileQuery = window.matchMedia('(max-width: 860px)');
  function syncPanelParent() {
    if (mobileQuery.matches) {
      if (panel.parentElement !== panelPortal) panelPortal.appendChild(panel);
    } else if (panel.parentElement !== graphLayout) {
      graphLayout.appendChild(panel);
    }
  }
  syncPanelParent();
  mobileQuery.addEventListener('change', syncPanelParent);

  const HERO_SUBTITLE = { root: 'Root of the Ecosystem', chapter: 'Chapter', topic: 'System' };
  const KICKER = { root: 'root node', chapter: 'chapter', topic: 'system' };
  const CROSSLINK_CAP = 6;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  let content;
  try {
    const res = await fetch('content/nodes.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    content = await res.json();
  } catch (err) {
    stage.innerHTML = `<p class="graph-error">Could not load content/nodes.json (${escapeHtml(err.message)}). This prototype uses fetch(), so it needs to be served over http - open it via the project's static server rather than double-clicking index.html.</p>`;
    return;
  }

  // ---------- data model: root + chapters + topics, one lookup, one
  // parent map derived by walking children from root (it's a strict
  // tree, so a node can only ever have one parent). ----------
  const allNodes = [
    { ...content.root, kind: 'root' },
    ...(content.chapters || []).map((c) => ({ ...c, kind: 'chapter' })),
    ...content.nodes.map((n) => ({ ...n, kind: 'topic' })),
  ];
  const byId = new Map(allNodes.map((n) => [n.id, n]));

  const parentOf = new Map();
  (function walk(id) {
    const node = byId.get(id);
    (node.children || []).forEach((childId) => {
      parentOf.set(childId, id);
      walk(childId);
    });
  })(content.root.id);

  function ancestorPath(id) {
    const path = [id];
    let cur = id;
    while (parentOf.has(cur)) {
      cur = parentOf.get(cur);
      path.unshift(cur);
    }
    return path;
  }

  // ---------- scene computation: what's visible for a given focus.
  // Root/chapter focus shows direct children only. A leaf topic shows
  // its siblings (for lateral context) plus a capped, relevance-scored
  // set of its own related cross-links - never every cross-link at
  // once. ----------
  function computeScene(focusedId, focusAfterId) {
    const node = byId.get(focusedId);
    const children = (node.children || []).map((id) => byId.get(id)).filter(Boolean);

    let ring;
    if (children.length) {
      ring = children.map((c) => ({ node: c, kind: 'child' }));
    } else {
      const parentId = parentOf.get(focusedId);
      const parent = parentId ? byId.get(parentId) : null;
      const siblingIds = parent ? (parent.children || []).filter((id) => id !== focusedId) : [];
      const siblingSet = new Set(siblingIds);
      const siblings = siblingIds.map((id) => byId.get(id)).filter(Boolean).map((n) => ({ node: n, kind: 'sibling' }));

      const candidates = (node.related || []).filter((id) => id !== focusedId && !siblingSet.has(id) && byId.has(id));
      const score = (id) => {
        const cand = byId.get(id);
        const candRelated = new Set(cand.related || []);
        let s = 0;
        siblingIds.forEach((sid) => { if (candRelated.has(sid)) s++; });
        return s;
      };
      const ranked = candidates
        .map((id, i) => ({ id, s: score(id), i }))
        .sort((a, b) => (b.s - a.s) || (a.i - b.i))
        .slice(0, CROSSLINK_CAP)
        .map(({ id }) => ({ node: byId.get(id), kind: 'crosslink' }));

      ring = [...siblings, ...ranked];
    }

    // Edges: a spoke from the center to every ring node, plus a
    // relation edge between any two ring nodes that are themselves
    // related - so a real cross-system link between two siblings (or
    // two cross-links) still shows up as its own line, not just as two
    // separate spokes.
    const edges = ring.map((entry) => [focusedId, entry.node.id, { crossLink: entry.kind === 'crosslink' }]);
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 1; j < ring.length; j++) {
        const a = ring[i].node, b = ring[j].node;
        const aRel = new Set(a.related || []);
        const bRel = new Set(b.related || []);
        if (aRel.has(b.id) || bRel.has(a.id)) edges.push([a.id, b.id, {}]);
      }
    }

    return {
      centerId: focusedId,
      center: { ...node, heroSubtitle: HERO_SUBTITLE[node.kind] || '' },
      ring,
      edges,
      focusAfterId,
    };
  }

  // ---------- panel ----------
  let renderGen = 0;

  function chipRow(label, ids, dataAttr) {
    const chips = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((n) => `<button class="node-chip" data-${dataAttr}="${n.id}" type="button">${escapeHtml(n.title)}</button>`)
      .join('');
    if (!chips) return '';
    return `<p class="panel-kicker panel-related-label">${label}</p><div class="panel-related">${chips}</div>`;
  }

  function paintPanel(node) {
    let body;
    if (node.kind === 'chapter') {
      body = `
        <p class="panel-summary panel-summary--chapter">${escapeHtml(node.summary).replace(/\n\n/g, '</p><p class="panel-summary panel-summary--chapter">')}</p>
        ${chipRow('start exploring', node.children || [], 'nav')}
      `;
    } else {
      const relatedIds = node.id === content.root.id ? (node.children || []) : (node.related || []);
      body = `
        <p class="panel-summary">${escapeHtml(node.summary)}</p>
        <details class="panel-disclosure"><summary>Details</summary><p>${escapeHtml(node.details)}</p></details>
        <details class="panel-disclosure"><summary>Deep dive</summary><p>${escapeHtml(node.deepDive)}</p></details>
        ${chipRow('related', relatedIds, node.id === content.root.id ? 'nav' : 'related')}
      `;
    }

    panel.innerHTML = `
      <button class="panel-sheet-toggle" type="button" aria-label="Expand panel"><span class="panel-sheet-grip" aria-hidden="true"></span></button>
      <button class="panel-close" type="button" aria-label="Close">&#10005;</button>
      <p class="panel-kicker">${KICKER[node.kind] || 'system'}</p>
      <h2 class="panel-title">${escapeHtml(node.title)}</h2>
      ${body}
    `;
    panel.scrollTop = 0;
    panel.classList.remove('is-swapping');
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');

    panel.querySelector('.panel-close').addEventListener('click', closePanel);
    panel.querySelector('.panel-sheet-toggle').addEventListener('click', () => {
      panel.classList.toggle('is-expanded');
    });
    panel.querySelectorAll('[data-related]').forEach((chip) => {
      chip.addEventListener('click', () => navigateTo(chip.dataset.related));
    });
    panel.querySelectorAll('[data-nav]').forEach((chip) => {
      chip.addEventListener('click', () => navigateTo(chip.dataset.nav));
    });

    statusEl.textContent = 'viewing ' + node.title;
  }

  function renderPanel(node) {
    const gen = ++renderGen;
    if (panel.classList.contains('is-open') && panel.childElementCount) {
      panel.classList.add('is-swapping');
      window.setTimeout(() => {
        if (gen !== renderGen) return;
        paintPanel(node);
      }, 150);
    } else {
      paintPanel(node);
    }
  }

  function closePanel() {
    renderGen++;
    panel.classList.remove('is-open', 'is-swapping');
    panel.setAttribute('aria-hidden', 'true');
    statusEl.textContent = 'ready';
  }

  // ---------- breadcrumb / back / home ----------
  function renderBreadcrumb(focusedId) {
    const path = ancestorPath(focusedId);
    breadcrumbEl.innerHTML = path
      .map((id, i) => {
        const n = byId.get(id);
        const isLast = i === path.length - 1;
        const label = escapeHtml(n.title);
        if (isLast) return `<span class="crumb is-current" aria-current="page">${label}</span>`;
        return `<button class="crumb" type="button" data-nav="${id}">${label}</button>`;
      })
      .join('<span class="crumb-sep" aria-hidden="true">/</span>');
    breadcrumbEl.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
    });
    backBtn.disabled = path.length <= 1;
  }

  backBtn.addEventListener('click', () => {
    const parentId = parentOf.get(focusedId);
    if (parentId) navigateTo(parentId);
  });
  homeBtn.addEventListener('click', () => navigateTo(content.root.id));

  // ---------- nav drawer: a full, keyboard-accessible tree - the
  // non-spatial way to reach any of the 19 nodes without navigating
  // the graph itself. ----------
  function buildDrawerList() {
    const topLevel = (content.root.children || []).map((id) => byId.get(id)).filter(Boolean);
    drawerList.innerHTML = topLevel
      .map((n) => {
        const kids = (n.children || []).map((id) => byId.get(id)).filter(Boolean);
        const childItems = kids.length
          ? `<ul class="drawer-sublist">${kids.map((k) => `<li><button class="drawer-item drawer-item--child" type="button" data-nav="${k.id}">${escapeHtml(k.title)}</button></li>`).join('')}</ul>`
          : '';
        return `<li><button class="drawer-item" type="button" data-nav="${n.id}">${escapeHtml(n.title)}</button>${childItems}</li>`;
      })
      .join('');
    drawerList.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => { navigateTo(btn.dataset.nav); closeDrawer(); });
    });
  }
  buildDrawerList();

  function openDrawer() {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerBackdrop.hidden = false;
    requestAnimationFrame(() => drawerBackdrop.classList.add('is-open'));
    drawerToggleBtn.setAttribute('aria-expanded', 'true');
    const firstItem = drawerList.querySelector('.drawer-item');
    if (firstItem) firstItem.focus();
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerBackdrop.classList.remove('is-open');
    window.setTimeout(() => { if (!drawer.classList.contains('is-open')) drawerBackdrop.hidden = true; }, 250);
    drawerToggleBtn.setAttribute('aria-expanded', 'false');
  }
  drawerToggleBtn.addEventListener('click', () => {
    if (drawer.classList.contains('is-open')) closeDrawer(); else openDrawer();
  });
  drawerCloseBtn.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);

  // ---------- navigation core ----------
  let focusedId = null;

  function navigateTo(id, { replace = false, focusAfterId = null } = {}) {
    if (!byId.has(id) || id === focusedId) return;
    focusedId = id;
    const node = byId.get(id);
    const scene = computeScene(id, focusAfterId);
    graph.focus(scene);
    renderPanel(node);
    renderBreadcrumb(id);
    panel.classList.remove('is-expanded');
    const hash = '#' + id;
    if (replace) window.history.replaceState({ id }, '', hash);
    else window.history.pushState({ id }, '', hash);
  }

  window.addEventListener('popstate', () => {
    const id = (window.location.hash || '').slice(1);
    if (id && byId.has(id) && id !== focusedId) {
      focusedId = id;
      const node = byId.get(id);
      graph.focus(computeScene(id));
      renderPanel(node);
      renderBreadcrumb(id);
    } else if (!id && focusedId !== content.root.id) {
      focusedId = content.root.id;
      graph.focus(computeScene(content.root.id));
      renderPanel(byId.get(content.root.id));
      renderBreadcrumb(content.root.id);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (drawer.classList.contains('is-open')) { closeDrawer(); return; }
      if (panel.classList.contains('is-open')) closePanel();
    }
  });

  const graph = createGraph(stage, {
    onSelect(id) { navigateTo(id); },
  });

  // Initial state: a valid #hash deep-links straight to that node;
  // otherwise start at the root overview.
  const initialId = (window.location.hash || '').slice(1);
  const startId = initialId && byId.has(initialId) ? initialId : content.root.id;
  focusedId = startId;
  graph.focus(computeScene(startId));
  renderPanel(byId.get(startId));
  renderBreadcrumb(startId);
  window.history.replaceState({ id: startId }, '', '#' + startId);
})();
