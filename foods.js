// Food mode: pixel-art food sprites for the shared game shell in game.js.
// Each food is painted onto a 24×24 grid with tiny shape primitives (one
// shared palette, every sprite sized to fill the grid), then its silhouette
// is traced into a polygon so the engine can cut it with exact area math.
// The sprite is rendered clipped to each piece polygon.

const FOOD_N = 24; // grid is FOOD_N × FOOD_N cells
const FOOD_SCALE = 14; // canvas pixels per cell

const C = {
  red: '#e05a47',
  lightRed: '#f0907e',
  pink: '#ee87b2',
  gold: '#e8a33d',
  lightGold: '#f4c96b',
  darkGold: '#c4832a',
  tan: '#d9a066',
  lightTan: '#eec39a',
  brown: '#8f5b3a',
  darkBrown: '#5f3d26',
  syrup: '#a5622d',
  butter: '#f7e08a',
  yellow: '#f4d03f',
  yolk: '#f2b939',
  cream: '#fdf3e0',
  white: '#f7f3e8',
  cookie: '#c98d4f',
  cheese: '#f2b53c',
  cheeseShade: '#cf8f26',
  crust: '#d98e4a',
  pepperoni: '#b8432f',
  bun: '#e2a45c',
  lettuce: '#8fbf58',
  patty: '#7a4a2e',
  rind: '#5d9e4c',
  green: '#6da24f',
  lightGreen: '#a4c96a',
  wrapper: '#c96f9a',
  avoSkin: '#4a6b34',
  avoFlesh: '#c6d98a',
  pit: '#9c6b43',
  stem: '#7a5233',
  black: '#3f3a36',
};

// Painting helpers over a grid. Tests are against cell centers (x+0.5,
// y+0.5); painting with color null erases (that's how the donut hole and the
// croissant's crescent bite are made).
function painter(g) {
  const put = (x, y, c) => {
    if (x >= 0 && x < FOOD_N && y >= 0 && y < FOOD_N) g[y][x] = c;
  };
  const each = (test, c) => {
    for (let y = 0; y < FOOD_N; y++) {
      for (let x = 0; x < FOOD_N; x++) {
        if (test(x + 0.5, y + 0.5)) g[y][x] = c;
      }
    }
  };
  return {
    px: (x, y, c) => put(x, y, c),
    rect: (x0, y0, w, h, c) => {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) put(x, y, c);
      }
    },
    disc: (cx, cy, r, c) => each((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, c),
    halfDisc: (cx, cy, r, side, c) =>
      each(
        (x, y) =>
          (x - cx) ** 2 + (y - cy) ** 2 <= r * r && (side === 'down' ? y >= cy : y <= cy),
        c
      ),
    ellipse: (cx, cy, rx, ry, c) =>
      each((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c),
    tri: (x1, y1, x2, y2, x3, y3, c) =>
      each((x, y) => {
        const s1 = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
        const s2 = (x3 - x2) * (y - y2) - (y3 - y2) * (x - x2);
        const s3 = (x1 - x3) * (y - y3) - (y1 - y3) * (x - x3);
        return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
      }, c),
  };
}

