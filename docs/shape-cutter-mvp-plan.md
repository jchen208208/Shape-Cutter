# Shape Cutter — 2D MVP Build Plan (1 Week)

*Goal: a playable, deployed web game — a random polygon appears, the player draws one straight cut, the engine computes the exact areas of both pieces, and scores how close the cut was to 50/50.*
*Stack: vanilla HTML/CSS/JS + canvas. No frameworks, no build tools. Deploy: GitHub Pages. Cost: $0.*
*Everything else — 1D/3D modes, real-object images, daily puzzles, the platform — is README roadmap, not MVP.*

---

## Day 1 — Setup + Canvas Fundamentals

**Do:**
- Folder with `index.html`, `style.css`, `game.js`; git repo `shape-cutter`, pushed to GitHub with a stub README that credits the 2D inspiration and lists the roadmap (1D & 3D modes, real objects, daily puzzle).
- Canvas warm-ups, each written by you from scratch:
  1. Draw a filled triangle from an array of `{x, y}` points.
  2. Log mouse coordinates on click (learn `getBoundingClientRect` — canvas coordinates vs. page coordinates is everyone's first bug).
  3. Draw a line that follows the mouse from a clicked anchor point (learn the clear-and-redraw-every-frame pattern).

**Concepts:** the canvas API (`beginPath`, `moveTo`, `lineTo`, `fill`, `stroke`), coordinate systems, mouse events, the redraw loop.
**Done when:** all three warm-ups work and you can explain why we clear and redraw instead of "erasing" a line.

---

## Day 2 — Random Polygon Generation

**Do:**
1. Represent a polygon as an ordered array of `{x, y}` vertices. Decide winding order (counter-clockwise) now — the engine will care.
2. Generate random **convex** polygons first: pick a center, walk angles 0→2π in random-ish steps, place a vertex at a random radius per angle, connect. (Convex keeps Day 3–4 sane; concave shapes are a stretch goal.)
3. Render the polygon filled + outlined, centered, scaled to fit the canvas.
4. A "new shape" button.

**Concepts:** polar → cartesian coordinates, winding order, why convexity will matter for the splitting math.
**Done when:** every click of the button gives a pleasing random shape that never leaves the canvas.

---

## Days 3–4 — THE ENGINE (the whole point of the project)

The player's cut is an infinite line defined by two clicked points. Splitting the polygon:

1. **Half-plane test:** for line through points A, B, the sign of the cross product `(B−A) × (P−A)` tells you which side point P is on. Implement this first; test it by coloring vertices by side.
2. **Split by clipping:** clip the polygon against each half-plane (this is one iteration of Sutherland–Hodgman): walk the edges; keep vertices on the inside; whenever an edge crosses the line, compute the **line–segment intersection point** and insert it. Run once per side → two polygons.
3. **Area:** implement the **shoelace formula**. Test it on shapes you can verify by hand (a unit square, a known triangle) *before* trusting it on random polygons.
4. **Score:** smaller piece ÷ total area → percentage; score = closeness to 50%.

**Edge cases to handle (these are the war stories):** the line missing the polygon entirely; the line passing exactly through a vertex; near-parallel intersection precision; degenerate slivers.

**Concepts:** cross products as side-tests, line–segment intersection math, polygon clipping, shoelace formula, floating-point tolerance (`epsilon` comparisons).
**Done when:** you can split any generated polygon, both piece-areas sum to the original (write that as an automated test — it catches almost every bug), and you can derive the shoelace formula on paper in the quiz.

---

## Day 5 — Make It a Game

1. Game loop: shape appears → player clicks two points to cut → animate the two pieces sliding apart → show "51.3% / 48.7% — score 98.7".
2. Rounds (best of 5), running total, a subtle juice pass: colors, a satisfying cut animation, mobile-friendly touch events.
3. Fail states handled gracefully (cut misses the shape → prompt to retry).

**Concepts:** game state machines (aiming → cut → reveal → next), simple animation with `requestAnimationFrame`.
**Done when:** a friend can play it without you explaining anything.

---

## Day 6 — Ship It

1. Deploy to GitHub Pages (it's static files — this takes minutes).
2. README: GIF of gameplay, how the engine works in 3 sentences, inspiration credit, roadmap section (1D/3D, real objects via silhouette extraction, daily mode).
3. Send the link to five people. Watch one of them play without helping. Fix the top confusion.

**Done when:** a public URL exists and a stranger has successfully played.

---

## Day 7 — Buffer / First Stretch

Use for slippage first. If on schedule, pick ONE:
- Concave polygon generation (your clipping already handles concave shapes if written generally — test it!)
- 1D mode (trivial engine, nice for completing the "dimensions" theme)
- Share-card image generation (canvas → PNG of your result)

**Resume bullet you're building toward:**
> *Built and deployed a browser game with a custom computational-geometry engine (polygon clipping, exact area bisection scoring); [N] players in the first month.*

---

## After the MVP (do not touch during the week)

Real-object mode (image → silhouette → polygon via marching squares) → daily puzzle mode → 3D cake mode (three.js, mesh slicing, signed-tetrahedron volumes) → the multi-game platform. Then: the Minesweeper sprint.
