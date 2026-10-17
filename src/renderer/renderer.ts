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
  lastSrc: string;
  lastBubbleText: string | null;
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
  return { root, img, bubble: null, name, lastSrc: '', lastBubbleText: null };
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
    const lx = b.x - display.bounds.x - w / 2;
    const ly = b.y - display.bounds.y - h + feet;
    el.root.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
    el.root.style.width = `${w}px`;
    el.root.style.height = `${h}px`;
    el.root.classList.toggle('dragging', b.mood === 'drag');

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
    if (p.onBubble) bridge.dismiss(p.id);
    else bridge.pet(p.id);
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
