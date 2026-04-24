import { removeBackground } from '@imgly/background-removal';

const CANVAS_W = 750;
const CANVAS_H = 1000;

// Caption (layer 5): user-editable 1-line text, draggable + resizable
const CAPTION_BASE_PX = 44;
const CAPTION_FONT_FAMILY = '"Zen Kurenaido", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const CAPTION_COLOR = '#e63946';
const CAPTION_ROTATION = (-3 * Math.PI) / 180;

type LayerKey = 'selfie' | 'satoshi' | 'caption';

interface Transform {
  x: number;
  y: number;
  scale: number;
}

interface Layer {
  img: HTMLImageElement;
  t: Transform;
}

type Mode =
  | null
  | { type: 'move'; layer: LayerKey; startX: number; startY: number; startT: Transform }
  | { type: 'resize'; layer: LayerKey; corner: 'tl' | 'tr' | 'bl' | 'br'; startDist: number; startScale: number }
  | { type: 'pinch'; layer: LayerKey; startDist: number; startScale: number };

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const resetSelfieBtn = document.getElementById('resetSelfieBtn') as HTMLButtonElement;
const captionInput = document.getElementById('captionInput') as HTMLInputElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const shareBtn = document.getElementById('shareBtn') as HTMLButtonElement;
const xShareBtn = document.getElementById('xShareBtn') as HTMLAnchorElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const loadingText = document.getElementById('loadingText') as HTMLParagraphElement;

let back: HTMLImageElement | null = null;
let frame: HTMLImageElement | null = null;
let satoshi: Layer | null = null;
let selfie: Layer | null = null;
let selected: LayerKey | null = null;
let caption = '';
const captionT: Transform = { x: CANVAS_W / 2, y: 720, scale: 1 };
let mode: Mode = null;
const activePointers = new Map<number, { x: number; y: number }>();
let needsRedraw = true;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function setLoading(visible: boolean, text?: string) {
  loading.classList.toggle('hidden', !visible);
  if (text) loadingText.textContent = text;
}

function screenToCanvas(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_W,
    y: ((clientY - rect.top) / rect.height) * CANVAS_H
  };
}

function getBounds(layer: Layer) {
  const w = layer.img.naturalWidth * layer.t.scale;
  const h = layer.img.naturalHeight * layer.t.scale;
  return {
    left: layer.t.x - w / 2,
    top: layer.t.y - h / 2,
    right: layer.t.x + w / 2,
    bottom: layer.t.y + h / 2,
    w,
    h
  };
}

function captionFontString(scale: number) {
  return `${CAPTION_BASE_PX * scale}px ${CAPTION_FONT_FAMILY}`;
}

function getCaptionBounds() {
  if (!caption) return null;
  ctx.save();
  ctx.font = captionFontString(captionT.scale);
  const m = ctx.measureText(caption);
  ctx.restore();
  const w = Math.max(m.width + 24, 40);
  const h = CAPTION_BASE_PX * captionT.scale * 1.3;
  return {
    left: captionT.x - w / 2,
    top: captionT.y - h / 2,
    right: captionT.x + w / 2,
    bottom: captionT.y + h / 2,
    w,
    h
  };
}

function getBoundsByKey(key: LayerKey) {
  if (key === 'selfie' && selfie) return getBounds(selfie);
  if (key === 'satoshi' && satoshi) return getBounds(satoshi);
  if (key === 'caption') return getCaptionBounds();
  return null;
}

function transformByKey(key: LayerKey): Transform | null {
  if (key === 'selfie' && selfie) return selfie.t;
  if (key === 'satoshi' && satoshi) return satoshi.t;
  if (key === 'caption') return captionT;
  return null;
}

function pointInLayer(layer: Layer, px: number, py: number) {
  const b = getBounds(layer);
  return px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
}

function pointInCaption(px: number, py: number) {
  const b = getCaptionBounds();
  if (!b) return false;
  return px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
}

