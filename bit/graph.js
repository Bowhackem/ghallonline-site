/*
  graph.js - a small, dependency-free radial knowledge-graph renderer,
  now focus-aware: it renders one "scene" at a time (a center node plus
  a ring of nodes around it) and can transition to a new scene on
  request. It still knows nothing about chapters, topics, or content
  shape - app.js decides *which* nodes belong in a scene (children of
  the focus, or siblings + cross-links for a leaf topic); graph.js just
  lays out and animates whatever set it's handed. Icon lookup keyed by
  node id is the only content-shaped thing here, and it falls back to a
  generic mark for anything unrecognized.

  Coordinate space: everything is computed in a fixed 0-1000 logical
  square and expressed as percentages, so the graph scales with its
  container without any resize listeners or pixel math.

  Node anchor geometry: each node's clickable element is sized to
  exactly match its visual dot (no surrounding label/padding folded
  into the box), and is centered on its logical (x, y) with
  translate(-50%, -50%). That guarantees every edge - which terminates
  at the same (x, y) - always meets the dot dead center, in every
  animation frame, at every drift offset, regardless of how large the
  dot itself is drawn. The caption label is a separate, non-centering
  child positioned outward from the dot along that node's own ring
  angle, so it reads as attached to the node without shifting where
  the node itself actually is. The scene's center node is the one
  exception: it never moves and never has an outgoing "which way is
  outward" question, so its label lives inside the circle itself.

  Scene model: the stage (SVG defs/decorative guides, the node layer)
  is built once. Everything that depends on *which* nodes are visible -
  edges, connection markers, node buttons, their layout - lives in a
  "scene" that gets torn down and rebuilt on every focus() call, with
  a quick exit fade before the old one goes and the same staggered
  entrance choreography already used for first load playing for the
  new one.
*/

const NODE_ICONS = {
  'bit-gamer': '<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="4.6" r="1.5"/><circle cx="19.4" cy="12" r="1.5"/><circle cx="12" cy="19.4" r="1.5"/><circle cx="4.6" cy="12" r="1.5"/><path d="M12 6.8v2.6M12 14.6v2.6M17.2 12h-2.6M9.4 12H6.8"/>',
  vision: '<path d="M2 12s3.6-6.2 10-6.2S22 12 22 12s-3.6 6.2-10 6.2S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  identity: '<path d="M12 3a9 9 0 0 0-9 9c0 3 1 5 2 6.5"/><path d="M12 6.6A5.4 5.4 0 0 0 6.6 12c0 2.2.6 3.8 1.5 5"/><path d="M12 10.2a1.8 1.8 0 0 0-1.8 1.8c0 2 .7 3.3 1.3 4.2"/><path d="M12 3a9 9 0 0 1 9 9c0 1.8-.3 3.2-.8 4.3"/>',
  'blockchain-trust-layer': '<path d="M12 3.2 19 6v5c0 5-3.1 8.3-7 9.8-3.9-1.5-7-4.8-7-9.8V6l7-2.8Z"/><path d="M9 12.2l2 2 4-4.2"/>',
  rewards: '<path d="M7.2 4.2h9.6v3.6a4.8 4.8 0 0 1-9.6 0V4.2Z"/><path d="M7.2 5.2H4.4v.9a3.8 3.8 0 0 0 3.6 3.8"/><path d="M16.8 5.2h2.8v.9a3.8 3.8 0 0 1-3.6 3.8"/><path d="M12 12.6v2.6"/><path d="M9.2 19.4h5.6"/><path d="M10.1 16.4h3.8l.5 2.6H9.6l.5-2.6Z"/>',
  'tournament-hosts': '<path d="M6 3v18"/><path d="M6 4.4h11l-2.4 3.3L17 11H6"/>',
  analytics: '<rect x="3.6" y="12.4" width="3.2" height="7.6" rx="0.6"/><rect x="10.4" y="7.4" width="3.2" height="12.6" rx="0.6"/><rect x="17.2" y="3.8" width="3.2" height="16.2" rx="0.6"/>',
  platform: '<rect x="5.2" y="5.2" width="13.6" height="13.6" rx="2.4"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2.2v3M15 2.2v3M9 18.8v3M15 18.8v3M2.2 9h3M2.2 15h3M18.8 9h3M18.8 15h3"/>',
  developers: '<path d="M8.4 6.4 3.4 12l5 5.6"/><path d="M15.6 6.4l5 5.6-5 5.6"/>',
  marketplace: '<path d="M3.4 4.4h2l2.3 12a2 2 0 0 0 2 1.7h7.2a2 2 0 0 0 2-1.6l1.7-8.5H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="16.6" cy="20" r="1.3"/>',
  sponsors: '<circle cx="12" cy="8.2" r="4.8"/><path d="M9.2 12.4 7.2 20.6l4.8-2.8 4.8 2.8-2-8.2"/>',
  organizations: '<rect x="5.4" y="3.2" width="13.2" height="17.6" rx="1"/><path d="M9 7.4h1M14 7.4h1M9 11.4h1M14 11.4h1M9 15.4h1M14 15.4h1"/><path d="M10 20.8v-3.6h4v3.6"/>',
  players: '<circle cx="12" cy="8.4" r="3.2"/><path d="M5.2 19.6c0-3.8 2.9-6.2 6.8-6.2s6.8 2.4 6.8 6.2"/>',
  academy: '<path d="M12 5 2.4 9l9.6 3.8L21.6 9 12 5Z"/><path d="M6.4 11.2v4.4c0 1.5 2.6 2.8 5.6 2.8s5.6-1.3 5.6-2.8v-4.4"/><path d="M21.6 9v5.8"/>',
  streaming: '<circle cx="12" cy="12" r="1.6"/><path d="M8.6 8.6a5 5 0 0 0 0 6.8"/><path d="M15.4 8.6a5 5 0 0 1 0 6.8"/><path d="M5.9 5.9a9 9 0 0 0 0 12.2"/><path d="M18.1 5.9a9 9 0 0 1 0 12.2"/>',
  'people-community': '<circle cx="8" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><path d="M3.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5"/><path d="M11.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5"/>',
  'building-ecosystem': '<path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="M3 12.5 12 17l9-4.5"/><path d="M3 17 12 21.5 21 17"/>',
  'identity-trust': '<path d="M12 3.2 19 6v5c0 5-3.1 8.3-7 9.8-3.9-1.5-7-4.8-7-9.8V6l7-2.8Z"/>',
  economy: '<circle cx="9" cy="9" r="5"/><circle cx="15" cy="15" r="5"/><path d="M7.5 9h3"/>',
};
const FALLBACK_ICON = '<circle cx="12" cy="12" r="7"/><path d="M12 8.4v4.4l3 2"/>';