const FOODS = [
  {
    name: 'apple',
    paint(h) {
      h.disc(8.5, 10, 5, C.red);
      h.disc(15.5, 10, 5, C.red);
      h.disc(12, 14, 8.5, C.red);
      h.rect(11, 3, 2, 5, C.stem);
      h.ellipse(16, 5, 3.5, 2, C.green);
      h.ellipse(9, 11, 1.7, 2.7, C.lightRed);
    },
  },
  {
    name: 'croissant',
    paint(h) {
      h.disc(12, 13, 9.5, C.gold);
      h.disc(12, 5, 7.5, null); // crescent bite
      h.disc(4.5, 9, 2.5, C.gold); // tips
      h.disc(19.5, 9, 2.5, C.gold);
      h.ellipse(12, 17, 6.5, 4, C.lightGold);
      h.rect(8, 12, 1, 7, C.darkGold); // segment creases
      h.rect(15, 12, 1, 7, C.darkGold);
    },
  },
  {
    name: 'pancakes',
    paint(h) {
      h.ellipse(12, 18, 9.5, 3, C.tan);
      h.ellipse(12, 14.5, 9.5, 3, C.lightTan);
      h.ellipse(12, 11, 9.5, 3, C.tan);
      h.ellipse(12, 9.5, 7, 2.2, C.syrup);
      h.rect(10, 7, 4, 2, C.butter);
    },
  },
  {
    name: 'pizza',
    paint(h) {
      h.tri(3, 7, 21, 7, 12, 22, C.cheese);
      h.ellipse(12, 6, 9.5, 2.6, C.crust);
      h.disc(9, 10, 1.7, C.pepperoni);
      h.disc(15, 11, 1.7, C.pepperoni);
      h.disc(12, 15, 1.6, C.pepperoni);
    },
  },
  {
    name: 'burger',
    paint(h) {
      h.halfDisc(12, 10.5, 8.7, 'up', C.bun);
      h.rect(3, 11, 18, 2, C.lettuce);
      h.rect(4, 13, 16, 3, C.patty);
      h.ellipse(12, 18, 8.5, 2.8, C.bun);
      h.px(9, 6, C.cream); // sesame
      h.px(13, 5, C.cream);
      h.px(15, 8, C.cream);
      h.px(11, 8, C.cream);
    },
  },
  {
    name: 'donut',
    paint(h) {
      h.disc(12, 12, 9.7, C.tan);
      h.disc(12, 12, 8.2, C.pink);
      h.disc(12, 12, 4.6, C.tan);
      h.disc(12, 12, 3.2, null); // the hole
      h.px(8, 7, C.yellow); // sprinkles
      h.px(14, 6, C.cream);
      h.px(17, 10, C.lightGreen);
      h.px(6, 12, C.cream);
      h.px(9, 16, C.yellow);
      h.px(15, 16, C.lightGreen);
      h.px(17, 13, C.red);
    },
  },
  {
    name: 'cookie',
    paint(h) {
      h.disc(12, 12, 9.7, C.cookie);
      h.disc(8, 8, 1.4, C.darkBrown);
      h.disc(14, 7, 1.3, C.darkBrown);
      h.disc(17, 12, 1.4, C.darkBrown);
      h.disc(7, 14, 1.3, C.darkBrown);
      h.disc(11, 17, 1.4, C.darkBrown);
      h.disc(15, 15, 1.3, C.darkBrown);
    },
  },
  {
    name: 'watermelon',
    paint(h) {
      h.halfDisc(12, 11, 10, 'down', C.rind);
      h.halfDisc(12, 11, 8.8, 'down', C.white);
      h.halfDisc(12, 11, 7.8, 'down', C.red);
      h.px(9, 13, C.black); // seeds
      h.px(14, 13, C.black);
      h.px(12, 16, C.black);
      h.px(8, 15, C.black);
      h.px(16, 14, C.black);
    },
  },
  {
    name: 'egg',
    paint(h) {
      h.disc(10, 10, 6.8, C.white);
      h.disc(15, 13, 6.3, C.white);
      h.disc(9, 15, 5.6, C.white);
      h.disc(14, 8, 5, C.white);
      h.disc(12, 12, 3.9, C.yolk);
      h.px(11, 10, C.butter); // glint
    },
  },
  {
    name: 'cheese',
    paint(h) {
      h.tri(2, 13, 21, 5, 21, 21, C.cheese);
      h.disc(15, 12, 1.8, C.cheeseShade); // holes
      h.disc(18, 8, 1.4, C.cheeseShade);
      h.disc(18, 17, 1.5, C.cheeseShade);
      h.disc(10, 13, 1.2, C.cheeseShade);
    },
  },
  {
    name: 'cupcake',
    paint(h) {
      h.tri(6, 13, 18, 13, 15, 21, C.wrapper);
      h.tri(6, 13, 15, 21, 9, 21, C.wrapper);
      h.disc(12, 9, 5.8, C.pink); // frosting
      h.disc(8.5, 11.5, 3.6, C.pink);
      h.disc(15.5, 11.5, 3.6, C.pink);
      h.disc(12, 3.5, 2, C.red); // cherry
    },
  },
  {
    name: 'icecream',
    paint(h) {
      h.tri(6, 11, 18, 11, 12, 23, C.tan);
      h.px(10, 13, C.brown); // waffle dots
      h.px(14, 13, C.brown);
      h.px(12, 15, C.brown);
      h.px(11, 17, C.brown);
      h.px(13, 17, C.brown);
      h.px(12, 19, C.brown);
      h.disc(12, 7, 6, C.cream);
      h.px(10, 4, C.pink); // sprinkles
      h.px(13, 3, C.lightGreen);
      h.px(15, 6, C.red);
      h.px(9, 7, C.yellow);
      h.px(12, 9, C.pink);
    },
  },
  {
    name: 'taco',
    paint(h) {
      h.ellipse(12, 10.5, 8, 2.6, C.lettuce);
      h.px(8, 10, C.red); // tomato
      h.px(12, 9, C.red);
      h.px(15, 10, C.red);
      h.px(10, 9, C.patty); // meat
      h.px(14, 11, C.patty);
      h.halfDisc(12, 12, 9.7, 'down', C.gold); // shell
      h.halfDisc(12, 12, 8, 'down', C.lightGold);
    },
  },
  {
    name: 'strawberry',
    paint(h) {
      h.disc(12, 10, 7.8, C.red);
      h.tri(5, 12, 19, 12, 12, 22, C.red); // pointed bottom
      h.tri(7, 2, 17, 2, 12, 8, C.green); // leaves
      h.px(9, 9, C.butter); // seeds
      h.px(14, 9, C.butter);
      h.px(12, 13, C.butter);
      h.px(8, 13, C.butter);
      h.px(16, 12, C.butter);
      h.px(11, 16, C.butter);
      h.px(13, 18, C.butter);
    },
  },
  {
    name: 'avocado',
    paint(h) {
      h.disc(12, 7.5, 5.2, C.avoSkin);
      h.disc(12, 14.5, 7.8, C.avoSkin);
      h.disc(12, 8, 3.9, C.avoFlesh);
      h.disc(12, 14.5, 6.4, C.avoFlesh);
      h.disc(12, 15, 3.6, C.pit);
      h.px(11, 13, C.lightTan); // pit glint
    },
  },
];

