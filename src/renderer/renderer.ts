import type { AnimationName, BuddyManifest, BuddyView, DisplayInfo, WorldSnapshot } from '../shared/types';
import type { BuddyBridge } from '../shared/bridge';

declare global {
  interface Window {
    buddy: BuddyBridge;
  }
}

const bridge = window.buddy;
const stage = document.getElementById('stage')!;
const pointers = document.getElementById('pointers') as unknown as SVGSVGElement;

let display: DisplayInfo | null = null;
const manifests = new Map<string, BuddyManifest>();
const elements = new Map<string, BuddyEl>();

interface BuddyEl {
  root: HTMLDivElement;
  img: HTMLImageElement;
  bubble: HTMLDivElement | null;
  name: HTMLDivElement;
  effect: SVGSVGElement | null;
  effectKey: string | null;
  lastSrc: string;
  lastBubbleText: string | null;
}

const RAINBOW = ['#FF3B30', '#FF9500', '#FFD60A', '#34C759', '#2F9BFF', '#5856D6', '#AF52DE'];

/** Rainbow arc over the buddy with the trick's letters spaced along it. */
function arcLetters(text: string, w: number, h: number): SVGSVGElement {
  const W = w * 3, H = h * 1.6;
  const cx = W / 2, cy = H * 0.95, r = Math.max(w * 0.95, 60);
  const band = Math.max(3, r * 0.06);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'effect');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.style.left = `${(w - W) / 2}px`;
  svg.style.top = `${h * 0.2 - H}px`;
  const parts: string[] = [];
  RAINBOW.forEach((c, i) => {
    const rr = r - i * band;
    parts.push(`<path d="M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 1 ${cx + rr} ${cy}" fill="none" stroke="${c}" stroke-width="${band + 0.5}" class="band" style="animation-delay:${i * 60}ms"/>`);
  });
  const letters = [...text];
  const n = letters.length;
  const spread = Math.min(Math.PI * 0.8, 0.42 * n);
  letters.forEach((ch, i) => {
    const a = Math.PI + (Math.PI - spread) / 2 + (spread * (i + 0.5)) / n;
    const lr = r + band * 2.2;
    const x = cx + Math.cos(a) * lr, y = cy + Math.sin(a) * lr;
    const rot = (a * 180) / Math.PI + 90;
    const size = Math.max(18, r * 0.42);
    // Position and rotate with a group so the letter's own CSS pop animation
    // (which uses transform-origin) does not fight the rotation.
    parts.push(
      `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})"><text class="letter" style="animation-delay:${300 + i * 140}ms" font-size="${size}" fill="${RAINBOW[i % RAINBOW.length]}" text-anchor="middle" dominant-baseline="middle">${ch}</text></g>`,
    );
  });
  svg.innerHTML = parts.join('');
  return svg;
}

const PACK_BASE: string = (window as unknown as { BUDDY_PACK_BASE?: string }).BUDDY_PACK_BASE ?? 'buddy://';

function frameUrl(pack: string, file: string): string {
  return `${PACK_BASE}${pack}/${file}`;
}

function registerPacks(packs: Record<string, BuddyManifest>): void {
  for (const [pack, m] of Object.entries(packs)) {
    if (manifests.has(pack)) continue;
    manifests.set(pack, m);
    // Warm the image cache so frame swaps never flicker.
    for (const def of Object.values(m.animations)) {
      for (const f of def?.frames ?? []) {
        const img = new Image();
        img.src = frameUrl(pack, f);
      }
    }
  }
}

/** A flock of bats circling the buddy. */
function batSwarm(count: number, w: number, h: number): SVGSVGElement {
  const W = w * 3, H = h * 2.2;
  const cx = W / 2, cy = H * 0.62;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'effect');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.style.left = `${(w - W) / 2}px`;
  svg.style.top = `${h - H + h * 0.1}px`;
  const bat = `<path class="wing" d="M -2 0 C -8 -8 -15 -8 -19 -3 C -17 -1 -15 0 -13 3 C -12 1 -10 1 -9 4 C -8 2 -6 3 -3 6 Z"/>` +
    `<path class="wing" d="M 2 0 C 8 -8 15 -8 19 -3 C 17 -1 15 0 13 3 C 12 1 10 1 9 4 C 8 2 6 3 3 6 Z"/>` +
    `<ellipse cx="0" cy="2" rx="3.2" ry="5.5"/><circle cx="0" cy="-4" r="3.6"/>` +
    `<path d="M -3 -5 l -1.5 -4.5 l 3.5 2 z M 3 -5 l 1.5 -4.5 l -3.5 2 z"/>` +
    `<circle cx="-1.4" cy="-4.4" r="0.9" fill="#9BF0FF"/><circle cx="1.4" cy="-4.4" r="0.9" fill="#9BF0FF"/>`;
  const parts: string[] = [];
  const rx = Math.max(w * 1.1, 70), ry = Math.max(h * 0.55, 36);
  for (let i = 0; i < count; i++) {
    const delay = -(i * 3000) / count;
    const s = 1.1 + (i % 3) * 0.25;
    parts.push(
      `<g class="orbit" style="animation-delay:${delay}ms; --rx:${rx}px; --ry:${ry}px" transform="translate(${cx} ${cy})">` +
        `<g class="bat" style="animation-delay:${delay}ms" transform="scale(${s})">${bat}</g></g>`,
    );
  }
  svg.innerHTML = parts.join('');
  return svg;
}

