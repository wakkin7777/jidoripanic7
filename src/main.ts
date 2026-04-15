import { removeBackground } from '@imgly/background-removal';

const CANVAS_W = 750;
const CANVAS_H = 1000;

// Caption strip area (layer 5): user-editable 1-line text
const CAPTION_AREA = { x: 40, y: 798, w: 670, h: 48 };

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
  | { type: 'move'; layer: 'selfie' | 'satoshi'; startX: number; startY: number; startT: Transform }
  | { type: 'resize'; layer: 'selfie' | 'satoshi'; corner: 'tl' | 'tr' | 'bl' | 'br'; startDist: number; startScale: number }
  | { type: 'pinch'; layer: 'selfie' | 'satoshi'; startDist: number; startScale: number };

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
let selected: 'selfie' | 'satoshi' | null = null;
let caption = '';
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

function pointInLayer(layer: Layer, px: number, py: number) {
  const b = getBounds(layer);
  return px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
}

function handleHit(layer: Layer, px: number, py: number): 'tl' | 'tr' | 'bl' | 'br' | null {
  const b = getBounds(layer);
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

function drawSelection(layer: Layer) {
  const b = getBounds(layer);
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

function drawCaption() {
  if (!caption) return;
  ctx.save();
  ctx.font = '600 30px "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#222';
  const cx = CAPTION_AREA.x + CAPTION_AREA.w / 2;
  const cy = CAPTION_AREA.y + CAPTION_AREA.h / 2;
  let text = caption;
  while (text.length > 0 && ctx.measureText(text).width > CAPTION_AREA.w - 16) {
    text = text.slice(0, -1);
  }
  ctx.fillText(text, cx, cy);
  ctx.restore();
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
  if (selected === 'selfie' && selfie) drawSelection(selfie);
  if (selected === 'satoshi' && satoshi) drawSelection(satoshi);
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
  if (caption) {
    octx.font = '600 30px "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#222';
    let text = caption;
    while (text.length > 0 && octx.measureText(text).width > CAPTION_AREA.w - 16) {
      text = text.slice(0, -1);
    }
    octx.fillText(text, CAPTION_AREA.x + CAPTION_AREA.w / 2, CAPTION_AREA.y + CAPTION_AREA.h / 2);
  }
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

function pickLayer(px: number, py: number): 'selfie' | 'satoshi' | null {
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
    const layer = selected === 'selfie' ? selfie : satoshi;
    if (layer) {
      mode = { type: 'pinch', layer: selected, startDist: dist, startScale: layer.t.scale };
    }
    return;
  }

  // Resize handle hit
  if (selected) {
    const layer = selected === 'selfie' ? selfie : satoshi;
    if (layer) {
      const corner = handleHit(layer, p.x, p.y);
      if (corner) {
        const b = getBounds(layer);
        const dist = Math.hypot(
          (corner === 'tl' || corner === 'bl' ? b.left : b.right) - layer.t.x,
          (corner === 'tl' || corner === 'tr' ? b.top : b.bottom) - layer.t.y
        );
        mode = {
          type: 'resize',
          layer: selected,
          corner,
          startDist: dist,
          startScale: layer.t.scale
        };
        return;
      }
    }
  }

  const picked = pickLayer(p.x, p.y);
  if (picked) {
    selected = picked;
    const layer = picked === 'selfie' ? selfie! : satoshi!;
    mode = {
      type: 'move',
      layer: picked,
      startX: p.x,
      startY: p.y,
      startT: { ...layer.t }
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
    const layer = mode.layer === 'selfie' ? selfie : satoshi;
    if (!layer) return;
    layer.t.x = mode.startT.x + (p.x - mode.startX);
    layer.t.y = mode.startT.y + (p.y - mode.startY);
    requestRender();
  } else if (mode.type === 'resize') {
    const layer = mode.layer === 'selfie' ? selfie : satoshi;
    if (!layer) return;
    const dx = p.x - layer.t.x;
    const dy = p.y - layer.t.y;
    const dist = Math.hypot(dx, dy);
    const factor = dist / mode.startDist;
    layer.t.scale = clamp(mode.startScale * factor, 0.05, 4);
    requestRender();
  } else if (mode.type === 'pinch') {
    if (activePointers.size < 2) return;
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const layer = mode.layer === 'selfie' ? selfie : satoshi;
    if (!layer) return;
    layer.t.scale = clamp(mode.startScale * (dist / mode.startDist), 0.05, 4);
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
  const layer = selected === 'selfie' ? selfie : satoshi;
  if (!layer) return;
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  layer.t.scale = clamp(layer.t.scale * factor, 0.05, 4);
  requestRender();
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

async function initImages() {
  setLoading(true, 'アセットを読み込み中…');
  const [b, f, s] = await Promise.all([
    loadImage('back.png'),
    loadImage('cheki_00.png'),
    loadImage('satoshi.png')
  ]);
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
      model: 'isnet',
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          loadingText.textContent = `背景を除去中… ${key} ${pct}%`;
        }
      }
    });
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    const targetH = CANVAS_H * 0.7;
    const scale = targetH / img.naturalHeight;
    const w = img.naturalWidth * scale;
    selfie = {
      img,
      t: {
        x: w / 2 + 30,
        y: CANVAS_H * 0.5,
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

function download() {
  const off = renderForExport();
  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cheki_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
}

async function share() {
  const off = renderForExport();
  off.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'cheki.png', { type: 'image/png' });
    const shareData: ShareData = {
      title: '2ショットチェキ',
      text: '回胴風雲児 2ショットチェキを作ったよ！ #回胴風雲児 #パニック7 #パチスロ漫画',
      files: [file]
    };
    if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    download();
    alert('お使いの環境ではWeb Shareに未対応のため、画像を保存しました。');
  }, 'image/png');
}

function updateXShareHref() {
  const text = encodeURIComponent('回胴風雲児の2ショットチェキを作ったよ！');
  const hashtags = encodeURIComponent('回胴風雲児,パニック7,パチスロ漫画');
  xShareBtn.href = `https://twitter.com/intent/tweet?text=${text}&hashtags=${hashtags}`;
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
  requestRender();
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
  const layer = selected === 'selfie' ? selfie : satoshi;
  if (!layer) return;
  const step = e.shiftKey ? 20 : 4;
  let changed = false;
  if (e.key === 'ArrowLeft') { layer.t.x -= step; changed = true; }
  else if (e.key === 'ArrowRight') { layer.t.x += step; changed = true; }
  else if (e.key === 'ArrowUp') { layer.t.y -= step; changed = true; }
  else if (e.key === 'ArrowDown') { layer.t.y += step; changed = true; }
  else if (e.key === '+' || e.key === '=') { layer.t.scale = clamp(layer.t.scale * 1.08, 0.05, 4); changed = true; }
  else if (e.key === '-') { layer.t.scale = clamp(layer.t.scale / 1.08, 0.05, 4); changed = true; }
  if (changed) { e.preventDefault(); requestRender(); }
});

updateXShareHref();
initImages();
tick();
