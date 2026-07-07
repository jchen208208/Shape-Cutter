const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// draw a filled triangle from a points array
const tri = [
  { x: 400, y: 150 },
  { x: 550, y: 400 },
  { x: 250, y: 400 },
];

function drawPolygon(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#e94560';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

// Warm-up 2: convert a mouse event's page coordinates to canvas coordinates.
// clientX/clientY are relative to the viewport; the canvas doesn't start at
// the viewport's top-left, so subtract the canvas's position. The width/height
// ratio guards against CSS scaling the canvas away from its 800x600 pixels.
function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// Warm-up 3 state: the clicked anchor and the current mouse position
let anchor = null;
let mouse = null;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPolygon(tri);

  if (anchor) {
    // dot at the anchor
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0';
    ctx.fill();

    // coordinates as text next to the dot
    ctx.fillStyle = '#0f0';
    ctx.font = '14px monospace';
    ctx.fillText(`(${Math.round(anchor.x)}, ${Math.round(anchor.y)})`, anchor.x + 8, anchor.y - 8);

    // line from the anchor to wherever the mouse is now
    if (mouse) {
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.strokeStyle = '#0f0';
      ctx.stroke();
    }
  }
}

canvas.addEventListener('click', (event) => {
  anchor = getCanvasPoint(event);
  console.log(`click at canvas (${Math.round(anchor.x)}, ${Math.round(anchor.y)})`);
  draw();
});

canvas.addEventListener('mousemove', (event) => {
  if (!anchor) return;
  mouse = getCanvasPoint(event);
  draw();
});

draw();