/** Confetti bursting up and raining down around the buddy. */
function confetti(w: number, h: number, hanging = false): SVGSVGElement {
  const W = w * 3, H = h * 2.4;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'effect');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.style.left = `${(w - W) / 2}px`;
  // A buddy hanging from the top edge has no room above it: let the confetti fall from the screen edge.
  svg.style.top = hanging ? '0px' : `${h - H}px`;
  const parts: string[] = [];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const x = (W * (i + 0.5)) / n + (((i * 37) % 11) - 5) * 3;
    const c = RAINBOW[i % RAINBOW.length];
    const size = 4 + ((i * 7) % 5);
    const delay = ((i * 53) % 9) * 120;
    const dur = 1800 + ((i * 29) % 7) * 160;
    const shape = i % 3 === 0 ? `<circle r="${size / 2}"/>` : i % 3 === 1 ? `<rect x="${-size / 2}" y="${-size / 3}" width="${size}" height="${size / 1.5}"/>` : `<path d="M 0 ${-size / 2} L ${size / 2} ${size / 2} L ${-size / 2} ${size / 2} Z"/>`;
    parts.push(
      `<g class="piece" style="animation-duration:${dur}ms; animation-delay:${delay}ms; --h:${(H * 0.9).toFixed(0)}px" transform="translate(${x.toFixed(1)} ${(H * 0.85).toFixed(1)})" fill="${c}">` +
        `<g class="tumble" style="animation-delay:${delay}ms">${shape}</g></g>`,
    );
  }
  svg.innerHTML = parts.join('');
  return svg;
}

function createEl(b: BuddyView): BuddyEl {
  const root = document.createElement('div');
  root.className = 'buddy';
  root.dataset.id = b.id;
  const img = document.createElement('img');
  img.className = 'sprite';
  img.draggable = false;
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = b.name;
  root.append(img, name);
  stage.append(root);
  return { root, img, bubble: null, name, effect: null, effectKey: null, lastSrc: '', lastBubbleText: null };
}

function onDisplayFor(b: BuddyView): boolean {
  if (!display) return false;
  const { x, y, width, height } = display.bounds;
  return b.x >= x && b.x < x + width && b.y >= y && b.y <= y + height;
}

