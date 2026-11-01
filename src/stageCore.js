// Shared canvas renderer and input for the editor and standalone player.
export function createStage(canvas, getState, callbacks = {}) {
  const ctx = canvas.getContext('2d'), abort = new AbortController(), images = new Map(), pointers = new Map();
  let frameId = 0, last = 0, destroyed = false, previousEngine = null;
  const listen = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: abort.signal });
  const zoomOf = (view) => Math.min(3, Math.max(.25, Number(view.camera?.zoom) || 1));
  const normalizeKey = (key) => ({ Right: 'ArrowRight', Left: 'ArrowLeft', Up: 'ArrowUp', Down: 'ArrowDown', Space: ' ', Spacebar: ' ' })[key] || (key.length === 1 ? key.toLowerCase() : key);
  const fontSize = (obj, zoom) => Math.max(8, Number(obj.fontSize) || 24) * obj.size / 100 * zoom;
  function point(event, view) {
    const rect = canvas.getBoundingClientRect(), z = zoomOf(view);
    const x = (event.clientX - rect.left) * view.resolution.width / (rect.width || 1), y = (event.clientY - rect.top) * view.resolution.height / (rect.height || 1);
    return { x, y, wx: (x - view.resolution.width / 2) / z + (view.camera?.x || 0), wy: (view.resolution.height / 2 - y) / z + (view.camera?.y || 0) };
  }
  function hit(view, p) {
    const z = zoomOf(view), camera = view.camera || { x: 0, y: 0 };
    return [...view.objects].reverse().find((obj) => {
      if (!obj.visible) return false;
      const dx = p.x - view.resolution.width / 2 - (obj.x - camera.x) * z, dy = p.y - view.resolution.height / 2 + (obj.y - camera.y) * z;
      const angle = (obj.direction - 90) * Math.PI / 180, lx = dx * Math.cos(angle) + dy * Math.sin(angle), ly = -dx * Math.sin(angle) + dy * Math.cos(angle);
      let halfX = 30 * obj.size / 100 * z, halfY = halfX;
      if (obj.shape === 'text' && !obj.image) {
        const font = fontSize(obj, z), lines = String(obj.text || '텍스트').split('\n');
        ctx.font = font + 'px system-ui,sans-serif';
        halfX = Math.max(15, ...lines.map((line) => ctx.measureText(line).width / 2)); halfY = lines.length * font * .65;
      }
      return obj.shape === 'circle' && !obj.image ? dx * dx + dy * dy <= halfX * halfX : Math.abs(lx) <= halfX && Math.abs(ly) <= halfY;
    });
  }
  function updatePointer(event, view) {
    const p = point(event, view);
    if (view.engine) { view.engine.pointerX = p.wx; view.engine.pointerY = p.wy; }
    return p;
  }
  function release(event) {
    const data = pointers.get(event.pointerId); pointers.delete(event.pointerId);
    const engine = getState().engine;
    if (engine) {
      engine.mouse = pointers.size > 0;
      if (data?.direction && ![...pointers.values()].some((p) => p.direction === data.direction)) engine.keys.delete(data.direction);
    }
  }
  const clearInput = () => { pointers.clear(); const engine = getState().engine; if (engine) { engine.mouse = false; engine.keys.clear(); } };
  listen(canvas, 'pointerdown', (event) => {
    event.preventDefault();
    const view = getState(), p = updatePointer(event, view), target = hit(view, p);
    pointers.set(event.pointerId, { startX: p.x, startY: p.y, targetId: target?.id, offsetX: target ? p.wx - target.x : 0, offsetY: target ? p.wy - target.y : 0, direction: null });
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    canvas.focus({ preventScroll: true });
    if (view.running && view.engine) { view.engine.mouse = true; view.engine.unlockAudio(); if (target) (callbacks.onClick || ((obj) => view.engine.click(obj)))(target); }
    else if (target) callbacks.onSelect?.(target.id);
  }, { passive: false });
  listen(canvas, 'pointermove', (event) => {
    const view = getState(), p = updatePointer(event, view), data = pointers.get(event.pointerId);
    if (!data) return;
    if (!view.running && data.targetId) callbacks.onMove?.(data.targetId, Math.round(p.wx - data.offsetX), Math.round(p.wy - data.offsetY));
    else if (view.running && view.engine && event.pointerType === 'touch') {
      const dx = p.x - data.startX, dy = p.y - data.startY;
      const direction = Math.max(Math.abs(dx), Math.abs(dy)) < 24 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
      const previous = data.direction; data.direction = direction;
      if (previous && ![...pointers.values()].some((other) => other.direction === previous)) view.engine.keys.delete(previous);
      if (direction) view.engine.keys.add(direction);
    }
  });
  listen(window, 'pointerup', release); listen(window, 'pointercancel', release); listen(canvas, 'lostpointercapture', release); listen(window, 'blur', clearInput);
  listen(window, 'keydown', (event) => {
    const view = getState(), target = event.target;
    if (!view.running || !view.engine || (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,[contenteditable="true"]')))) return;
    const key = normalizeKey(event.key); view.engine.keys.add(key); view.engine.unlockAudio();
    if (key.startsWith('Arrow') || key === ' ') event.preventDefault();
  }, { capture: true });
  listen(window, 'keyup', (event) => getState().engine?.keys.delete(normalizeKey(event.key)), { capture: true });
  function draw(view) {
    const { width, height } = view.resolution, rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(1, Math.sqrt(8388608 / Math.max(1, rect.width * rect.height * dpr * dpr)));
    const w = Math.max(1, Math.round((rect.width || width) * dpr * scale)), h = Math.max(1, Math.round((rect.height || height) * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(w / width, 0, 0, h / height, 0, 0); ctx.fillStyle = view.background || '#eef5ff'; ctx.fillRect(0, 0, width, height);
    const z = zoomOf(view), camera = view.camera || { x: 0, y: 0 };
    const usedImages = new Set(view.objects.map((obj) => obj.image).filter(Boolean));
    for (const url of images.keys()) if (!usedImages.has(url)) images.delete(url);
    for (const obj of view.objects) {
      if (!obj.visible) continue;
      const size = Math.max(1, 60 * obj.size / 100 * z), x = width / 2 + (obj.x - camera.x) * z, y = height / 2 - (obj.y - camera.y) * z;
      ctx.save(); ctx.translate(x, y); ctx.rotate((obj.direction - 90) * Math.PI / 180);
      let renderedImage = false;
      if (obj.image) {
        let entry = images.get(obj.image);
        if (!entry) {
          const image = new Image(); entry = { image, failed: false }; images.set(obj.image, entry);
          image.onerror = () => { entry.failed = true; callbacks.onError?.(obj.name + '의 이미지를 읽을 수 없습니다.'); }; image.src = obj.image;
        }
        if (!entry.failed && entry.image.complete && entry.image.naturalWidth) { ctx.drawImage(entry.image, -size / 2, -size / 2, size, size); renderedImage = true; }
      }
      if (!renderedImage) {
        ctx.fillStyle = obj.color || '#4b87ef';
        if (obj.shape === 'text' && !obj.image) {
          const font = fontSize(obj, z), lines = String(obj.text || (view.running ? '' : '텍스트')).split('\n');
          ctx.font = font + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * font * 1.2));
        } else if (obj.shape === 'square' || obj.image) ctx.fillRect(-size / 2, -size / 2, size, size);
        else { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill(); }
      }
      if (!view.running && obj.id === view.selectedId) { ctx.strokeStyle = '#235ed8'; ctx.lineWidth = 2; ctx.strokeRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8); }
      ctx.restore();
    }
  }
  function tick(time) {
    if (destroyed) return;
    const view = getState();
    if (previousEngine !== view.engine) { pointers.clear(); previousEngine = view.engine; last = time; }
    if (view.running && view.engine) view.engine.update(last ? Math.min((time - last) / 1000, .05) : 0);
    last = time; draw(view); frameId = requestAnimationFrame(tick);
  }
  frameId = requestAnimationFrame(tick);
  return { draw: () => draw(getState()), clearInput, destroy() { destroyed = true; cancelAnimationFrame(frameId); abort.abort(); pointers.clear(); images.clear(); } };
}
