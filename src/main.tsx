import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Blockly from 'blockly';
import type Phaser from 'phaser';
import { toolbox } from './blocks';
import {
  Camera, Engine, newProject, normalizeKeyboardKey, normalizeProject, object, Obj, Project, Scene, SoundAsset, TileMap, uid,
} from './runtime';
import { exportHtml } from './exportHtml';
import './style.css';

const DB = 'my-game-engine-v1';
const SOUND_LIMIT = 5 * 1024 * 1024;
const SOUND_TOTAL_LIMIT = 20 * 1024 * 1024;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function save(project: Project) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(project, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function load(): Promise<Project | null> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('projects');
    const request = transaction.objectStore('projects').get('current');
    request.onsuccess = () => {
      try { resolve(request.result ? normalizeProject(request.result) : null); }
      catch (error) { reject(error); }
      database.close();
    };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Stage({ state, onSelect, onMove, onClick, onError, focusRef }: {
  state: any;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onClick: (obj: Obj) => void;
  onError: (message: string) => void;
  focusRef: { current: HTMLDivElement | null };
}) {
  const element = useRef<HTMLDivElement>(null);
  const latest = useRef({ state, onSelect, onMove, onClick, onError });
  latest.current = { state, onSelect, onMove, onClick, onError };

  useEffect(() => {
    if (!element.current) return;
    let dragging: string | null = null;
    let game: Phaser.Game | undefined;
    let disposed = false;
    void import('phaser').then(({ default: PhaserLib }) => {
      if (disposed || !element.current) return;
      game = new PhaserLib.Game({
        type: PhaserLib.CANVAS,
        width: 480,
        height: 360,
        backgroundColor: '#eef5ff',
        parent: element.current,
        scale: { mode: PhaserLib.Scale.FIT, autoCenter: PhaserLib.Scale.CENTER_BOTH },
        scene: {
          create() {
            const scene = this as Phaser.Scene;
            const graphics = scene.add.graphics();
            const sprites: Record<string, Phaser.GameObjects.Image> = {};
            const pending = new Set<string>();
            scene.events.on('update', (_time: number, delta: number) => {
              const view = latest.current.state;
              if (view.running && view.engine) view.engine.update(delta / 1000);
              const camera: Camera = view.camera || { x: 0, y: 0, zoom: 1 };
              const zoom = Math.min(3, Math.max(0.25, Number(camera.zoom) || 1));
              graphics.clear();
              const bg = PhaserLib.Display.Color.HexStringToColor(/^#[0-9a-f]{6}$/i.test(view.background) ? view.background : '#eef5ff');
              graphics.fillStyle(bg.color);
              graphics.fillRect(0, 0, 480, 360);

              const map: TileMap | undefined = view.tilemap;
              if (map) {
                const tileSize = map.tileSize * zoom;
                for (let row = 0; row < map.rows; row++) {
                  for (let column = 0; column < map.columns; column++) {
                    const tile = map.tiles[row]?.[column];
                    if (tile == null) continue;
                    const worldX = (column + 0.5 - map.columns / 2) * map.tileSize;
                    const worldY = (map.rows / 2 - row - 0.5) * map.tileSize;
                    const x = 240 + (worldX - camera.x) * zoom;
                    const y = 180 - (worldY - camera.y) * zoom;
                    graphics.fillStyle(PhaserLib.Display.Color.HexStringToColor(map.palette[tile] || '#3978c6').color);
                    graphics.fillRect(x - tileSize / 2, y - tileSize / 2, tileSize, tileSize);
                    graphics.lineStyle(1, 0xffffff, 0.18);
                    graphics.strokeRect(x - tileSize / 2, y - tileSize / 2, tileSize, tileSize);
                  }
                }
              }

              for (const id of Object.keys(sprites)) {
                if (!view.objects.some((obj: Obj) => obj.id === id && obj.image)) {
                  sprites[id].destroy();
                  delete sprites[id];
                }
              }
              for (const obj of view.objects as Obj[]) {
                const x = 240 + (obj.x - camera.x) * zoom;
                const y = 180 - (obj.y - camera.y) * zoom;
                const size = Math.max(1, 60 * (Number(obj.size) || 100) / 100 * zoom);
                const imageKey = 'img-' + obj.id + '-' + (obj.image?.length || 0);
                if (obj.image) {
                  if (!scene.textures.exists(imageKey) && !pending.has(imageKey)) {
                    pending.add(imageKey);
                    try { scene.textures.addBase64(imageKey, obj.image); }
                    catch { pending.delete(imageKey); latest.current.onError(obj.name + '의 이미지를 표시할 수 없습니다.'); }
                  }
                  if (scene.textures.exists(imageKey)) {
                    if (!sprites[obj.id]) sprites[obj.id] = scene.add.image(x, y, imageKey);
                    else if (sprites[obj.id].texture.key !== imageKey) sprites[obj.id].setTexture(imageKey);
                    sprites[obj.id].setPosition(x, y).setDisplaySize(size, size).setAngle(obj.direction - 90)
                      .setVisible(obj.visible).setDepth(view.objects.indexOf(obj) + 1);
                  }
                }
                if (!obj.visible) continue;
                const color = PhaserLib.Display.Color.HexStringToColor(/^#[0-9a-f]{6}$/i.test(obj.color) ? obj.color : '#4b87ef').color;
                if (!obj.image || !scene.textures.exists(imageKey)) {
                  graphics.fillStyle(color);
                  if (obj.shape === 'square') {
                    const radians = (obj.direction - 90) * Math.PI / 180;
                    const cos = Math.cos(radians);
                    const sin = Math.sin(radians);
                    const half = size / 2;
                    graphics.fillPoints([[-half, -half], [half, -half], [half, half], [-half, half]]
                      .map(([a, b]) => ({ x: x + a * cos - b * sin, y: y + a * sin + b * cos } as any)), true);
                  } else graphics.fillCircle(x, y, size / 2);
                }
                if (!view.running && obj.id === view.selectedId) {
                  graphics.lineStyle(2, 0x235ed8);
                  graphics.strokeRect(x - size / 2 - 4, y - size / 2 - 4, size + 8, size + 8);
                }
              }
            });
            scene.input.on('pointerdown', (pointer: any) => {
              const view = latest.current.state;
              const camera: Camera = view.camera || { x: 0, y: 0, zoom: 1 };
              const zoom = Math.min(3, Math.max(0.25, Number(camera.zoom) || 1));
              const worldX = (pointer.x - 240) / zoom + camera.x;
              const worldY = (180 - pointer.y) / zoom + camera.y;
              const target = [...view.objects].reverse().find((obj: Obj) => obj.visible &&
                Math.abs(worldX - obj.x) <= 30 * obj.size / 100 && Math.abs(worldY - obj.y) <= 30 * obj.size / 100);
              if (!target) return;
              if (view.running) latest.current.onClick(target);
              else {
                dragging = target.id;
                latest.current.onSelect(target.id);
              }
            });
            scene.input.on('pointermove', (pointer: any) => {
              if (!dragging || !pointer.isDown) return;
              const view = latest.current.state;
              const camera: Camera = view.camera || { x: 0, y: 0, zoom: 1 };
              const zoom = Math.min(3, Math.max(0.25, Number(camera.zoom) || 1));
              latest.current.onMove(dragging, Math.round((pointer.x - 240) / zoom + camera.x), Math.round(camera.y - (pointer.y - 180) / zoom));
            });
            scene.input.on('pointerup', () => { dragging = null; });
          },
        },
      });
    }).catch(() => {
      if (!disposed) latest.current.onError('게임 무대를 불러오지 못했습니다. 페이지를 다시 열어 주세요.');
    });
    return () => { disposed = true; game?.destroy(true); };
  }, []);

  return <div className="stage" ref={(node) => { element.current = node; focusRef.current = node; }} aria-label="게임 무대" tabIndex={0} />;
}

function App() {
  const [project, setProject] = useState<Project>(() => newProject(true));
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [runScene, setRunScene] = useState<Scene | null>(null);
  const [tab, setTab] = useState('블록');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('불러오는 중');
  const [full, setFull] = useState(false);
  const [paintColor, setPaintColor] = useState<number | null>(0);
  const engine = useRef<Engine | null>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const blockDiv = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const soundFile = useRef<HTMLInputElement>(null);
  const pulseTimers = useRef(new Map<string, number>());
  const stageFocus = useRef<HTMLDivElement | null>(null);

  const scene = project.scenes.find((item) => item.id === project.sceneId) || project.scenes[0];
  const selected = scene?.objects.find((item) => item.id === project.selectedId) || scene?.objects[0];
  const edit = (change: (draft: Project) => void) => setProject((old) => {
    const next = structuredClone(old);
    change(next);
    return next;
  });
  const editScene = (change: (current: Scene) => void) => edit((draft) => {
    const current = draft.scenes.find((item) => item.id === draft.sceneId);
    if (current) change(current);
  });
  const editObject = (change: (current: Obj) => void) => edit((draft) => {
    const current = draft.scenes.find((item) => item.id === draft.sceneId)?.objects.find((item) => item.id === draft.selectedId);
    if (current) change(current);
  });

  useEffect(() => {
    load()
      .then((saved) => { if (saved) setProject(saved); setStatus('자동 저장 준비됨'); })
      .catch(() => setStatus('저장 공간을 사용할 수 없습니다'))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(() => setStatus('오프라인 저장을 사용할 수 없습니다'));
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    setStatus('저장 중…');
    const timer = setTimeout(() => save(project).then(() => setStatus('자동 저장됨')).catch(() => setStatus('저장 실패: 브라우저 저장 공간 확인')), 600);
    return () => clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => {
    if (!blockDiv.current || !selected) return;
    const currentWorkspace = Blockly.inject(blockDiv.current, {
      toolbox, trashcan: true, scrollbars: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    workspace.current = currentWorkspace;
    let loading = true;
    try { Blockly.serialization.workspaces.load(selected.code || {}, currentWorkspace); }
    catch { setError('이 오브젝트의 블록을 불러오지 못했습니다.'); }
    loading = false;
    const objectId = selected.id;
    const sceneId = scene.id;
    currentWorkspace.addChangeListener((event: any) => {
      if (loading || event.isUiEvent || !event.recordUndo) return;
      const code = Blockly.serialization.workspaces.save(currentWorkspace);
      setProject((old) => {
        const next = structuredClone(old);
        const target = next.scenes.find((item) => item.id === sceneId)?.objects.find((item) => item.id === objectId);
        if (target) target.code = code;
        return next;
      });
    });
    setTimeout(() => Blockly.svgResize(currentWorkspace), 50);
    return () => { workspace.current = null; currentWorkspace.dispose(); };
  }, [scene.id, selected?.id]);
  useEffect(() => {
    if (workspace.current) setTimeout(() => workspace.current && Blockly.svgResize(workspace.current), 50);
  }, [tab]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (!engine.current || (target instanceof HTMLElement &&
          (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))))) return;
      const key = normalizeKeyboardKey(event.key);
      engine.current.keys.add(key);
      if (key.startsWith('Arrow') || key === ' ') event.preventDefault();
    };
    const up = (event: KeyboardEvent) => engine.current?.keys.delete(normalizeKeyboardKey(event.key));
    const blur = () => engine.current?.keys.clear();
    // Blockly handles keyboard events inside its workspace. Capture first so game
    // input still reaches the runtime while the editor canvas is focused.
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const stop = () => {
    engine.current?.stop();
    engine.current = null;
    pulseTimers.current.forEach((timer) => window.clearTimeout(timer));
    pulseTimers.current.clear();
    setRunning(false);
    setRunScene(null);
  };
  const start = () => {
    if (running || !scene) return;
    setError('');
    const initial = structuredClone(scene);
    setRunScene(initial);
    const runner = new Engine(initial.objects, setError, {
      scenes: structuredClone(project.scenes),
      sceneId: initial.id,
      gravity: initial.gravity,
      camera: initial.camera,
      tilemap: initial.tilemap,
      sounds: project.sounds,
      onSceneChange: setRunScene,
    });
    engine.current = runner;
    setRunning(true);
    requestAnimationFrame(() => stageFocus.current?.focus({ preventScroll: true }));
    void runner.start();
  };
  const selectObject = (id: string) => { if (!running) edit((draft) => { draft.selectedId = id; }); };
  const addObject = () => edit((draft) => {
    const current = draft.scenes.find((item) => item.id === draft.sceneId)!;
    const next = object('오브젝트 ' + (current.objects.length + 1));
    current.objects.push(next);
    draft.selectedId = next.id;
  });
  const addScene = () => edit((draft) => {
    const next = newProject(false).scenes[0];
    next.name = '장면 ' + (draft.scenes.length + 1);
    next.objects[0].name = '오브젝트 1';
    draft.scenes.push(next);
    draft.sceneId = next.id;
    draft.selectedId = next.objects[0].id;
  });
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const source = event.target.files?.[0];
      if (!source) return;
      if (source.size > 32 * 1024 * 1024) throw new Error('프로젝트 파일은 32MB 이하만 열 수 있습니다.');
      const content = await source.text();
      const isHtml = /\.html?$/i.test(source.name) || /^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(content);
      let data: unknown;
      if (isHtml) {
        // Parse the file as inert HTML and read only the JSON payload. Never execute
        // the exported game's script while restoring its editable project.
        const document = new DOMParser().parseFromString(content, 'text/html');
        const payload = document.getElementById('project-data');
        if (!payload || payload.tagName !== 'SCRIPT' || payload.getAttribute('type')?.toLowerCase() !== 'application/json') {
          throw new Error('편집 데이터가 포함된 My Game Engine 내보내기 HTML이 아닙니다.');
        }
        data = JSON.parse(payload.textContent || '');
      } else {
        data = JSON.parse(content);
      }
      const imported = normalizeProject(data);
      stop();
      setProject(imported);
      setTab('블록');
    } catch (cause) {
      setError(cause instanceof Error ? '프로젝트를 열 수 없습니다: ' + cause.message : '프로젝트 파일을 읽을 수 없습니다.');
    } finally {
      event.target.value = '';
    }
  };
  const exportJson = () => download(project.name.replace(/[\\/:*?"<>|]/g, '_') + '.mge.json', JSON.stringify(project, null, 2), 'application/json');
  const exportGame = () => download(project.name.replace(/[\\/:*?"<>|]/g, '_') + '.html', exportHtml(project), 'text/html;charset=utf-8');
  const updateKey = (key: string, pressed: boolean) => {
    if (!engine.current) return;
    if (pressed) engine.current.keys.add(key);
    else engine.current.keys.delete(key);
  };
  const pulseKey = (key: string) => {
    const previous = pulseTimers.current.get(key);
    if (previous) window.clearTimeout(previous);
    updateKey(key, true);
    const timer = window.setTimeout(() => {
      if (pulseTimers.current.get(key) !== timer) return;
      pulseTimers.current.delete(key);
      updateKey(key, false);
    }, 120);
    pulseTimers.current.set(key, timer);
  };
  const setTile = (row: number, column: number) => editScene((current) => {
    const previous = current.tilemap.tiles[row]?.[column];
    current.tilemap.tiles[row][column] = previous === paintColor ? null : paintColor;
  });
  const clearTiles = () => editScene((current) => {
    current.tilemap.tiles = current.tilemap.tiles.map((row) => row.map(() => null));
  });
  const addSound = (event: React.ChangeEvent<HTMLInputElement>) => {
    const source = event.target.files?.[0];
    if (!source) return;
    const existingBytes = project.sounds.reduce((sum, asset) => sum + Math.floor(asset.dataUrl.length * 0.75), 0);
    if (!source.type.startsWith('audio/')) {
      setError('MP3, WAV, OGG 등의 소리 파일을 선택하세요.');
      event.target.value = '';
      return;
    }
    if (source.size > SOUND_LIMIT || project.sounds.length >= 32 || existingBytes + source.size > SOUND_TOTAL_LIMIT) {
      setError('소리 파일은 파일당 5MB, 프로젝트 전체 20MB, 최대 32개까지 추가할 수 있습니다.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const asset: SoundAsset = {
        id: uid(),
        name: source.name.replace(/\.[^.]+$/, ''),
        dataUrl: String(reader.result),
      };
      edit((draft) => { draft.sounds.push(asset); });
    };
    reader.onerror = () => setError('소리 파일을 읽지 못했습니다.');
    reader.readAsDataURL(source);
    event.target.value = '';
  };
  const previewSound = (asset?: SoundAsset) => {
    if (asset) {
      const audio = new Audio(asset.dataUrl);
      void audio.play().catch(() => setError('소리를 재생하려면 페이지에서 버튼을 한 번 눌러 주세요.'));
      return;
    }
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.06;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => void context.close();
    } catch { setError('이 브라우저에서는 소리를 재생할 수 없습니다.'); }
  };

  if (!scene) return <div className="toast">프로젝트에 사용할 장면이 없습니다.</div>;
  const runtimeScene = running && runScene ? runScene : scene;
  const view = {
    background: runtimeScene.background,
    objects: running ? runtimeScene.objects : scene.objects,
    camera: running && engine.current ? engine.current.camera : runtimeScene.camera,
    tilemap: running && engine.current ? engine.current.tilemap : runtimeScene.tilemap,
    selectedId: selected?.id,
    running,
    engine: running ? engine.current : null,
  };

  return <div className="app">
    <header>
      <div className="brand"><span className="brandmark">✦</span><span>My Game Engine<small>v0.2.4</small></span></div>
      <input className="project-name" aria-label="프로젝트 이름" value={project.name} disabled={running} onChange={(event) => edit((draft) => { draft.name = event.target.value; })} />
      <div className="header-actions">
        <button disabled={running} onClick={() => { if (confirm('새 프로젝트를 만들까요? 저장 파일로 현재 프로젝트를 보관할 수 있습니다.')) setProject(newProject()); }}>새 프로젝트</button>
        <button disabled={running} onClick={() => file.current?.click()}>열기</button>
        <button onClick={exportJson}>저장</button>
        <button onClick={exportGame}>HTML 내보내기</button>
        <button className={running ? 'stop' : 'primary'} onClick={() => running ? stop() : start()}>{running ? '■ 중지' : '▶ 실행'}</button>
      </div>
      <input hidden type="file" ref={file} accept=".json,.html,.htm,application/json,text/html" onChange={importFile} />
    </header>
    <div className="mobile-tabs">
      {['장면', '오브젝트', '블록', '모양', '소리'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
    </div>
    <main>
      <section className={'left tab-' + tab + ' ' + (tab === '블록' ? 'mobile-hidden' : '')}>
        <div className={'panel stage-panel ' + (full ? 'fullscreen' : '')}>
          <div className="panel-title"><div><strong>무대</strong><span className="muted"> {running ? '실행 중' : '편집 중'}</span></div><button onClick={() => setFull(!full)}>{full ? '닫기' : '⛶'}</button></div>
          <div onPointerDown={() => { if (engine.current) engine.current.mouse = true; }} onPointerUp={() => { if (engine.current) engine.current.mouse = false; }} onPointerCancel={() => { if (engine.current) engine.current.mouse = false; }}>
          <Stage state={view} focusRef={stageFocus} onSelect={selectObject} onClick={(target) => engine.current?.click(target)} onError={setError} onMove={(id, x, y) => editObject((current) => {
              if (current.id === id) { current.x = x; current.y = y; }
            })} />
          </div>
          {running && <div className="dpad" aria-label="방향 조작">
            {([['↑', 'ArrowUp'], ['←', 'ArrowLeft'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']] as const).map(([label, key]) =>
              <button key={key} onPointerDown={(event) => { updateKey(key, true); try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional for synthetic input. */ } }}
                onPointerUp={() => updateKey(key, false)} onPointerCancel={() => updateKey(key, false)} onLostPointerCapture={() => updateKey(key, false)}
                onClick={() => pulseKey(key)}>{label}</button>)}
          </div>}
          <p className="hint">{running ? '방향키, 터치 버튼 또는 게임패드로 움직여 보세요.' : '무대에서 오브젝트를 끌어 위치를 바꿀 수 있어요.'}</p>
        </div>

        <div className="panel scene-panel">
          <div className="panel-title"><strong>장면</strong><button disabled={running} onClick={addScene}>＋</button></div>
          <select aria-label="장면 선택" disabled={running} value={scene.id} onChange={(event) => edit((draft) => {
            draft.sceneId = event.target.value;
            draft.selectedId = draft.scenes.find((item) => item.id === draft.sceneId)?.objects[0]?.id || '';
          })}>
            {project.scenes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <input aria-label="장면 이름" disabled={running} value={scene.name} onChange={(event) => editScene((current) => { current.name = event.target.value; })} />
          <label className="inline">배경 색상 <input type="color" value={scene.background} disabled={running} onChange={(event) => editScene((current) => { current.background = event.target.value; })} /></label>
          <div className="properties scene-settings">
            <label>중력<input type="number" min="0" max="2000" value={scene.gravity} disabled={running} onChange={(event) => editScene((current) => { current.gravity = Number(event.target.value); })} /></label>
            <label>카메라 확대<input type="number" min="0.25" max="3" step="0.1" value={scene.camera.zoom} disabled={running} onChange={(event) => editScene((current) => { current.camera.zoom = Math.max(0.25, Math.min(3, Number(event.target.value) || 1)); })} /></label>
            <label>카메라 X<input type="number" value={scene.camera.x} disabled={running} onChange={(event) => editScene((current) => { current.camera.x = Number(event.target.value); current.camera.followId = undefined; })} /></label>
            <label>카메라 Y<input type="number" value={scene.camera.y} disabled={running} onChange={(event) => editScene((current) => { current.camera.y = Number(event.target.value); current.camera.followId = undefined; })} /></label>
          </div>
          <button className="wide-button" disabled={running || !selected} onClick={() => editScene((current) => { current.camera.followId = selected?.id; })}>선택 오브젝트 따라가기</button>
        </div>

        <div className="panel tilemap-panel">
          <div className="panel-title"><div><strong>타일맵</strong><span className="muted"> {scene.tilemap.columns}×{scene.tilemap.rows}</span></div><button disabled={running} onClick={clearTiles}>지우기</button></div>
          <div className="tile-palette" aria-label="타일 색상 선택">
            {scene.tilemap.palette.map((color, index) => <button key={color} aria-label={'타일 색상 ' + (index + 1)} aria-pressed={paintColor === index}
              className={paintColor === index ? 'selected' : ''} style={{ backgroundColor: color }} disabled={running} onClick={() => setPaintColor(index)} />)}
            <button aria-label="타일 지우개" aria-pressed={paintColor === null} className={'tile-eraser ' + (paintColor === null ? 'selected' : '')} disabled={running} onClick={() => setPaintColor(null)}>⌫</button>
          </div>
          <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(' + scene.tilemap.columns + ', 18px)' }} aria-label="타일 편집 격자">
            {scene.tilemap.tiles.flatMap((row, rowIndex) => row.map((tile, columnIndex) => <button key={rowIndex + '-' + columnIndex}
              aria-label={'타일 ' + (rowIndex + 1) + ', ' + (columnIndex + 1)}
              style={{ backgroundColor: tile == null ? '#f4f7fb' : scene.tilemap.palette[tile] || '#3978c6' }}
              disabled={running} onClick={() => setTile(rowIndex, columnIndex)} />))}
          </div>
          <p className="hint">색을 고른 다음 칸을 눌러 바닥이나 장애물을 그리세요. 타일은 물리 충돌에 사용됩니다.</p>
        </div>

        <div className="panel objects-panel">
          <div className="panel-title"><div><strong>오브젝트</strong><span className="muted"> {scene.objects.length}개</span></div><button disabled={running} onClick={addObject}>＋ 추가</button></div>
          <div className="object-list">
            {scene.objects.map((item) => <button key={item.id} disabled={running} className={'object ' + (selected?.id === item.id ? 'selected' : '')} onClick={() => selectObject(item.id)}>
              <span className="object-icon" style={{ background: item.color, borderRadius: item.shape === 'circle' ? '50%' : '4px' }} />{item.name}
            </button>)}
          </div>
          {selected && <>
            <div className="object-actions">
              <button disabled={running} onClick={() => edit((draft) => {
                const current = draft.scenes.find((item) => item.id === draft.sceneId)!;
                const copy = structuredClone(current.objects.find((item) => item.id === draft.selectedId)!);
                copy.id = uid(); copy.name += ' 복사'; copy.x += 20;
                current.objects.push(copy); draft.selectedId = copy.id;
              })}>복제</button>
              <button disabled={running || scene.objects.length === 1} onClick={() => edit((draft) => {
                const current = draft.scenes.find((item) => item.id === draft.sceneId)!;
                current.objects = current.objects.filter((item) => item.id !== draft.selectedId);
                draft.selectedId = current.objects[0].id;
              })}>삭제</button>
              <button disabled={running} onClick={() => edit((draft) => {
                const objects = draft.scenes.find((item) => item.id === draft.sceneId)!.objects;
                const index = objects.findIndex((item) => item.id === draft.selectedId);
                if (index > 0) [objects[index - 1], objects[index]] = [objects[index], objects[index - 1]];
              })}>뒤로</button>
              <button disabled={running} onClick={() => edit((draft) => {
                const objects = draft.scenes.find((item) => item.id === draft.sceneId)!.objects;
                const index = objects.findIndex((item) => item.id === draft.selectedId);
                if (index < objects.length - 1) [objects[index + 1], objects[index]] = [objects[index], objects[index + 1]];
              })}>앞으로</button>
            </div>
            <div className="properties">
              <label>이름<input value={selected.name} disabled={running} onChange={(event) => editObject((current) => { current.name = event.target.value; })} /></label>
              {(['x', 'y', 'size', 'direction'] as const).map((key, index) => <label key={key}>{['X', 'Y', '크기 %', '방향 °'][index]}
                <input type="number" value={selected[key]} disabled={running} onChange={(event) => editObject((current) => { current[key] = Number(event.target.value); })} /></label>)}
              <label>모양<select value={selected.shape} disabled={running} onChange={(event) => editObject((current) => { current.shape = event.target.value; })}>
                <option value="circle">원</option><option value="square">사각형</option>
              </select></label>
              <label>이미지<button type="button" disabled={running} onClick={() => image.current?.click()}>이미지 선택</button></label>
              <input hidden type="file" ref={image} accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                const source = event.target.files?.[0];
                if (source && source.size > 2 * 1024 * 1024) setError('이미지는 2MB 이하여야 합니다.');
                else if (source) {
                  const reader = new FileReader();
                  reader.onload = () => editObject((current) => { current.image = String(reader.result); });
                  reader.readAsDataURL(source);
                }
                event.target.value = '';
              }} />
              <label>색상<input type="color" value={selected.color} disabled={running} onChange={(event) => editObject((current) => { current.color = event.target.value; })} /></label>
              <label className="inline"><input type="checkbox" checked={selected.visible} disabled={running} onChange={(event) => editObject((current) => { current.visible = event.target.checked; })} /> 보이기</label>
              <label className="inline"><input type="checkbox" checked={selected.physics} disabled={running} onChange={(event) => editObject((current) => { current.physics = event.target.checked; current.vx = 0; current.vy = 0; })} /> 물리 사용</label>
              <label>속도 X<input type="number" value={selected.vx} disabled={running} onChange={(event) => editObject((current) => { current.vx = Number(event.target.value); })} /></label>
              <label>속도 Y<input type="number" value={selected.vy} disabled={running} onChange={(event) => editObject((current) => { current.vy = Number(event.target.value); })} /></label>
              <label>튕김<input type="number" min="0" max="1" step="0.1" value={selected.bounce} disabled={running} onChange={(event) => editObject((current) => { current.bounce = Math.max(0, Math.min(1, Number(event.target.value))); })} /></label>
            </div>
          </>}
        </div>

        <div className="panel sound-panel">
          <div className="panel-title"><div><strong>소리</strong><span className="muted"> {project.sounds.length}개</span></div><button onClick={() => previewSound()}>기본음</button></div>
          <input ref={soundFile} hidden type="file" accept="audio/*" onChange={addSound} />
          <button className="wide-button" disabled={running} onClick={() => soundFile.current?.click()}>소리 파일 추가</button>
          <p className="sound-info">효과음 블록에는 아래 파일 이름을 입력하세요. 파일은 프로젝트에 포함됩니다. (파일당 5MB)</p>
          {project.sounds.length === 0 && <div className="sound-chip">기본 효과음 <span>♪</span></div>}
          {project.sounds.map((asset) => <div className="sound-row" key={asset.id}>
            <span title={asset.name}>{asset.name}</span>
            <button aria-label={asset.name + ' 미리 듣기'} onClick={() => previewSound(asset)}>▶</button>
            <button aria-label={asset.name + ' 삭제'} disabled={running} onClick={() => edit((draft) => { draft.sounds = draft.sounds.filter((item) => item.id !== asset.id); })}>×</button>
          </div>)}
        </div>
      </section>

      <section className={'workspace-panel ' + (tab !== '블록' ? 'mobile-hidden' : '')}>
        <div className="workspace-top"><div><strong>블록 조립소</strong><span className="muted"> · {selected?.name || '오브젝트 없음'}</span></div>
          <div><button onClick={() => workspace.current?.undo(false)} disabled={running}>↶</button><button onClick={() => workspace.current?.undo(true)} disabled={running}>↷</button></div>
        </div>
        <div className="workspace-note">블록을 끌어 연결하거나 블록을 눌러 추가하세요. 내 블록 카테고리에서 나만의 블록을 만들 수 있어요.</div>
        <div className="block-wrap"><div ref={blockDiv} className="blockly" />{running && <div className="edit-lock">실행 중 · 편집하려면 중지하세요</div>}</div>
      </section>
    </main>
    <footer><span>{status}</span><span>My Game Engine · 프로젝트는 이 기기에 저장됩니다</span></footer>
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError('')}>닫기</button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