function createGraph(container, { onSelect, onHoverChange }) {
  const SIZE = 1000;
  const CENTER = SIZE / 2;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Node sizing scales continuously with the *actual measured* stage
  // width rather than a couple of hand-picked device breakpoints - see
  // Phase 2.5/3 notes. Measured once; this stage element is never
  // resized out from under itself (no resize listener, by design).
  container.classList.add('graph-stage');
  const stagePx = container.clientWidth || 700;
  const sizeScale = Math.max(0.44, Math.min(1, stagePx / 720));
  const ringFraction = 0.335 + 0.065 * Math.max(0, Math.min(1, (stagePx - 260) / 420));
  const RING_RADIUS = SIZE * ringFraction;
  const pxPerUnit = stagePx / SIZE;

  // ---------- seeded random (mulberry32) - stays a single running
  // sequence across scene rebuilds, so drift/scatter are deterministic
  // for a given navigation path without needing per-id seeding. ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260724);
  const bgRand = mulberry32(7742021);

  function directionFromAngle(angle) {
    let deg = (angle * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    const dirs = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
    return dirs[Math.round(deg / 45) % 8];
  }
  const DIR_WHEEL = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  function neighborDirs(dir) {
    const i = DIR_WHEEL.indexOf(dir);
    if (i === -1) return [];
    return [DIR_WHEEL[(i + 1) % 8], DIR_WHEEL[(i + 7) % 8]];
  }
  function labelWraps(textEl) {
    const prevWS = textEl.style.whiteSpace;
    textEl.style.whiteSpace = 'nowrap';
    const natural = textEl.scrollWidth;
    textEl.style.whiteSpace = prevWS;
    return natural > textEl.clientWidth + 1;
  }
  function wrapIcon(inner) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  // ---------- persistent stage: SVG root, glow filter, and the
  // decorative background (concentric guide rings, radial grid, a
  // scatter of tiny "network" points). Built once and left alone by
  // every subsequent scene change - only the edges/markers/nodes
  // layers get torn down and rebuilt on focus(). ----------
  container.innerHTML = '';

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'graph-lines');
  svg.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(svgNS, 'defs');
  const glow = document.createElementNS(svgNS, 'filter');
  glow.setAttribute('id', 'edgeGlow');
  glow.setAttribute('x', '-60%'); glow.setAttribute('y', '-60%');
  glow.setAttribute('width', '220%'); glow.setAttribute('height', '220%');
  const blur = document.createElementNS(svgNS, 'feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic');
  blur.setAttribute('stdDeviation', '4');
  blur.setAttribute('result', 'blurred');
  const merge = document.createElementNS(svgNS, 'feMerge');
  const mergeBlur = document.createElementNS(svgNS, 'feMergeNode');
  mergeBlur.setAttribute('in', 'blurred');
  const mergeSource = document.createElementNS(svgNS, 'feMergeNode');
  mergeSource.setAttribute('in', 'SourceGraphic');
  merge.appendChild(mergeBlur);
  merge.appendChild(mergeSource);
  glow.appendChild(blur);
  glow.appendChild(merge);
  defs.appendChild(glow);
  svg.appendChild(defs);

  const guides = document.createElementNS(svgNS, 'g');
  guides.setAttribute('class', 'graph-guides');
  [0.13, 0.22, 0.32, ringFraction, 0.48].forEach((frac, i) => {
    const ring = document.createElementNS(svgNS, 'circle');
    ring.setAttribute('cx', CENTER);
    ring.setAttribute('cy', CENTER);
    ring.setAttribute('r', SIZE * frac);
    ring.setAttribute('class', 'graph-guide-ring' + (i === 3 ? ' graph-guide-ring--orbit' : ''));
    guides.appendChild(ring);
  });
  const spokeCount = 16;
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const inner = SIZE * 0.08;
    const outer = SIZE * 0.485;
    const spoke = document.createElementNS(svgNS, 'line');
    spoke.setAttribute('x1', CENTER + Math.cos(a) * inner);
    spoke.setAttribute('y1', CENTER + Math.sin(a) * inner);
    spoke.setAttribute('x2', CENTER + Math.cos(a) * outer);
    spoke.setAttribute('y2', CENTER + Math.sin(a) * outer);
    spoke.setAttribute('class', 'graph-guide-spoke');
    guides.appendChild(spoke);
  }
  const scatterCount = 40;
  for (let i = 0; i < scatterCount; i++) {
    const a = bgRand() * Math.PI * 2;
    const r = SIZE * (0.5 + bgRand() * 0.46);
    const pt = document.createElementNS(svgNS, 'circle');
    pt.setAttribute('cx', CENTER + Math.cos(a) * r);
    pt.setAttribute('cy', CENTER + Math.sin(a) * r);
    pt.setAttribute('r', 1.3 + bgRand() * 1.7);
    pt.setAttribute('class', 'graph-guide-point');
    guides.appendChild(pt);
  }
  svg.appendChild(guides);

  const edgeLayer = document.createElementNS(svgNS, 'g');
  edgeLayer.setAttribute('class', 'graph-edge-layer');
  svg.appendChild(edgeLayer);

  const markerLayer = document.createElementNS(svgNS, 'g');
  markerLayer.setAttribute('class', 'graph-marker-layer');
  svg.appendChild(markerLayer);

  const nodeLayer = document.createElement('div');
  nodeLayer.className = 'graph-nodes';

  container.appendChild(svg);
  container.appendChild(nodeLayer);

  // ---------- per-scene mutable state ----------
  let sceneToken = 0;
  let isFirstScene = true;
  let hoveredId = null;
  let centerId = null;
  let buttonEls = new Map();
  let pathEls = new Map();
  let markerEls = new Map();
  let nodeRadiusById = new Map();
  let basePos = new Map();
  let currentPos = new Map();
  let drift = new Map();
  let neighbors = new Map();
  let edgeSet = new Map();
  let rafId = null;
  let entranceTimeoutId = null;
  let exitTimeoutId = null;

  function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  function applyHighlight() {
    const focusId = hoveredId || centerId;
    const related = focusId ? neighbors.get(focusId) : null;

    buttonEls.forEach((btn, id) => {
      const isFocus = id === focusId;
      const isConnected = focusId ? (related ? related.has(id) : false) : false;
      const isDimmed = focusId ? (!isFocus && !isConnected) : false;

      btn.classList.toggle('is-selected', id === centerId);
      btn.classList.toggle('is-focused', isFocus);
      btn.classList.toggle('is-connected', isConnected && !isFocus);
      btn.classList.toggle('is-dimmed', isDimmed);
    });

    pathEls.forEach(({ path }, key) => {
      const [a, b] = edgeSet.get(key);
      const touchesFocus = focusId && (a === focusId || b === focusId);
      const lit = Boolean(touchesFocus);
      const dimmed = Boolean(focusId) && !touchesFocus;
      path.classList.toggle('is-lit', lit);
      path.classList.toggle('is-dimmed', dimmed);
      const markers = markerEls.get(key);
      if (markers) markers.forEach((m) => {
        m.classList.toggle('is-lit', lit);
        m.classList.toggle('is-dimmed', dimmed);
      });
    });
  }

  function render() {
    currentPos.forEach((pos, id) => {
      const btn = buttonEls.get(id);
      if (btn) {
        const base = basePos.get(id);
        const dx = (pos.x - base.x) * pxPerUnit;
        const dy = (pos.y - base.y) * pxPerUnit;
        btn.style.setProperty('--drift-x', dx.toFixed(2) + 'px');
        btn.style.setProperty('--drift-y', dy.toFixed(2) + 'px');
      }
    });

    pathEls.forEach(({ path, isSpoke }, key) => {
      const [a, b] = edgeSet.get(key);
      const pa = currentPos.get(a);
      const pb = currentPos.get(b);
      if (!pa || !pb) return;

      const ra = nodeRadiusById.get(a) || 0;
      const rb = nodeRadiusById.get(b) || 0;
      const dxRaw = pb.x - pa.x;
      const dyRaw = pb.y - pa.y;
      const rawLen = Math.hypot(dxRaw, dyRaw) || 1;
      const ux = dxRaw / rawLen;
      const uy = dyRaw / rawLen;
      const markers = markerEls.get(key);
      if (markers) {
        const scale = 1 / pxPerUnit;
        markers[0].setAttribute('cx', pa.x + ux * ra * scale);
        markers[0].setAttribute('cy', pa.y + uy * ra * scale);
        markers[1].setAttribute('cx', pb.x - ux * rb * scale);
        markers[1].setAttribute('cy', pb.y - uy * rb * scale);
      }

      if (isSpoke) {
        path.setAttribute('d', `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`);
        return;
      }

      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      let nx = -dyRaw / rawLen;
      let ny = dxRaw / rawLen;
      const outIn = (mx + nx - CENTER) ** 2 + (my + ny - CENTER) ** 2;
      const outOut = (mx - nx - CENTER) ** 2 + (my - ny - CENTER) ** 2;
      if (outIn > outOut) { nx = -nx; ny = -ny; }
      const bow = Math.min(rawLen * 0.09, 46);
      const cx = mx + nx * bow;
      const cy = my + ny * bow;
      path.setAttribute('d', `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`);
    });
  }

  function tick(now) {
    drift.forEach((d, id) => {
      const base = basePos.get(id);
      const t = now / 1000;
      currentPos.set(id, {
        x: base.x + Math.sin(t * d.fx + d.px) * d.rx,
        y: base.y + Math.cos(t * d.fy + d.py) * d.ry,
      });
    });
    render();
    rafId = requestAnimationFrame(tick);
  }

  function teardownScene() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (entranceTimeoutId) { window.clearTimeout(entranceTimeoutId); entranceTimeoutId = null; }
    edgeLayer.innerHTML = '';
    markerLayer.innerHTML = '';
    nodeLayer.innerHTML = '';
    buttonEls = new Map();
    pathEls = new Map();
    markerEls = new Map();
    nodeRadiusById = new Map();
    basePos = new Map();
    currentPos = new Map();
    drift = new Map();
    neighbors = new Map();
    edgeSet = new Map();
    hoveredId = null;
    container.classList.remove('is-entered', 'is-settled');
  }

  // ---------- opening choreography constants (see Phase 3) - reused
  // for every scene build, not just the very first one. ----------
  const NODE_STAGGER_S = 0.032;
  const NODE_BASE_DELAY_S = 0.16;
  const NODE_ENTER_DURATION_S = 0.6;
  const SPOKE_BASE_DELAY_S = 0.12;
  const RELATION_BASE_DELAY_S = 0.32;
  const EDGE_DRAW_DURATION_S = 0.55;
  const EDGE_STATE_TRANSITION = 'opacity 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease';
  const EXIT_DURATION_MS = 220;

  function playEntrance(ringIds) {
    if (reduceMotion) {
      container.classList.add('is-entered', 'is-settled');
      return 0;
    }

    buttonEls.get(centerId)?.style.setProperty('--enter-delay', '0s');
    ringIds.forEach((id, i) => {
      buttonEls.get(id)?.style.setProperty('--enter-delay', (NODE_BASE_DELAY_S + i * NODE_STAGGER_S).toFixed(3) + 's');
    });

    pathEls.forEach(({ path, isSpoke }, key) => {
      const len = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
      if (!len) return;
      const [a, b] = edgeSet.get(key);
      const otherId = a === centerId ? b : a;
      const laterIndex = Math.max(ringIds.indexOf(otherId), 0);
      const delay = (isSpoke ? SPOKE_BASE_DELAY_S : RELATION_BASE_DELAY_S) + laterIndex * NODE_STAGGER_S;
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      path.style.transition = `${EDGE_STATE_TRANSITION}, stroke-dashoffset ${EDGE_DRAW_DURATION_S}s cubic-bezier(0.22, 1, 0.36, 1) ${delay.toFixed(3)}s`;
    });

    requestAnimationFrame(() => {
      container.classList.add('is-entered');
      pathEls.forEach(({ path }) => { path.style.strokeDashoffset = '0'; });
    });

    const nodeTail = NODE_BASE_DELAY_S + Math.max(ringIds.length - 1, 0) * NODE_STAGGER_S + NODE_ENTER_DURATION_S;
    const edgeTail = RELATION_BASE_DELAY_S + Math.max(ringIds.length - 1, 0) * NODE_STAGGER_S + EDGE_DRAW_DURATION_S;
    return Math.round(Math.max(nodeTail, edgeTail) * 1000) + 80;
  }

  // scene = { centerId, center, ring: [{ node, kind }], edges: [[aId,bId,{crossLink}]], focusAfterId }
  function buildScene(scene) {
    centerId = scene.centerId;
    const ringEntries = scene.ring;
    const ringIds = ringEntries.map((r) => r.node.id);
    const allEntries = [{ node: scene.center, kind: 'center' }, ...ringEntries];

    // ---- edges + adjacency (from the scene's own edge list only) ----
    edgeSet = new Map();
    scene.edges.forEach(([a, b, meta]) => edgeSet.set(edgeKey(a, b), [a, b, meta || {}]));
    const edgeList = Array.from(edgeSet.entries());
    neighbors = new Map(allEntries.map((e) => [e.node.id, new Set()]));
    edgeList.forEach(([, [a, b]]) => {
      neighbors.get(a)?.add(b);
      neighbors.get(b)?.add(a);
    });

    // ---- ring order: greedy nearest-neighbor over the ring's own
    // peer relationships (edges that don't touch the center), so
    // connected ring nodes cluster next to each other and cut down on
    // chords crossing the circle - same heuristic as before, just
    // scoped to whatever ring this scene has. ----
    function orderForMinimalCrossings(ids) {
      if (ids.length <= 1) return ids.slice();
      const idSet = new Set(ids);
      const peerAdj = new Map(ids.map((id) => [id, new Set([...neighbors.get(id)].filter((x) => idSet.has(x) && x !== centerId))]));
      const remaining = new Set(ids);
      let seed = ids[0];
      ids.forEach((id) => { if (peerAdj.get(id).size > peerAdj.get(seed).size) seed = id; });
      const order = [seed];
      remaining.delete(seed);
      const sharedCount = (id) => order.reduce((sum, placed) => sum + (peerAdj.get(id).has(placed) ? 1 : 0), 0);
      while (remaining.size) {
        const front = order[0];
        const back = order[order.length - 1];
        let bestId = null, bestEnd = 'back', bestScore = -1;
        remaining.forEach((id) => {
          const shared = sharedCount(id);
          if (peerAdj.get(back).has(id) && shared > bestScore) { bestScore = shared; bestId = id; bestEnd = 'back'; }
          if (peerAdj.get(front).has(id) && shared > bestScore) { bestScore = shared; bestId = id; bestEnd = 'front'; }
        });
        if (!bestId) {
          remaining.forEach((id) => {
            const shared = sharedCount(id);
            if (shared > bestScore) { bestScore = shared; bestId = id; bestEnd = 'back'; }
          });
        }
        if (!bestId) bestId = remaining.values().next().value;
        if (bestEnd === 'front') order.unshift(bestId); else order.push(bestId);
        remaining.delete(bestId);
      }
      return order;
    }

    const orderedRingIds = orderForMinimalCrossings(ringIds);
    const ringById = new Map(ringEntries.map((r) => [r.node.id, r]));
    const orderedRing = orderedRingIds.map((id) => ringById.get(id));

    // ---- positions ----
    basePos = new Map();
    const angleById = new Map();
    basePos.set(centerId, { x: CENTER, y: CENTER });
    orderedRing.forEach((entry, i) => {
      const angle = (i / orderedRing.length) * Math.PI * 2 - Math.PI / 2;
      angleById.set(entry.node.id, angle);
      basePos.set(entry.node.id, {
        x: CENTER + Math.cos(angle) * RING_RADIUS,
        y: CENTER + Math.sin(angle) * RING_RADIUS,
      });
    });

    drift = new Map();
    allEntries.forEach(({ node }) => {
      drift.set(node.id, node.id === centerId
        ? { rx: 0, ry: 0, fx: 0, fy: 0, px: 0, py: 0 }
        : { rx: 6 + rand() * 6, ry: 6 + rand() * 6, fx: 0.018 + rand() * 0.018, fy: 0.018 + rand() * 0.018, px: rand() * Math.PI * 2, py: rand() * Math.PI * 2 });
    });
    currentPos = new Map(allEntries.map(({ node }) => [node.id, { ...basePos.get(node.id) }]));

    // ---- sizing: dot diameter scales with how many ring-visible
    // relationships a node has, within *this* scene's ring only. ----
    const degrees = orderedRing.map((entry) => (entry.node.related || []).length);
    const minDegree = Math.min(...degrees, 0);
    const maxDegree = Math.max(...degrees, 1);
    function dotSize(node, isCenter) {
      if (isCenter) return Math.round(130 * sizeScale);
      const deg = (node.related || []).length;
      const t = maxDegree === minDegree ? 0.5 : (deg - minDegree) / (maxDegree - minDegree);
      return Math.round((46 + t * 17) * sizeScale);
    }

    const dirs = orderedRing.map((entry) => directionFromAngle(angleById.get(entry.node.id)));

    // ---- edge DOM ----
    edgeList.forEach(([key, [a, b, meta]]) => {
      const isSpoke = a === centerId || b === centerId;
      const path = document.createElementNS(svgNS, 'path');
      const cls = ['graph-edge', isSpoke ? 'graph-edge--spoke' : 'graph-edge--relation'];
      if (meta && meta.crossLink) cls.push('graph-edge--crosslink');
      path.setAttribute('class', cls.join(' '));
      path.setAttribute('fill', 'none');
      edgeLayer.appendChild(path);
      pathEls.set(key, { path, isSpoke });

      const m1 = document.createElementNS(svgNS, 'circle');
      const m2 = document.createElementNS(svgNS, 'circle');
      m1.setAttribute('class', 'graph-marker');
      m2.setAttribute('class', 'graph-marker');
      markerLayer.appendChild(m1);
      markerLayer.appendChild(m2);
      markerEls.set(key, [m1, m2]);
    });

    // ---- node DOM ----
    function makeButton(node, isCenter, orderIndex) {
      const size = dotSize(node, isCenter);
      nodeRadiusById.set(node.id, size / 2);
      const icon = NODE_ICONS[node.id] || FALLBACK_ICON;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'graph-node' + (isCenter ? ' graph-node--root' : '');
      btn.dataset.nodeId = node.id;
      btn.dataset.dir = isCenter ? 's' : dirs[orderedRing.findIndex((e) => e.node.id === node.id)];
      if (!isCenter) {
        const entry = ringById.get(node.id);
        if (entry && entry.kind === 'crosslink') btn.dataset.linkKind = 'crosslink';
      }
      btn.style.setProperty('--breathe-delay', (orderIndex * 0.37).toFixed(2) + 's');
      btn.setAttribute('aria-label', node.title);
      btn.style.width = size + 'px';
      btn.style.height = size + 'px';
      const base = basePos.get(node.id);
      btn.style.left = (base.x / SIZE * 100) + '%';
      btn.style.top = (base.y / SIZE * 100) + '%';

      if (isCenter) {
        btn.innerHTML = `
          <span class="graph-node-dot">
            <span class="graph-node-rings" aria-hidden="true"></span>
            <span class="graph-node-icon">${wrapIcon(icon)}</span>
            <span class="graph-node-hero-title">${node.title}</span>
            <span class="graph-node-hero-sub">${node.heroSubtitle || ''}</span>
          </span>`;
      } else {
        btn.innerHTML = `
          <span class="graph-node-dot">
            <span class="graph-node-icon">${wrapIcon(icon)}</span>
          </span>
          <span class="graph-node-label"><span class="graph-node-label-text">${node.title}</span></span>`;
      }
      nodeLayer.appendChild(btn);
      buttonEls.set(node.id, btn);
      return btn;
    }

    makeButton(scene.center, true, 0);
    orderedRing.forEach((entry, i) => makeButton(entry.node, false, i + 1));

    // ---- label direction refinement: measure real layout, nudge
    // single-word labels forced into a narrow slot to a neighboring
    // direction if that avoids a mid-word wrap. ----
    orderedRing.forEach((entry) => {
      if (/\s/.test(entry.node.title)) return;
      const btn = buttonEls.get(entry.node.id);
      const textEl = btn.querySelector('.graph-node-label-text');
      if (!textEl || !labelWraps(textEl)) return;
      const original = btn.dataset.dir;
      let resolved = original;
      for (const candidate of neighborDirs(original)) {
        btn.dataset.dir = candidate;
        if (!labelWraps(textEl)) { resolved = candidate; break; }
        btn.dataset.dir = original;
      }
      btn.dataset.dir = resolved;
    });

    // stagger flags recomputed from the *final* directions
    orderedRing.forEach((entry, i) => {
      const btn = buttonEls.get(entry.node.id);
      const prevEntry = orderedRing[(i - 1 + orderedRing.length) % orderedRing.length];
      const prevBtn = buttonEls.get(prevEntry.node.id);
      const sameBucket = orderedRing.length > 1 && btn.dataset.dir === prevBtn.dataset.dir;
      btn.style.setProperty('--label-stagger', sameBucket ? '1' : '0');
      if (sameBucket) {
        const ang = angleById.get(entry.node.id) || 0;
        btn.style.setProperty('--ew-stagger-sign', Math.sin(ang) >= 0 ? '1' : '-1');
      }
    });

    // ---- interaction ----
    buttonEls.forEach((btn, id) => {
      btn.addEventListener('click', () => { if (onSelect) onSelect(id); });
      btn.addEventListener('focus', () => { hoveredId = id; applyHighlight(); if (onHoverChange) onHoverChange(id); });
      btn.addEventListener('blur', () => { hoveredId = null; applyHighlight(); if (onHoverChange) onHoverChange(centerId); });
      btn.addEventListener('mouseenter', () => { hoveredId = id; applyHighlight(); if (onHoverChange) onHoverChange(id); });
      btn.addEventListener('mouseleave', () => { hoveredId = null; applyHighlight(); if (onHoverChange) onHoverChange(centerId); });
    });

    render();
    const entranceMs = playEntrance(orderedRingIds);
    applyHighlight();

    if (scene.focusAfterId) {
      buttonEls.get(scene.focusAfterId)?.focus({ preventScroll: true });
    }

    if (!reduceMotion) {
      entranceTimeoutId = window.setTimeout(() => {
        container.classList.add('is-settled');
        rafId = requestAnimationFrame(tick);
      }, entranceMs);
    }
  }

  function focus(scene) {
    const myToken = ++sceneToken;
    if (isFirstScene) {
      isFirstScene = false;
      buildScene(scene);
      return;
    }
    if (reduceMotion) {
      teardownScene();
      buildScene(scene);
      return;
    }
    container.classList.add('is-exiting');
    exitTimeoutId = window.setTimeout(() => {
      if (myToken !== sceneToken) return; // superseded by a newer focus() call
      container.classList.remove('is-exiting');
      teardownScene();
      buildScene(scene);
    }, EXIT_DURATION_MS);
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    if (entranceTimeoutId) window.clearTimeout(entranceTimeoutId);
    if (exitTimeoutId) window.clearTimeout(exitTimeoutId);
    container.innerHTML = '';
  }

  return {
    focus,
    focusNode(id) { buttonEls.get(id)?.focus(); },
    destroy,
  };
}