// --- roughening: organic edges + texture, fresh randomness per serving ---

function shade(hex, f) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((v >> 8) & 255) * f));
  const b = Math.min(255, Math.round((v & 255) * f));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// the 8 neighbors in cyclic order — consecutive ring cells are 4-adjacent
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

// Copy the base sprite, nick and bump its silhouette at random, then shade.
// A nick is only allowed where the filled cells around it form a single
// unbroken run of the ring, which guarantees removal can never split the
// blob — so the connectivity invariant survives any random seed.
function roughenSprite(base) {
  const cells = base.cells.map((row) => row.slice());
  const filled = (x, y) => x >= 0 && x < FOOD_N && y >= 0 && y < FOOD_N && cells[y][x] !== null;

  // nicks: eat the occasional boundary cell
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (!filled(x, y)) continue;
      if (N4.every(([dx, dy]) => filled(x + dx, y + dy))) continue; // interior
      if (Math.random() > 0.14) continue;
      const ring = RING.map(([dx, dy]) => filled(x + dx, y + dy));
      let runs = 0;
      for (let i = 0; i < 8; i++) {
        if (ring[i] && !ring[(i + 1) % 8]) runs++;
      }
      if (runs === 1) cells[y][x] = null;
    }
  }

  // bumps: sprout new cells against the silhouette (additive, always safe)
  const bumps = [];
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (filled(x, y)) continue;
      const nb = N4.filter(([dx, dy]) => filled(x + dx, y + dy));
      if (nb.length === 0) continue;
      if (Math.random() < (nb.length >= 2 ? 0.25 : 0.1)) {
        const [dx, dy] = nb[Math.floor(Math.random() * nb.length)];
        bumps.push([x, y, cells[y + dy][x + dx]]);
      }
    }
  }
  for (const [x, y, c] of bumps) cells[y][x] = c;

  // shading: darker lower rim, lighter upper rim, speckled interior
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y + 1)) cells[y][x] = shade(cells[y][x], 0.78);
      else if (!filled(x, y - 1)) cells[y][x] = shade(cells[y][x], 1.18);
      else if (Math.random() < 0.07) {
        cells[y][x] = shade(cells[y][x], Math.random() < 0.5 ? 0.9 : 1.08);
      }
    }
  }

  return { name: base.name, cells, polygon: traceOutline(cells) };
}

