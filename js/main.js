// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- Custom cursor ---------- */
const cursorDot = document.getElementById('cursorDot');
const isFinePointer = window.matchMedia('(pointer: fine)').matches;

if (isFinePointer && cursorDot) {
  window.addEventListener('mousemove', (e) => {
    cursorDot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  });

  const hoverTargets = 'a, button, .node, .back, .enter-button';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(hoverTargets)) cursorDot.classList.add('is-hover');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(hoverTargets)) cursorDot.classList.remove('is-hover');
  });
}

/* ---------- Ambient orb mouse parallax ---------- */
const glowField = document.getElementById('glowField');
if (glowField && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;

  window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX / window.innerWidth - 0.5) * 30;
    targetY = (e.clientY / window.innerHeight - 0.5) * 30;
  });

  function parallaxLoop() {
    currentX += (targetX - currentX) * 0.03;
    currentY += (targetY - currentY) * 0.03;
    glowField.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    requestAnimationFrame(parallaxLoop);
  }
  requestAnimationFrame(parallaxLoop);
}

/* ---------- Text scramble effect ---------- */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz{}-_|/*';

function scramble(el, finalText, duration = 700) {
  const steps = Math.max(finalText.length, 10);
  const stepTime = duration / steps;
  let frame = 0;

  const interval = setInterval(() => {
    let out = '';
    for (let i = 0; i < finalText.length; i++) {
      const char = finalText[i];
      if (char === ' ' || char === '\n') { out += char; continue; }
      if (i < frame) {
        out += char;
      } else {
        out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
    }
    el.textContent = out;
    frame += 1;
    if (frame > finalText.length) {
      clearInterval(interval);
      el.textContent = finalText;
    }
  }, stepTime);
}

function scrambleIn(el) {
  const finalText = el.getAttribute('data-scramble');
  if (finalText) scramble(el, finalText);
}

/* ---------- Scene navigation (constellation <-> chapters) ---------- */
const stage = document.getElementById('stage');
const constellation = document.getElementById('constellation');
const chapters = document.querySelectorAll('.chapter');
const TRANSITION_MS = 400;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function activateScene(nextScene) {
  const current = stage.querySelector('.scene.is-active');
  if (!current || current === nextScene) return;

  if (reduceMotion) {
    current.classList.remove('is-active');
    nextScene.classList.add('is-active');
    window.scrollTo(0, 0);
    nextScene.querySelectorAll('[data-scramble]').forEach((el) => scrambleIn(el));
    return;
  }

  current.classList.add('is-leaving');
  setTimeout(() => {
    current.classList.remove('is-active', 'is-leaving');
    nextScene.classList.add('is-active', 'is-entering');
    window.scrollTo(0, 0);
    nextScene.querySelectorAll('[data-scramble]').forEach((el) => scrambleIn(el));
    setTimeout(() => nextScene.classList.remove('is-entering'), 500);
  }, TRANSITION_MS);
}

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => activateScene(constellation));
});

// Escape returns to the constellation from a chapter. Scoped to only act when a
// chapter is actually active, so it never fires during the opening (where Enter
// is the only bound key) or while already on the constellation, and it never
// calls preventDefault(), so it can't conflict with any native browser shortcut.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const current = stage.querySelector('.scene.is-active');
  if (current && current.classList.contains('chapter')) {
    activateScene(constellation);
  }
});

/* ---------- Orb constellation: curated layout + connecting lines ---------- */
// A small hand-authored set of layouts, not scaled from one another — desktop and
// mobile get separate curated sets. One is picked at random per page load and then
// held fixed for the session (never re-picked on resize).
const DESKTOP_LAYOUTS = ['layout-a', 'layout-b', 'layout-c'];
const MOBILE_LAYOUTS = ['layout-m1', 'layout-m2'];
const nodesEl = document.querySelector('.nodes');

if (nodesEl) {
  const isMobileViewport = window.matchMedia('(max-width: 640px)').matches;
  const layoutPool = isMobileViewport ? MOBILE_LAYOUTS : DESKTOP_LAYOUTS;
  const chosenLayout = layoutPool[Math.floor(Math.random() * layoutPool.length)];
  nodesEl.classList.add(chosenLayout);
}

