const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const dimensionsFor = (item) => item.rotation % 180 === 0 ? { w: item.width, d: item.depth } : { w: item.depth, d: item.width };

export function overlaps(a, b, gap = 0) {
  const aa = dimensionsFor(a), bb = dimensionsFor(b);
  return a.x < b.x + bb.w + gap && a.x + aa.w + gap > b.x && a.y < b.y + bb.d + gap && a.y + aa.d + gap > b.y;
}

export function hasExitRoute(room, items, routeWidth = 0.9) {
  const { width, length } = room.dimensions;
  const cell = 0.12;
  const cols = Math.floor(width / cell), rows = Math.floor(length / cell);
  if (!cols || !rows) return false;
  const door = room.features.find(f => f.kind === 'door');
  const entryX = door?.wall === 'south' ? (door.offset ?? 0.5) + (door.width ?? 0.8) / 2 : width / 2;
  const start = [clamp(Math.floor(entryX / cell), 0, cols - 1), 0];
  const visited = new Set([`${start[0]},${start[1]}`]), queue = [start];
  const radius = routeWidth / 2;
  const blocked = (x, y) => items.some(item => {
    const { w, d } = dimensionsFor(item);
    return x > item.x - radius && x < item.x + w + radius && y > item.y - radius && y < item.y + d + radius;
  });
  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cy >= rows - 2) return true;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || visited.has(key)) continue;
      const x = (nx + 0.5) * cell, y = (ny + 0.5) * cell;
      if ((nx === start[0] && ny === 0) || !blocked(x, y)) { visited.add(key); queue.push([nx, ny]); }
    }
  }
  return false;
}

