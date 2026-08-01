# Bit Gamer - knowledge graph prototype (Phase 1)

Standalone proof-of-concept for the interactive Bit Gamer experience described
in this folder's spec docs (`Bit_Gamer_Interactive_Project_Specification_v1.txt`
and `01`-`05`). **Not yet integrated into ghallonline.com** - that's Phase 2,
once this concept is approved.

## Running it

This uses `fetch()` to load `content/nodes.json`, so it must be served over
http, not opened directly as a `file://` URL (browsers block `fetch` of local
files under `file://` for security reasons). From the `www/` folder:

```
python -m http.server 5500
```

then open `http://localhost:5500/bit/index.html`.

(The project already has a `static-site` launch config in `.claude/launch.json`
that does this for the whole `www/` folder - `bit/` is served as a subpath of
that automatically.)

## What this is

- `index.html` - standalone shell page. Wrapped in a mock version of the
  site's existing window chrome (titlebar, glass panel) purely so it previews
  in context; the window controls are disabled placeholders, not functional -
  real minimize/maximize/close will come from the actual Workshop window once
  this is integrated.
- `style.css` - all styling. Design tokens (colors, fonts) are copied from
  `/concept.html`'s `:root` block so this doesn't visually clash once dropped
  into the real site.
- `graph.js` - the graph itself. Deliberately knows nothing about Bit Gamer,
  content, or panels - it takes `{ nodes, edges, onSelect }` and renders a
  radial layout (root centered, primary nodes in a ring) with real, focusable
  `<button>` elements for nodes (not canvas-only) so keyboard nav and screen
  readers work without extra plumbing. SVG draws the connecting lines. A slow
  per-node drift (same seeded-sine technique as the Living Tesseract) keeps
  it from ever sitting perfectly still.
- `app.js` - orchestration. Loads `content/nodes.json`, wires graph selection
  to the info panel, and owns all panel rendering/content logic. This is
  where Bit-Gamer-specific knowledge lives, not in `graph.js`.
- `content/nodes.json` - the 14 primary nodes plus the Bit Gamer root node.
  Each node has `summary` / `details` / `deepDive` / `related` (an array of
  node ids). Edges are derived from `related` at load time, not hand-written
  separately, so there's one source of truth for the graph's shape.

## Content status - what's real vs. placeholder

Per the spec: "Future phases will populate the full Bit Gamer knowledge graph
using the archived project documentation and diagrams." I did have some of
that archived material available already this session (the BitGamer Business
Plan and Business Use Case docs, the ecosystem diagram, and the org chart
confirming Gary Hall as COO / Doug Zhang as President), and used it to write
real, grounded content wherever it exists - **this is not lorem-ipsum
placeholder text**. But several nodes are thinner than others because the
source material doesn't cover them in depth yet. Each of those nodes says so
explicitly in its own `deepDive` field: **Organizations, Developers,
Marketplace, Academy, Streaming, Analytics, Rewards, and Identity's
verification details** are flagged as placeholder / Phase 2 material inside
the JSON itself, so it's visible in the running prototype, not just in this
README.

Two files exist in the archive that weren't mined for this pass and are
likely good sources for Phase 2: `Master Flowchart.xml` and `Bitgamer
flowchart` (both draw.io exports, referenced earlier in this project for the
BitGamer logo) - the ecosystem diagram embedded in one of them (Sponsors ->
Tournaments -> Player Base/Fanbase -> BitGamer <-> BitBot <-> Players/
Tournament Organizer/ESL, Investors -> Fund -> BitGamer) already lines up
with the node relationships used here, but hasn't been fully transcribed into
node content yet.

## Interaction model implemented

- Bit Gamer sits at the center, always selectable, always the way back to
  a neutral state (there's no separate "reset" button - clicking the root
  node again does that).
- All 14 primary nodes are visible from the start, arranged radially - see
  the open question below about whether that's the model you want.
- Hover or focus a node: it and its direct neighbors highlight, everything
  else dims. This is transient and doesn't change what's selected.
- Click (or Enter/Space on a focused node): opens its panel. Summary shows
  immediately; Details and Deep Dive are behind `<details>` disclosures
  (progressive disclosure inside the panel, not just across the graph).
  Related systems appear as chips - clicking one re-selects that node in the
  graph and re-renders the panel, so you can chain through the ecosystem
  without ever navigating away.
- Escape, or the panel's own close button, closes the panel and clears the
  graph highlight.
- `prefers-reduced-motion` disables the ambient drift entirely - the layout
  still renders, just static.

## Open question carried over from the understanding discussion

I built this with all 14 nodes visible from the start rather than nodes
progressively appearing as you explore, because the spec's own "Core
Experience" section describes surrounding nodes as already present
("surrounding nodes represent major systems") rather than spawning in. If you
pictured the *node count* itself growing as you click deeper - not just the
information inside each node - that's a different (bigger) build, and worth
saying now before Phase 2.

## Known limitations (Phase 1, by design)

- Not integrated into ghallonline.com yet - no Workshop window, no shared
  navigation, no shared hash-routing. This is intentional per the phasing.
- Several nodes have placeholder-flagged `deepDive` content, as noted above.
- No mobile-specific layout pass beyond a basic breakpoint that stacks the
  graph and panel vertically - worth a real look once the concept itself is
  approved.