function handleHitByBounds(
  b: { left: number; top: number; right: number; bottom: number },
  px: number,
  py: number
): 'tl' | 'tr' | 'bl' | 'br' | null {
  const r = 28;
  const corners: Array<['tl' | 'tr' | 'bl' | 'br', number, number]> = [
    ['tl', b.left, b.top],
    ['tr', b.right, b.top],
    ['bl', b.left, b.bottom],
    ['br', b.right, b.bottom]
  ];
  for (const [name, cx, cy] of corners) {
    if (Math.hypot(px - cx, py - cy) <= r) return name;
  }
  return null;
}

function drawLayer(layer: Layer) {
  const b = getBounds(layer);
  ctx.drawImage(layer.img, b.left, b.top, b.w, b.h);
}

function drawSelectionBox(b: { left: number; top: number; right: number; bottom: number; w: number; h: number }) {
  ctx.save();
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(b.left, b.top, b.w, b.h);
  ctx.setLineDash([]);
  const r = 12;
  ctx.fillStyle = '#ffcc00';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  const corners = [
    [b.left, b.top],
    [b.right, b.top],
    [b.left, b.bottom],
    [b.right, b.bottom]
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawCaptionTo(c: CanvasRenderingContext2D) {
  if (!caption) return;
  c.save();
  c.font = captionFontString(captionT.scale);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.translate(captionT.x, captionT.y);
  c.rotate(CAPTION_ROTATION);
  c.lineJoin = 'round';
  c.miterLimit = 2;
  c.lineWidth = 5 * captionT.scale;
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.strokeText(caption, 0, 0);
  c.fillStyle = CAPTION_COLOR;
  c.fillText(caption, 0, 0);
  c.restore();
}

function drawCaption() {
  drawCaptionTo(ctx);
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Layer 1: back.png
  if (back) {
    ctx.drawImage(back, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Layer 2: selfie (bg-removed)
  if (selfie) drawLayer(selfie);

  // Layer 3: satoshi
  if (satoshi) drawLayer(satoshi);

  // Layer 4: cheki frame
  if (frame) ctx.drawImage(frame, 0, 0, CANVAS_W, CANVAS_H);

  // Layer 5: user caption
  drawCaption();

  // Selection UI (not included in export)
  if (selected) {
    const b = getBoundsByKey(selected);
    if (b) drawSelectionBox(b);
  }
}

function renderForExport(): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = CANVAS_W;
  off.height = CANVAS_H;
  const octx = off.getContext('2d')!;
  if (back) octx.drawImage(back, 0, 0, CANVAS_W, CANVAS_H);
  const drawL = (layer: Layer) => {
    const b = getBounds(layer);
    octx.drawImage(layer.img, b.left, b.top, b.w, b.h);
  };
  if (selfie) drawL(selfie);
  if (satoshi) drawL(satoshi);
  if (frame) octx.drawImage(frame, 0, 0, CANVAS_W, CANVAS_H);
  drawCaptionTo(octx);
  return off;
}

function requestRender() {
  if (needsRedraw) return;
  needsRedraw = true;
  requestAnimationFrame(() => {
    needsRedraw = false;
    render();
  });
}

function tick() {
  if (needsRedraw) {
    needsRedraw = false;
    render();
  }
  requestAnimationFrame(tick);
}

function pickLayer(px: number, py: number): LayerKey | null {
  if (caption && pointInCaption(px, py)) return 'caption';
  if (satoshi && pointInLayer(satoshi, px, py)) return 'satoshi';
  if (selfie && pointInLayer(selfie, px, py)) return 'selfie';
  return null;
}

function pointerDown(e: PointerEvent) {
  canvas.setPointerCapture(e.pointerId);
  const p = screenToCanvas(e.clientX, e.clientY);
  activePointers.set(e.pointerId, p);

  if (activePointers.size === 2 && selected) {
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const t = transformByKey(selected);
    if (t) {
      mode = { type: 'pinch', layer: selected, startDist: dist, startScale: t.scale };
    }
    return;
  }

  // Resize handle hit (only on currently selected layer)
  if (selected) {
    const b = getBoundsByKey(selected);
    const t = transformByKey(selected);
    if (b && t) {
      const corner = handleHitByBounds(b, p.x, p.y);
      if (corner) {
        const dist = Math.hypot(
          (corner === 'tl' || corner === 'bl' ? b.left : b.right) - t.x,
          (corner === 'tl' || corner === 'tr' ? b.top : b.bottom) - t.y
        );
        mode = {
          type: 'resize',
          layer: selected,
          corner,
          startDist: dist,
          startScale: t.scale
        };
        return;
      }
    }
  }

  const picked = pickLayer(p.x, p.y);
  if (picked) {
    selected = picked;
    const t = transformByKey(picked)!;
    mode = {
      type: 'move',
      layer: picked,
      startX: p.x,
      startY: p.y,
      startT: { ...t }
    };
    requestRender();
  } else {
    if (selected !== null) {
      selected = null;
      requestRender();
    }
  }
}

function pointerMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return;
  const p = screenToCanvas(e.clientX, e.clientY);
  activePointers.set(e.pointerId, p);

  if (!mode) return;

  if (mode.type === 'move') {
    const t = transformByKey(mode.layer);
    if (!t) return;
    t.x = mode.startT.x + (p.x - mode.startX);
    t.y = mode.startT.y + (p.y - mode.startY);
    requestRender();
  } else if (mode.type === 'resize') {
    const t = transformByKey(mode.layer);
    if (!t) return;
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const dist = Math.hypot(dx, dy);
    const factor = dist / mode.startDist;
    t.scale = clamp(mode.startScale * factor, 0.05, 6);
    requestRender();
  } else if (mode.type === 'pinch') {
    if (activePointers.size < 2) return;
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const t = transformByKey(mode.layer);
    if (!t) return;
    t.scale = clamp(mode.startScale * (dist / mode.startDist), 0.05, 6);
    requestRender();
  }
}

function pointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (activePointers.size === 0) {
    mode = null;
  } else if (mode?.type === 'pinch' && activePointers.size < 2) {
    mode = null;
  }
}

function onWheel(e: WheelEvent) {
  if (!selected) return;
  e.preventDefault();
  const t = transformByKey(selected);
  if (!t) return;
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  t.scale = clamp(t.scale * factor, 0.05, 6);
  requestRender();
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

async function ensureCaptionFont() {
  if (!('fonts' in document)) return;
  try {
    await document.fonts.load('44px "Zen Kurenaido"');
    await document.fonts.ready;
  } catch {
    /* ignore — fallback font will be used */
  }
}

async function initImages() {
  setLoading(true, 'アセットを読み込み中…');
  const [b, f, s] = await Promise.all([
    loadImage('back.png'),
    loadImage('cheki_00.png'),
    loadImage('satoshi.webp')
  ]);
  await ensureCaptionFont();
  back = b;
  frame = f;

  // Satoshi initial position: right-aligned, full-ish height (~85% canvas)
  const targetH = CANVAS_H * 0.85;
  const scale = targetH / s.naturalHeight;
  const w = s.naturalWidth * scale;
  satoshi = {
    img: s,
    t: {
      x: CANVAS_W - w / 2 - 20,
      y: CANVAS_H * 0.52,
      scale
    }
  };
  setLoading(false);
  requestRender();
}

async function handleFile(file: File) {
  try {
    setLoading(true, '背景を除去中… 初回はモデルをダウンロードします');
    const blob = await removeBackground(file, {
      model: 'isnet_fp16',
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          loadingText.textContent = `背景を除去中… ${key} ${pct}%`;
        }
      }
    });
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    const maxW = CANVAS_W * 0.48;
    const maxH = CANVAS_H * 0.7;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = img.naturalWidth * scale;
    selfie = {
      img,
      t: {
        x: w / 2 + 30,
        y: CANVAS_H * 0.55,
        scale
      }
    };
    selected = 'selfie';
    resetSelfieBtn.disabled = false;
    setLoading(false);
    requestRender();
  } catch (err) {
    console.error(err);
    setLoading(false);
    alert('背景除去に失敗しました。別の画像で試してください。');
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function openBlobForManualSave(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    alert('ポップアップがブロックされました。画像保存を許可してから再度お試しください。');
  } else {
    alert('画像を長押しして「"写真"に追加」で保存してください。');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// NOTE: iOS Safari requires navigator.share() to run inside the user-gesture
// continuation. Any `await` between the click handler and share() can break
// the gesture. Keep share() inside canvas.toBlob() callback (synchronous from
// the perspective of the gesture) and do NOT refactor to `await canvasToBlob`.
function download() {
  const off = renderForExport();
  off.toBlob(async (blob) => {
    if (!blob) return;
    const filename = `cheki_${Date.now()}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], title: '2ショットチェキ' });
        return;
      } catch (e) {
        const name = (e as DOMException).name;
        if (name === 'AbortError') return;
        // NotAllowedError etc.: on iOS we can't <a download>, guide manual save
        if (isIOS()) {
          openBlobForManualSave(blob);
          return;
        }
      }
    }
    downloadBlob(blob, filename);
  }, 'image/png');
}

function share() {
  const off = renderForExport();
  off.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'cheki.png', { type: 'image/png' });
    const shareData: ShareData = {
      title: '2ショットチェキ',
      text: '回胴風雲児 2ショットチェキを作ったよ！\n回胴風雲児13配信中！\nhttps://x.gd/w92hY\n#回胴風雲児 #パニック7 #パチスロ漫画',
      files: [file]
    };
    if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        const name = (e as DOMException).name;
        if (name === 'AbortError') return;
        if (isIOS()) {
          openBlobForManualSave(blob);
          return;
        }
      }
    }
    downloadBlob(blob, `cheki_${Date.now()}.png`);
    alert('お使いの環境ではWeb Shareに未対応のため、画像を保存しました。');
  }, 'image/png');
}

function updateXShareHref() {
  const text = encodeURIComponent('回胴風雲児の2ショットチェキを作ったよ！\n回胴風雲児13配信中！');
  const url = encodeURIComponent('https://x.gd/w92hY');
  const hashtags = encodeURIComponent('回胴風雲児,パニック7,パチスロ漫画');
  xShareBtn.href = `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`;
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
  fileInput.value = '';
});

resetSelfieBtn.addEventListener('click', () => {
  selfie = null;
  if (selected === 'selfie') selected = null;
  resetSelfieBtn.disabled = true;
  requestRender();
});

captionInput.addEventListener('input', () => {
  caption = captionInput.value;
  if (!caption && selected === 'caption') selected = null;
  requestRender();
  void ensureCaptionFont().then(() => requestRender());
});

downloadBtn.addEventListener('click', download);
shareBtn.addEventListener('click', share);

canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);
canvas.addEventListener('wheel', onWheel, { passive: false });

document.addEventListener('keydown', (e) => {
  if (!selected) return;
  if (document.activeElement instanceof HTMLInputElement) return;
  const t = transformByKey(selected);
  if (!t) return;
  const step = e.shiftKey ? 20 : 4;
  let changed = false;
  if (e.key === 'ArrowLeft') { t.x -= step; changed = true; }
  else if (e.key === 'ArrowRight') { t.x += step; changed = true; }
  else if (e.key === 'ArrowUp') { t.y -= step; changed = true; }
  else if (e.key === 'ArrowDown') { t.y += step; changed = true; }
  else if (e.key === '+' || e.key === '=') { t.scale = clamp(t.scale * 1.08, 0.05, 6); changed = true; }
  else if (e.key === '-') { t.scale = clamp(t.scale / 1.08, 0.05, 6); changed = true; }
  if (changed) { e.preventDefault(); requestRender(); }
});

updateXShareHref();
initImages();
tick();