function drawConstellationLines() {
  const svg = document.getElementById('constellationLines');
  if (!svg || !nodesEl) return;
  const containerRect = nodesEl.getBoundingClientRect();
  if (containerRect.width === 0 || containerRect.height === 0) return; // scene not visible yet
  const points = Array.from(nodesEl.querySelectorAll('.node')).map((n) => {
    const r = n.getBoundingClientRect();
    return {
      x: ((r.left + r.width / 2 - containerRect.left) / containerRect.width) * 100,
      y: ((r.top + r.height / 2 - containerRect.top) / containerRect.height) * 100,
    };
  });
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = '';
  for (let i = 0; i < points.length - 1; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', points[i].x.toFixed(2));
    line.setAttribute('y1', points[i].y.toFixed(2));
    line.setAttribute('x2', points[i + 1].x.toFixed(2));
    line.setAttribute('y2', points[i + 1].y.toFixed(2));
    line.setAttribute('class', 'constellation-link');
    svg.appendChild(line);
  }
}

/* ---------- Orb discovery ---------- */
// Stable section IDs (matching data-chapter) are the localStorage keys, stored as
// a single JSON array. All storage access is wrapped in try/catch: if localStorage
// is unavailable, discovery still works in-memory for the current page load, and
// navigation (click -> discover -> click again -> enter) is unaffected.
const DISCOVERED_KEY = 'garyhall_discoveredSections';
const DISCOVER_DELAY_MS = 700;
const UNDISCOVERED_LABEL = 'Unknown signal. Select to discover this section';

// The only slugs this build actually has sections for. Anything else found in
// storage (a stale slug from a renamed/removed section, corrupted data, etc.)
// is dropped rather than trusted.
const VALID_SECTION_SLUGS = Array.from(document.querySelectorAll('.node')).map((n) => n.dataset.chapter);

function loadDiscovered() {
  try {
    const raw = localStorage.getItem(DISCOVERED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    const valid = parsed.filter((slug) => typeof slug === 'string' && VALID_SECTION_SLUGS.includes(slug));
    return new Set(valid);
  } catch (err) {
    return new Set();
  }
}

function persistDiscovered() {
  try {
    localStorage.setItem(DISCOVERED_KEY, JSON.stringify(Array.from(discoveredSlugs)));
  } catch (err) {
    // localStorage unavailable (private browsing, quota, etc.) — non-fatal
  }
}

const discoveredSlugs = loadDiscovered();
const discoverTimers = new Map(); // node -> pending timeout id
const srAnnouncer = document.getElementById('srAnnouncer');

function announce(text) {
  if (srAnnouncer) srAnnouncer.textContent = text;
}

function discover(slug) {
  if (discoveredSlugs.has(slug)) return;
  discoveredSlugs.add(slug);
  persistDiscovered();

  const node = document.querySelector(`.node[data-chapter="${slug}"]`);
  if (!node) return;

  const pending = discoverTimers.get(node);
  if (pending) {
    clearTimeout(pending);
    discoverTimers.delete(node);
  }

  node.classList.add('is-discovered');
  const label = node.querySelector('.node-label');
  label.classList.remove('is-discovering');
  const realName = node.dataset.name;

  // The visible text is decorative (aria-hidden); the button's own accessible
  // name is what assistive tech actually hears, and it becomes the real name
  // permanently from here on. The live-region announcement is a one-time
  // "this just happened" event, phrased differently from the resting label
  // so the two don't repeat the same words back to back.
  node.setAttribute('aria-label', realName);
  announce(`${realName} discovered.`);

  if (reduceMotion) {
    label.textContent = realName;
  } else {
    scramble(label, realName);
  }
}

function startDiscoverTimer(node, slug) {
  if (discoveredSlugs.has(slug) || discoverTimers.has(node)) return;
  // Visible-only: "Discovering…" is not announced (no aria-label or live-region
  // change here), so a quick hover/focus pass-by stays silent for screen readers.
  const label = node.querySelector('.node-label');
  label.classList.add('is-discovering');
  label.textContent = 'Discovering…';
  const timeoutId = setTimeout(() => discover(slug), DISCOVER_DELAY_MS);
  discoverTimers.set(node, timeoutId);
}

function cancelDiscoverTimer(node, slug) {
  if (discoveredSlugs.has(slug)) return;
  const timeoutId = discoverTimers.get(node);
  if (!timeoutId) return;
  clearTimeout(timeoutId);
  discoverTimers.delete(node);
  const label = node.querySelector('.node-label');
  label.classList.remove('is-discovering');
  label.textContent = 'unknown signal';
}

document.querySelectorAll('.node').forEach((node) => {
  const slug = node.dataset.chapter;

  // Previously discovered sections show their real name immediately, no delay,
  // and their accessible name matches from the very first paint. JS is the
  // source of truth for the undiscovered label too, so it stays correct even
  // if the HTML's own aria-label attribute is ever missing or out of sync.
  if (discoveredSlugs.has(slug)) {
    node.classList.add('is-discovered');
    node.querySelector('.node-label').textContent = node.dataset.name;
    node.setAttribute('aria-label', node.dataset.name);
  } else {
    node.setAttribute('aria-label', UNDISCOVERED_LABEL);
  }

  node.addEventListener('mouseenter', () => startDiscoverTimer(node, slug));
  node.addEventListener('mouseleave', () => cancelDiscoverTimer(node, slug));
  // Discovery-on-focus only changes label text/aria-label — it never calls
  // .focus() on anything, so it can't unexpectedly move keyboard focus.
  node.addEventListener('focus', () => startDiscoverTimer(node, slug));
  node.addEventListener('blur', () => cancelDiscoverTimer(node, slug));

  // Click (mouse, touch, or keyboard activation of a real <button> via Enter/Space):
  // first activation on an undiscovered orb reveals it and stops there;
  // a discovered orb enters its section. This naturally gives touch users
  // "first tap discovers, second tap enters" without any pointer-type sniffing,
  // and doubles as the guarantee that opening a section marks it discovered.
  node.addEventListener('click', () => {
    if (!discoveredSlugs.has(slug)) {
      discover(slug);
      return;
    }
    const chapter = document.getElementById(`chapter-${slug}`);
    if (chapter) activateScene(chapter);
  });
});

/* ---------- Console boot sequence (opening) ---------- */
// A plain sequential reveal, not the scramble/decode effect used elsewhere —
// real terminal boot text doesn't show garbled characters, it just appears.
// Purely cosmetic: the button and the global Enter listener both work from the
// first frame, so nobody has to wait for the animation to finish to proceed.
function typewriter(el, text, onDone) {
  if (reduceMotion) {
    el.textContent = text;
    if (onDone) onDone();
    return;
  }
  let i = 0;
  el.textContent = '';
  const interval = setInterval(() => {
    i += 1;
    el.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(interval);
      if (onDone) onDone();
    }
  }, 32);
}