// --- silhouette tracing ---

function loopArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

function simplifyLoop(loop) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const cur = loop[i];
    const next = loop[(i + 1) % loop.length];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (cross !== 0) out.push(cur);
  }
  return out;
}

// Trace the outline of the filled cells as a polygon in grid coordinates.
// Every boundary between a filled and an empty cell becomes a directed unit
// edge; chaining edges start→end forms closed loops. The largest loop is the
// outer silhouette. Inner loops (the donut hole) are ignored — the hole
// still counts as donut for area purposes, which is fine for a ratio score.
function traceOutline(cells) {
  const filled = (x, y) => x >= 0 && x < FOOD_N && y >= 0 && y < FOOD_N && cells[y][x] !== null;
  const edges = new Map();
  const add = (x1, y1, x2, y2) => {
    const k = `${x1},${y1}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push({ x: x2, y: y2 });
  };
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add(x, y, x + 1, y);
      if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const loops = [];
  while (edges.size) {
    // start at a non-junction point so the loop can't close ambiguously
    let startKey = null;
    for (const [k, outs] of edges) {
      if (outs.length === 1) {
        startKey = k;
        break;
      }
    }
    if (!startKey) startKey = edges.keys().next().value;
    const [sx, sy] = startKey.split(',').map(Number);
    const loop = [];
    let cx = sx;
    let cy = sy;
    let dx = 0;
    let dy = 0;
    do {
      loop.push({ x: cx, y: cy });
      const k = `${cx},${cy}`;
      const outs = edges.get(k);
      let idx = 0;
      if (outs.length > 1) {
        // pinch point (two regions touching diagonally): take the tightest
        // right turn so we keep hugging the region on our right
        let best = -Infinity;
        for (let i = 0; i < outs.length; i++) {
          const cross = dx * (outs[i].y - cy) - dy * (outs[i].x - cx);
          if (cross > best) {
            best = cross;
            idx = i;
          }
        }
      }
      const next = outs.splice(idx, 1)[0];
      if (outs.length === 0) edges.delete(k);
      dx = next.x - cx;
      dy = next.y - cy;
      cx = next.x;
      cy = next.y;
    } while (cx !== sx || cy !== sy);
    loops.push(simplifyLoop(loop));
  }

  return loops.reduce((best, loop) =>
    Math.abs(loopArea(loop)) > Math.abs(loopArea(best)) ? loop : best
  );
}

const spriteCache = new Map();

function buildSprite(food) {
  if (!spriteCache.has(food.name)) {
    const cells = Array.from({ length: FOOD_N }, () => Array(FOOD_N).fill(null));
    food.paint(painter(cells));
    spriteCache.set(food.name, { name: food.name, cells, polygon: traceOutline(cells) });
  }
  return spriteCache.get(food.name);
}

// --- the mode interface used by game.js (browser only below this point) ---

function drawFood(cells, o, s) {
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (cells[y][x] === null) continue;
      ctx.fillStyle = cells[y][x];
      ctx.fillRect(o.x + x * s, o.y + y * s, s, s);
    }
  }
}

function makeTarget() {
  const sprite = roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]));
  // cell size scales with the window; offset and size are captured here so
  // the drawn sprite and the cut polygon can never disagree (e.g. after a
  // window resize mid-round)
  const s = FOOD_SCALE * (Math.min(canvas.width, canvas.height) / 600);
  const o = {
    x: (canvas.width - FOOD_N * s) / 2,
    y: (canvas.height - FOOD_N * s) / 2,
  };
  const polygon = sprite.polygon.map((p) => ({
    x: o.x + p.x * s,
    y: o.y + p.y * s,
  }));

  // this food's own colors, for the crumb particles when it gets cut
  const fxColors = [];
  for (const row of sprite.cells) {
    for (const c of row) {
      if (c !== null && !fxColors.includes(c) && fxColors.length < 8) fxColors.push(c);
    }
  }

  return {
    polygon,
    fx: 'knife',
    fxColors,
    drawWhole() {
      drawFood(sprite.cells, o, s);
    },
    drawPiece(points, i) {
      ctx.save();
      pathPolygon(points);
      ctx.clip();
      drawFood(sprite.cells, o, s);
      ctx.restore();
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { FOODS, buildSprite, roughenSprite, FOOD_N };
}
