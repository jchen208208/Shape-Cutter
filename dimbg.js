// Animated backdrop for a dimension's pages: <body data-dim="1|2|3"> picks
// the scene, drawn on the #bg canvas (created here if the page has none).
// Each dimension gets a world that speaks its geometry — 1D: positions on a
// line, 2D: flat shapes on graph paper, 3D: perspective depth — all dark and
// quiet enough to sit behind gameplay.
(() => {
  const DIM = +document.body.dataset.dim || 0;
  if (!DIM) return;

  let cv = document.getElementById('bg');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'bg';
    document.body.prepend(cv);
  }
  window.DIMBG_OWNS_BG = true; // menu.js leaves the #bg canvas to us
  const c = cv.getContext('2d');
  let W = 0;
  let H = 0;
  function size() {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
  }
  size();
  addEventListener('resize', size);

  const hash = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  function base() {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171e38');
    g.addColorStop(1, '#101529');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  // --- 1D: everything is a position along a line ---
  function draw1D(now) {
    base();
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const y = H * (0.14 + (i / (rows - 1)) * 0.62) + Math.sin(i * 5.13) * 8;
      const main = i === rows - 1;
      c.strokeStyle = main ? 'rgba(140, 165, 205, 0.17)' : `rgba(126, 153, 184, ${0.05 + hash(i) * 0.04})`;
      c.lineWidth = main ? 1.6 : 1;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();

      if (main) {
        // the number line: ruler ticks, taller every fifth
        c.strokeStyle = 'rgba(140, 165, 205, 0.13)';
        c.beginPath();
        for (let x = 24, k = 0; x < W; x += 46, k++) {
          const h = k % 5 === 0 ? 9 : 4;
          c.moveTo(x, y - h);
          c.lineTo(x, y + h);
        }
        c.stroke();
      }

      // an interval that lives on this line: [====] sliding slowly
      if (i % 3 === 1) {
        const len = 60 + hash(i + 40) * 70;
        const ix = ((now * (0.008 + hash(i + 9) * 0.008) + hash(i + 20) * W * 3) % (W + len + 160)) - len - 80;
        c.strokeStyle = 'rgba(126, 153, 184, 0.12)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(ix, y);
        c.lineTo(ix + len, y);
        c.moveTo(ix, y - 5);
        c.lineTo(ix, y + 5);
        c.moveTo(ix + len, y - 5);
        c.lineTo(ix + len, y + 5);
        c.stroke();
        c.lineWidth = 1;
      }

      // glowing beads: points traveling their one and only axis
      for (let b = 0; b < 2; b++) {
        const sp = 0.012 + hash(i * 3 + b) * 0.02;
        const dir = hash(i * 7 + b) > 0.5 ? 1 : -1;
        let x = (now * sp * dir + hash(i * 13 + b) * (W + 60) * 9) % (W + 60);
        if (x < 0) x += W + 60;
        x -= 30;
        const r = 2 + hash(i + b * 31) * 1.5;
        const g = c.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, 'rgba(159, 184, 216, 0.5)');
        g.addColorStop(1, 'rgba(159, 184, 216, 0)');
        c.fillStyle = g;
        c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        c.fillStyle = 'rgba(205, 220, 240, 0.55)';
        c.beginPath();
        c.arc(x, y, r * 0.8, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  // --- 2D: flat shapes living on graph paper ---
  function draw2D(now) {
    base();
    const step = 26;
    c.lineWidth = 1;
    for (let gx = 0, k = 0; gx < W; gx += step, k++) {
      c.strokeStyle = k % 5 === 0 ? 'rgba(143, 151, 184, 0.055)' : 'rgba(143, 151, 184, 0.026)';
      c.beginPath();
      c.moveTo(gx + 0.5, 0);
      c.lineTo(gx + 0.5, H);
      c.stroke();
    }
    for (let gy = 0, k = 0; gy < H; gy += step, k++) {
      c.strokeStyle = k % 5 === 0 ? 'rgba(143, 151, 184, 0.055)' : 'rgba(143, 151, 184, 0.026)';
      c.beginPath();
      c.moveTo(0, gy + 0.5);
      c.lineTo(W, gy + 0.5);
      c.stroke();
    }

    // flat polygons adrift on the plane — no shading, no depth, pure area
    for (let i = 0; i < 4; i++) {
      const n = 3 + i;
      const R = 55 + hash(i + 3) * 85;
      const cx = W * (0.16 + 0.68 * hash(i + 11)) + Math.sin(now / 9000 + i * 2.4) * 40;
      const cy = H * (0.18 + 0.6 * hash(i + 23)) + Math.cos(now / 11000 + i * 1.7) * 26;
      const rot = now / (14000 + i * 4000) * (i % 2 ? 1 : -1) + i;
      c.beginPath();
      for (let v = 0; v <= n; v++) {
        const a = rot + (v / n) * Math.PI * 2;
        const px = cx + Math.cos(a) * R;
        const py = cy + Math.sin(a) * R;
        v ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.fillStyle = 'rgba(196, 130, 106, 0.045)';
      c.fill();
      c.strokeStyle = 'rgba(196, 130, 106, 0.15)';
      c.lineWidth = 1.5;
      c.stroke();
    }

    // little x/y axes in the corner: the plane's compass
    const ax = 30;
    const ay = H - 30;
    c.strokeStyle = 'rgba(170, 179, 208, 0.16)';
    c.fillStyle = 'rgba(170, 179, 208, 0.16)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(ax + 46, ay);
    c.moveTo(ax + 46, ay);
    c.lineTo(ax + 40, ay - 4);
    c.moveTo(ax + 46, ay);
    c.lineTo(ax + 40, ay + 4);
    c.moveTo(ax, ay);
    c.lineTo(ax, ay - 46);
    c.moveTo(ax, ay - 46);
    c.lineTo(ax - 4, ay - 40);
    c.moveTo(ax, ay - 46);
    c.lineTo(ax + 4, ay - 40);
    c.stroke();
    c.font = "10px 'Pixelify Sans', monospace";
    c.fillText('x', ax + 50, ay + 3);
    c.fillText('y', ax - 3, ay - 52);
  }

  // --- 3D: a perspective floor and floating wireframe solids ---
  const SOLIDS = [
    { // cube
      v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
    },
    { // tetrahedron
      v: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
      e: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
    },
    { // octahedron
      v: [[1.2, 0, 0], [-1.2, 0, 0], [0, 1.2, 0], [0, -1.2, 0], [0, 0, 1.2], [0, 0, -1.2]],
      e: [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]],
    },
  ];

  function draw3D(now) {
    base();
    const hy = H * 0.42;

    // horizon glow
    const glow = c.createLinearGradient(0, hy - H * 0.16, 0, hy + H * 0.2);
    glow.addColorStop(0, 'rgba(201, 163, 92, 0)');
    glow.addColorStop(0.5, 'rgba(201, 163, 92, 0.07)');
    glow.addColorStop(1, 'rgba(201, 163, 92, 0)');
    c.fillStyle = glow;
    c.fillRect(0, hy - H * 0.16, W, H * 0.36);

    // floor: rails converging on the vanishing point...
    c.strokeStyle = 'rgba(201, 163, 92, 0.055)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = -8; i <= 8; i++) {
      c.moveTo(W / 2 + i * 26, hy);
      c.lineTo(W / 2 + i * W * 0.16, H + 30);
    }
    c.stroke();
    // ...and depth rows flowing gently toward the camera
    const flow = (now / 2600) % 1;
    c.beginPath();
    for (let k = 0; k < 11; k++) {
      const z = k + 1 - flow;
      if (z <= 0.05) continue;
      const y = hy + (H - hy) * (1.6 / z - 0.145);
      if (y < hy || y > H + 20) continue;
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.stroke();

    // far specks above the horizon
    for (let i = 0; i < 26; i++) {
      const sx = hash(i + 71) * W;
      const sy = hash(i + 137) * hy * 0.85;
      const tw = 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(now / 1400 + i * 2.6));
      c.fillStyle = `rgba(220, 205, 170, ${tw})`;
      c.fillRect(sx, sy, 2, 2);
    }

    // wireframe solids hovering at different depths
    for (let i = 0; i < 3; i++) {
      const s = SOLIDS[i];
      const scale = [52, 34, 40][i];
      const cx = W * [0.2, 0.55, 0.84][i];
      const cy = H * [0.2, 0.11, 0.26][i] + Math.sin(now / 3600 + i * 2.1) * 9;
      const yaw = now / (5200 + i * 1700) + i * 1.8;
      const pitch = -0.46;
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const pts = s.v.map(([x, y, z]) => {
        const rx = x * cyw + z * syw;
        const rz = -x * syw + z * cyw;
        return { x: cx + rx * scale, y: cy + (y * cp - rz * sp) * scale };
      });
      c.strokeStyle = `rgba(201, 163, 92, ${0.15 - i * 0.02})`;
      c.lineWidth = 1.4;
      c.beginPath();
      for (const [a, b] of s.e) {
        c.moveTo(pts[a].x, pts[a].y);
        c.lineTo(pts[b].x, pts[b].y);
      }
      c.stroke();
      c.fillStyle = 'rgba(220, 190, 130, 0.2)';
      for (const p of pts) c.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }

  const DRAW = [null, draw1D, draw2D, draw3D][DIM];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    DRAW(1200);
  } else {
    const tick = (now) => {
      DRAW(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