function runConsoleBoot() {
  const line1 = document.getElementById('consoleText1');
  const line2 = document.getElementById('consoleText2');
  const cursorLine = document.getElementById('consoleCursorLine');
  if (!line1 || !line2) return;

  typewriter(line1, 'Connection established.', () => {
    setTimeout(() => {
      typewriter(line2, 'Press enter to continue', () => {
        if (cursorLine) cursorLine.classList.add('is-visible');
      });
    }, reduceMotion ? 0 : 250);
  });
}

/* ---------- Opening experience ---------- */
// SKIP_OPENING_IF_RETURNING_VISITOR controls whether a returning visitor (per the
// stored flag below) skips straight to the constellation. It's currently off, so
// the opening appears on every fresh page load — the stored value is still written
// on every entry so this is ready to flip on later.
const SKIP_OPENING_IF_RETURNING_VISITOR = false;
const HAS_ENTERED_KEY = 'garyhall_hasEntered';

const opening = document.getElementById('opening');
const enterButton = document.getElementById('enterButton');
const identityTagline = document.getElementById('identityTagline');

function hasEnteredBefore() {
  try {
    return localStorage.getItem(HAS_ENTERED_KEY) === 'true';
  } catch (err) {
    return false;
  }
}

function rememberEntered() {
  try {
    localStorage.setItem(HAS_ENTERED_KEY, 'true');
  } catch (err) {
    // localStorage unavailable — non-fatal, just won't be remembered next time
  }
}

let openingDismissed = false;

function enterSite() {
  if (openingDismissed) return;
  openingDismissed = true;
  rememberEntered();
  document.removeEventListener('keydown', handleOpeningKeydown);
  activateScene(constellation);

  const afterTransitionMs = reduceMotion ? 0 : TRANSITION_MS + 550;
  setTimeout(() => {
    drawConstellationLines();
    if (identityTagline) identityTagline.focus();
  }, afterTransitionMs);
}

function handleOpeningKeydown(e) {
  if (!opening.classList.contains('is-active')) return;
  if (e.key === 'Enter') enterSite();
}

if (SKIP_OPENING_IF_RETURNING_VISITOR && hasEnteredBefore()) {
  opening.classList.remove('is-active');
  constellation.classList.add('is-active');
  document.querySelectorAll('#constellation [data-scramble]').forEach((el) => scrambleIn(el));
  drawConstellationLines();
} else if (enterButton) {
  document.addEventListener('keydown', handleOpeningKeydown);
  enterButton.addEventListener('click', enterSite);
  runConsoleBoot();
}