function render(snapshot: WorldSnapshot): void {
  if (!display) return;
  const seen = new Set<string>();
  const pointerParts: string[] = [];
  for (const b of snapshot.buddies) {
    if (!onDisplayFor(b)) continue;
    const m = manifests.get(b.pack);
    if (!m) continue;
    seen.add(b.id);
    let el = elements.get(b.id);
    if (!el) {
      el = createEl(b);
      elements.set(b.id, el);
    }
    const anim: AnimationName = m.animations[b.animation] ? b.animation : 'idle';
    const def = m.animations[anim]!;
    const file = def.frames[Math.min(b.frame, def.frames.length - 1)];
    const src = frameUrl(b.pack, file);
    if (el.lastSrc !== src) {
      el.img.src = src;
      el.lastSrc = src;
    }
    const w = m.frameWidth * b.scale;
    const h = m.frameHeight * b.scale;
    const feet = (m.feetOffset ?? 0) * b.scale;
    el.img.width = w;
    el.img.height = h;
    const artFacing = m.facing ?? 'right';
    el.img.classList.toggle('flip', b.facing !== artFacing);
    el.img.classList.toggle('pixel', !!m.pixelArt);
    const lx = b.x - display.bounds.x - w / 2;
    const top = m.edge === 'top';
    const ly = top ? b.y - display.bounds.y - (m.gripOffset ?? 0) * b.scale : b.y - display.bounds.y - h + feet;
    el.root.classList.toggle('top', top);
    el.root.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
    el.root.style.width = `${w}px`;
    el.root.style.height = `${h}px`;
    el.root.classList.toggle('dragging', b.mood === 'drag');
    el.img.classList.toggle('cheer', b.cheering);

    // Speech bubble.
    const text = b.bubble?.text ?? null;
    if (text !== el.lastBubbleText) {
      el.bubble?.remove();
      el.bubble = null;
      if (text !== null) {
        const bubble = document.createElement('div');
        bubble.className = `bubble ${b.bubble!.level}`;
        bubble.textContent = text;
        bubble.dataset.id = b.id;
        el.root.append(bubble);
        el.bubble = bubble;
        // Keep the bubble on screen near the edges.
        requestAnimationFrame(() => {
          const r = bubble.getBoundingClientRect();
          if (r.left < 4) bubble.classList.add('edge-left');
          else if (r.right > window.innerWidth - 4) bubble.classList.add('edge-right');
        });
      }
      el.lastBubbleText = text;
    }

    // Trick effect drawn around the buddy.
    const effectKey = b.effect ? `${JSON.stringify(b.effect)}:${Math.round(w)}:${top}` : null;
    if (effectKey !== el.effectKey) {
      el.effect?.remove();
      el.effect = null;
      if (b.effect?.type === 'arc-letters') el.effect = arcLetters(b.effect.text, w, h);
      else if (b.effect?.type === 'bats') el.effect = batSwarm(b.effect.count ?? 5, w, h);
      else if (b.effect?.type === 'confetti') el.effect = confetti(w, h, top);
      if (el.effect) el.root.append(el.effect);
      el.effectKey = effectKey;
    }

    // Guide pointer: a dashed lead from the raised paw to the target with a pulsing ring.
    if (b.pointer) {
      const px = b.pointer.x - display.bounds.x;
      const py = b.pointer.y - display.bounds.y;
      const pawX = lx + (b.facing === 'right' ? w * 0.93 : w * 0.07);
      const pawY = ly + h * 0.33;
      pointerParts.push(
        `<line class="lead" x1="${pawX}" y1="${pawY}" x2="${px}" y2="${py}"/>`,
        `<circle class="ring" cx="${px}" cy="${py}" r="18"/>`,
        `<circle class="ring-dot" cx="${px}" cy="${py}" r="4"/>`,
      );
    }
  }
  for (const [id, el] of elements) {
    if (!seen.has(id)) {
      el.root.remove();
      elements.delete(id);
    }
  }
  const svg = pointerParts.join('');
  if (pointers.innerHTML !== svg) pointers.innerHTML = svg;
}

// ---- mouse handling -------------------------------------------------------------
// The window ignores mouse events (click-through) except while hovering a buddy.

let ignoring = true;
function setIgnore(v: boolean): void {
  if (v === ignoring) return;
  ignoring = v;
  bridge.setIgnoreMouse(v);
}

function buddyAt(target: EventTarget | null): string | null {
  const el = (target as HTMLElement | null)?.closest?.('.buddy, .bubble') as HTMLElement | null;
  return el?.dataset.id ?? null;
}

let press: { id: string; x: number; y: number; dragging: boolean; onBubble: boolean } | null = null;
let lastClick: { id: string; t: number } | null = null;
const DOUBLE_CLICK_MS = 400;

document.addEventListener('mousemove', (e) => {
  if (press) {
    if (!press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5 && !press.onBubble) {
      press.dragging = true;
      bridge.dragStart(press.id);
    }
    return;
  }
  setIgnore(buddyAt(e.target) === null);
});
document.addEventListener('mouseleave', () => {
  if (!press) setIgnore(true);
});
document.addEventListener('mousedown', (e) => {
  const id = buddyAt(e.target);
  if (!id) return;
  if (e.button === 2) {
    bridge.contextMenu(id);
    return;
  }
  if (e.button !== 0) return;
  const onBubble = !!(e.target as HTMLElement).closest('.bubble');
  press = { id, x: e.clientX, y: e.clientY, dragging: false, onBubble };
  setIgnore(false);
});
document.addEventListener('mouseup', (e) => {
  if (!press) return;
  const p = press;
  press = null;
  if (p.dragging) {
    bridge.dragEnd(p.id);
  } else if (e.button === 0) {
    if (p.onBubble) {
      bridge.dismiss(p.id);
    } else {
      const now = performance.now();
      if (lastClick && lastClick.id === p.id && now - lastClick.t < DOUBLE_CLICK_MS) {
        bridge.trick(p.id);
        lastClick = null;
      } else {
        bridge.pet(p.id);
        lastClick = { id: p.id, t: now };
      }
    }
  }
  setIgnore(buddyAt(document.elementFromPoint(e.clientX, e.clientY)) === null);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => {
  if (press?.dragging) bridge.dragEnd(press.id);
  press = null;
  setIgnore(true);
});

bridge.onDisplay((d) => {
  display = d;
});
bridge.onPacks(registerPacks);
bridge.onSnapshot(render);