export function validateLayout(room, items) {
  const { width, length } = room.dimensions;
  const issues = [];
  items.forEach((item, index) => {
    const { w, d } = dimensionsFor(item);
    if (item.x < 0 || item.y < 0 || item.x + w > width || item.y + d > length) issues.push(`${item.name} extends beyond the room boundary.`);
    for (const other of items.slice(index + 1)) if (overlaps(item, other, 0.015)) issues.push(`${item.name} overlaps ${other.name}.`);
    const door = room.features.find(f => f.kind === 'door' && f.wall === 'south');
    if (door) {
      const cx = (door.offset ?? 0.5) + (door.width ?? 0.8) / 2;
      if (item.y < 0.86 && item.x < cx + 0.48 && item.x + w > cx - 0.48) issues.push(`${item.name} blocks the door approach.`);
    }
  });
  if (!hasExitRoute(room, items, room.priorities?.routeWidth ?? 0.9)) issues.push('The preferred clear route from the door is blocked.');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function layoutScore(room, items, mode = 'Balanced') {
  const { width, length } = room.dimensions;
  let penalty = 0;
  items.forEach((item, i) => {
    const { w, d } = dimensionsFor(item);
    const edge = Math.min(item.x, item.y, width - item.x - w, length - item.y - d);
    penalty += Math.max(0, 0.08 - edge) * 180;
    items.slice(i + 1).forEach(other => {
      const { w: ow, d: od } = dimensionsFor(other);
      const dx = Math.max(0, Math.max(item.x, other.x) - Math.min(item.x + w, other.x + ow));
      const dy = Math.max(0, Math.max(item.y, other.y) - Math.min(item.y + d, other.y + od));
      const dist = Math.hypot(dx, dy);
      if (dist < 0.12) penalty += (0.12 - dist) * 250;
    });
    if (item.moveClass === 'assisted') penalty += 2.2;
  });
  if (!hasExitRoute(room, items, room.priorities?.routeWidth ?? 0.9)) penalty += 300;
  const center = items.reduce((sum, item) => {
    const { w, d } = dimensionsFor(item);
    const cx = item.x + w / 2 - width / 2, cy = item.y + d / 2 - length / 2;
    return sum + Math.exp(-(cx * cx + cy * cy) / 0.65) * (item.category === 'Table' ? 0.5 : 1);
  }, 0);
  const wallPreference = items.reduce((sum, item) => {
    const { w, d } = dimensionsFor(item);
    return sum + Math.min(item.x, item.y, width - item.x - w, length - item.y - d);
  }, 0);
  if (mode === 'Maximum Open Space') penalty += center * 14;
  if (mode === 'Easy Cleaning') penalty += center * 9 - wallPreference * 1.1;
  if (mode === 'Daily Comfort') penalty += center * 3;
  return Math.max(0, Math.round(100 - penalty));
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

export function makeCandidates(room, count = 3) {
  const { width, length } = room.dimensions;
  const anchors = [[2.6,2.8,0],[2.35,1.65,0],[3.85,.3,90],[3.75,1.85,0],[1.7,2.5,0],[2.65,.35,0],[.2,2.8,0],[2.8,1.8,90]];
  const profiles = ['Balanced', 'Maximum Open Space', 'Easy Cleaning'];
  const pool = [];
  for (let run = 0; run < 6; run++) {
    const random = seeded(31415 + run * 97);
    let items = room.objects.map((o,index) => {
      if (o.fixed) return { ...o };
      const anchor=anchors[(index+run%3)%anchors.length];
      return {...o,x:clamp(anchor[0]+(random()-.5)*.35,.03,width-o.width-.03),y:clamp(anchor[1]+(random()-.5)*.35,.03,length-o.depth-.03),rotation:anchor[2]};
    });
    let best = items.map(o => ({ ...o })), bestScore = -Infinity;
    if (validateLayout(room,items).valid) bestScore=layoutScore(room,items,profiles[run%profiles.length]);
    for (let step = 0; step < 300; step++) {
      const index = Math.floor(random() * items.length), item = items[index];
      if (!item || item.fixed) continue;
      const candidate = { ...item };
      if (random() < 0.12) candidate.rotation = (candidate.rotation + 90) % 180;
      const { w, d } = dimensionsFor(candidate);
      candidate.x = clamp(candidate.x + (random() - 0.5) * 1.2, 0.05, Math.max(0.05, width - w - 0.05));
      candidate.y = clamp(candidate.y + (random() - 0.5) * 1.2, 0.05, Math.max(0.05, length - d - 0.05));
      const next = items.map((o, i) => i === index ? candidate : o);
      const valid = validateLayout(room, next);
      const score = layoutScore(room, next, profiles[run % profiles.length]);
      const currentScore = layoutScore(room, items, profiles[run % profiles.length]);
      const temp = Math.max(0.7, 14 * (1 - step / 300));
      if (valid.valid && (score > bestScore || random() < Math.exp((score - currentScore) / temp))) items = next;
      if (valid.valid && score > bestScore) { best = next.map(o => ({ ...o })); bestScore = score; }
    }
    if (bestScore >= 0) pool.push({ items: best, score: layoutScore(room, best, profiles[run % profiles.length]), mode: profiles[run % profiles.length] });
  }
  const unique = [];
  for (const candidate of pool.sort((a, b) => b.score - a.score)) {
    const signature = candidate.items.map(o => `${o.id}:${Math.round(o.x * 4) / 4},${Math.round(o.y * 4) / 4},${o.rotation}`).join('|');
    if (unique.some(c => c.signature === signature)) continue;
    unique.push({ ...candidate, signature });
    if (unique.length >= count) break;
  }
  if (unique.length < count) {
    const seeds = unique.slice();
    for (const base of seeds) {
      for (const id of ['coffee-table','armchair','desk','cabinet','sofa']) {
        const original = base.items.find(o => o.id === id && !o.fixed);
        if (!original) continue;
        for (const [dx,dy] of [[.38,0],[-.38,0],[0,.38],[0,-.38]]) {
          const items = base.items.map(o => o.id === id ? {...o,x:clamp(o.x+dx,0,width-dimensionsFor(o).w),y:clamp(o.y+dy,0,length-dimensionsFor(o).d)} : {...o});
          if (!validateLayout(room,items).valid) continue;
          const signature = items.map(o => `${o.id}:${Math.round(o.x * 4) / 4},${Math.round(o.y * 4) / 4},${o.rotation}`).join('|');
          if (unique.some(c => c.signature === signature)) continue;
          unique.push({items,signature,score:layoutScore(room,items,base.mode),mode:base.mode});
          if (unique.length >= count) break;
        }
        if (unique.length >= count) break;
      }
      if (unique.length >= count) break;
    }
  }
  return unique.map((c, i) => ({ ...c, id: `layout-${i + 1}`, name: ['Balanced', 'More open space', 'Easier to clean'][i] ?? `Option ${i + 1}`, explanation: ['Balances comfort and clear routes around the furniture you already own.', 'Moves more of the furniture to the room edges to open the middle.', 'Keeps the floor easier to reach for routine cleaning.'][i] ?? 'A feasible alternative based on your current priorities.' }));
}

export function makeMovePlan(from, to) {
  const before = new Map(from.map(o => [o.id, o]));
  return to.filter(o => { const b = before.get(o.id); return b && (Math.abs(b.x - o.x) > 0.08 || Math.abs(b.y - o.y) > 0.08 || b.rotation !== o.rotation); })
    .sort((a, b) => (a.moveClass === 'easy' ? 1 : 0) - (b.moveClass === 'easy' ? 1 : 0))
    .map((o, i) => ({ id: `step-${o.id}`, objectId: o.id, title: `Move ${o.name}`, detail: `Move to ${o.x.toFixed(1)} m from the left wall and ${o.y.toFixed(1)} m from the entrance wall.`, caution: o.moveClass === 'assisted' ? 'This item may need another person. Empty it first and confirm a safe lift.' : 'Check that the route is clear before moving it.', complete: false, order: i + 1 }));
}
