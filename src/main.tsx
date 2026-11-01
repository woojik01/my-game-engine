import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Blockly from 'blockly';
import { createStage } from './stageCore.js';
import { addProjectScene, deleteProjectScene, duplicateProjectScene, renameProjectScene, renameProjectObject, uniqueName, visitBlocks, projectIssues } from './projectActions';
import { toolbox } from './blocks';
import {
  Engine, newProject, normalizeProject, object, Obj, Project, Resolution, Scene, SoundAsset, uid,
} from './runtime';
import { exportHtml } from './exportHtml';
import './style.css';

const DB = 'my-game-engine-v1';
const SOUND_LIMIT = 5 * 1024 * 1024;
const SOUND_TOTAL_LIMIT = 20 * 1024 * 1024;
const RESOLUTION_PRESETS: Array<{ id: string; label: string; width: number; height: number }> = [
  { id: 'landscape-4-3', label: '가로 4:3 · 480 × 360', width: 480, height: 360 },
  { id: 'landscape-16-9', label: '가로 16:9 · 960 × 540', width: 960, height: 540 },
  { id: 'portrait-9-16', label: '세로 9:16 · 540 × 960', width: 540, height: 960 },
  { id: 'square', label: '정사각형 · 600 × 600', width: 600, height: 600 },
];
const numericValue = (raw: string, previous: number, min = -Infinity, max = Infinity) =>
  raw.trim() && Number.isFinite(Number(raw)) ? Math.min(max, Math.max(min, Number(raw))) : previous;

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
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('projects', 'readwrite');
      transaction.objectStore('projects').put(project, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
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
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function CommitInput({ value, onCommit, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string | number; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <input {...props} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={(event) => { onCommit(event.target.value); setDraft(String(value)); }} onKeyDown={(event) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') { event.currentTarget.value = String(value); setDraft(String(value)); event.currentTarget.blur(); }
  }} />;
}

function Stage({ state, onSelect, onMove, onClick, onError, focusRef }: {
  state: any; onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void;
  onClick: (obj: Obj) => void; onError: (message: string) => void;
  focusRef: { current: HTMLCanvasElement | null };
}) {
  const element = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ state, onSelect, onMove, onClick, onError });
  latest.current = { state, onSelect, onMove, onClick, onError };
  useEffect(() => {
    if (!element.current) return;
    const stage = createStage(element.current, () => latest.current.state, {
      onSelect: (id) => latest.current.onSelect(id), onMove: (id, x, y) => latest.current.onMove(id, x, y),
      onClick: (obj) => latest.current.onClick(obj), onError: (message) => latest.current.onError(message),
    });
    return () => stage.destroy();
  }, []);
  const { width, height } = state.resolution;
  return <div className="stage" style={{ aspectRatio: `${width}/${height}`, width: state.full ? `min(100%, ${70 * width / height}dvh)` : '100%' }}><canvas ref={(node) => { element.current = node; focusRef.current = node; }} aria-label="게임 무대" tabIndex={0} /></div>;
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
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [customResolution, setCustomResolution] = useState(false);
  const [deletedScene, setDeletedScene] = useState<{ scene: Scene; index: number } | null>(null);
  const engine = useRef<Engine | null>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const workspaceOwner = useRef<{ sceneId: string; objectId: string } | null>(null);
  const blockDiv = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const soundFile = useRef<HTMLInputElement>(null);
  const pulseTimers = useRef(new Map<string, number>());
  const stageFocus = useRef<HTMLCanvasElement | null>(null);

  const scene = project.scenes.find((item) => item.id === project.sceneId) || project.scenes[0];
  const selected = scene?.objects.find((item) => item.id === project.selectedId) || scene?.objects[0];
  const edit = (change: (draft: Project) => void) => setProject((old) => {
    const next = structuredClone(old);
    const owner = workspaceOwner.current;
    const target = owner && next.scenes.find((s) => s.id === owner.sceneId)?.objects.find((o) => o.id === owner.objectId);
    if (target && workspace.current) target.code = Blockly.serialization.workspaces.save(workspace.current);
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
  const snapshotProject = () => {
    const snapshot = structuredClone(project);
    const owner = workspaceOwner.current;
    const target = owner && snapshot.scenes.find((s) => s.id === owner.sceneId)?.objects.find((o) => o.id === owner.objectId);
    if (target && workspace.current) target.code = Blockly.serialization.workspaces.save(workspace.current);
    return snapshot;
  };
  const replaceProject = (next: Project) => {
    setProject(next);
    setDeletedScene(null);
    setCustomResolution(false);
    setWorkspaceEpoch((n) => n + 1);
  };

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
    workspaceOwner.current = { sceneId: scene.id, objectId: selected.id };
    currentWorkspace.registerToolboxCategoryCallback('GAME_PROCEDURES', (ws) =>
      Blockly.Procedures.flyoutCategory(ws).filter((item: any) => !['procedures_defreturn', 'procedures_ifreturn', 'procedures_callreturn'].includes(item.type)));
    let loading = true, disposed = false;
    try { Blockly.serialization.workspaces.load(selected.code || {}, currentWorkspace); }
    catch { setError('이 오브젝트의 블록을 불러오지 못했습니다.'); }
    loading = false;
    const objectId = selected.id;
    const sceneId = scene.id;
    currentWorkspace.addChangeListener((event: any) => {
      if (loading || disposed || event.isUiEvent || !event.recordUndo) return;
      const code = Blockly.serialization.workspaces.save(currentWorkspace);
      setProject((old) => {
        const next = structuredClone(old);
        const target = next.scenes.find((item) => item.id === sceneId)?.objects.find((item) => item.id === objectId);
        if (target) target.code = code;
        return next;
      });
    });
    const resize = () => { if (!disposed) Blockly.svgResize(currentWorkspace); };
    const observer = new ResizeObserver(resize);
    observer.observe(blockDiv.current);
    const resizeId = requestAnimationFrame(resize);
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(resizeId); workspace.current = null; workspaceOwner.current = null; currentWorkspace.dispose(); };
  }, [scene.id, selected?.id, workspaceEpoch]);

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
    const snapshot = snapshotProject();
    setProject(snapshot);
    const initial = structuredClone(snapshot.scenes.find((s) => s.id === snapshot.sceneId)!);
    setRunScene(initial);
    const runner = new Engine(initial.objects, setError, {
      scenes: structuredClone(snapshot.scenes),
      sceneId: initial.id,
      gravity: initial.gravity,
      camera: initial.camera,
      resolution: snapshot.resolution,
      sounds: snapshot.sounds,
      onSceneChange: setRunScene,
    });
    engine.current = runner;
    setRunning(true);
    setTab('장면');
    requestAnimationFrame(() => stageFocus.current?.focus({ preventScroll: true }));
    void runner.start();
  };
  const selectObject = (id: string) => { if (!running) edit((draft) => { draft.selectedId = id; }); };
  const addObject = () => edit((draft) => {
    const current = draft.scenes.find((item) => item.id === draft.sceneId)!;
    let n = 1;
    while (current.objects.some((o) => o.name === '오브젝트 ' + n)) n++;
    const next = object('오브젝트 ' + n);
    current.objects.push(next);
    draft.selectedId = next.id;
  });
  const addScene = () => edit(addProjectScene);
  const deleteScene = () => {
    if (running || project.scenes.length <= 1 || !confirm('"' + scene.name + '" 장면과 그 안의 오브젝트를 삭제할까요? 삭제 후 되돌릴 수 있습니다.')) return;
    const snapshot = snapshotProject(), index = snapshot.scenes.findIndex((s) => s.id === scene.id);
    setDeletedScene({ scene: structuredClone(snapshot.scenes[index]), index });
    deleteProjectScene(snapshot, scene.id);
    setProject(snapshot);
  };
  const restoreScene = () => {
    if (!deletedScene || running) return;
    edit((draft) => {
      const restored = structuredClone(deletedScene.scene);
      if (draft.scenes.some((s) => s.id === restored.id)) return;
      const oldName = restored.name;
      restored.name = uniqueName(restored.name, draft.scenes.map((s) => s.name));
      for (const obj of restored.objects) visitBlocks(obj.code, (block) => {
        if (block.type === 'switch_scene' && block.fields?.NAME === oldName) block.fields.NAME = restored.name;
      });
      draft.scenes.splice(Math.min(deletedScene.index, draft.scenes.length), 0, restored);
      draft.sceneId = restored.id;
      draft.selectedId = restored.objects[0].id;
    });
    setDeletedScene(null);
  };
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const source = event.target.files?.[0];
      if (!source) return;
      if (source.size > 128 * 1024 * 1024) throw new Error('프로젝트 파일은 128MB 이하만 열 수 있습니다.');
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
      replaceProject(imported);
      setTab('블록');
    } catch (cause) {
      setError(cause instanceof Error ? '프로젝트를 열 수 없습니다: ' + cause.message : '프로젝트 파일을 읽을 수 없습니다.');
    } finally {
      event.target.value = '';
    }
  };
  const exportJson = () => download(project.name.replace(/[\\/:*?"<>|]/g, '_') + '.mge.json', JSON.stringify(snapshotProject(), null, 2), 'application/json');
  const exportGame = () => download(project.name.replace(/[\\/:*?"<>|]/g, '_') + '.html', exportHtml(snapshotProject()), 'text/html;charset=utf-8');
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
  const resolutionPreset = customResolution ? 'custom' : RESOLUTION_PRESETS.find((preset) =>
    preset.width === project.resolution.width && preset.height === project.resolution.height)?.id || 'custom';
  const setResolution = (key: keyof Resolution, rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) return;
    const maximum = key === 'width' ? 3840 : 2160;
    setCustomResolution(true);
    edit((draft) => { draft.resolution[key] = Math.min(maximum, Math.max(240, Math.round(value))); });
  };
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
      edit((draft) => { asset.name = uniqueName(asset.name, draft.sounds.map((s) => s.name)); draft.sounds.push(asset); });
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
  const issues = projectIssues(project);
  const view = {
    background: runtimeScene.background,
    objects: running && engine.current ? engine.current.objects : scene.objects,
    camera: running && engine.current ? engine.current.camera : runtimeScene.camera,
    resolution: project.resolution,
    selectedId: selected?.id,
    running, full,
    engine: running ? engine.current : null,
  };

  return <div className="app">
    <header>
      <div className="brand"><span className="brandmark">✦</span><span>My Game Engine<small>v0.3.0</small></span></div>
      <input className="project-name" aria-label="프로젝트 이름" value={project.name} disabled={running} onChange={(event) => edit((draft) => { draft.name = event.target.value; })} />
      <div className="header-actions">
        <button disabled={running || !ready} onClick={() => { if (confirm('새 프로젝트를 만들까요? 저장 파일로 현재 프로젝트를 보관할 수 있습니다.')) replaceProject(newProject()); }}>새 프로젝트</button>
        <button disabled={running || !ready} onClick={() => file.current?.click()}>열기</button>
        <button disabled={!ready} onClick={exportJson}>저장</button>
        <button disabled={!ready} onClick={exportGame}>HTML 내보내기</button>
        <button disabled={!ready} className={running ? 'stop' : 'primary'} onClick={() => running ? stop() : start()}>{running ? '■ 중지' : '▶ 실행'}</button>
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
          <div className="stage-host">
          <Stage state={view} focusRef={stageFocus} onSelect={selectObject} onClick={(target) => engine.current?.click(target)} onError={setError} onMove={(id, x, y) => editScene((current) => {
              const target = current.objects.find((o) => o.id === id);
              if (target) { target.x = x; target.y = y; }
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
          <div className="object-actions scene-actions">
            <button disabled={running} onClick={() => edit((draft) => duplicateProjectScene(draft, scene.id))}>장면 복제</button>
            <button disabled={running || project.scenes.length === 1} title={project.scenes.length === 1 ? '장면은 하나 이상 필요합니다' : '현재 장면 삭제'} onClick={deleteScene}>장면 삭제</button>
            {deletedScene && <button disabled={running} onClick={restoreScene}>삭제 되돌리기</button>}
          </div>
          <CommitInput aria-label="장면 이름" disabled={running} value={scene.name} onCommit={(value) => {
            if (value === scene.name) return;
            const next = snapshotProject(); renameProjectScene(next, scene.id, value); setProject(next); setWorkspaceEpoch((n) => n + 1);
          }} />
          <label className="inline">배경 색상 <input type="color" value={scene.background} disabled={running} onChange={(event) => editScene((current) => { current.background = event.target.value; })} /></label>
          <div className="resolution-control">
            <label>게임 기준 해상도
              <select aria-label="게임 기준 해상도" value={resolutionPreset} disabled={running} onChange={(event) => {
                setCustomResolution(event.target.value === 'custom');
                const preset = RESOLUTION_PRESETS.find((item) => item.id === event.target.value);
                if (preset) edit((draft) => { draft.resolution = { width: preset.width, height: preset.height }; });
              }}>
                {RESOLUTION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                <option value="custom">직접 입력</option>
              </select>
            </label>
            <div className="properties resolution-settings">
              <label>너비 (240–3840)<CommitInput type="number" min="240" max="3840" step="1" value={project.resolution.width} disabled={running} onCommit={(value) => setResolution('width', value)} /></label>
              <label>높이 (240–2160)<CommitInput type="number" min="240" max="2160" step="1" value={project.resolution.height} disabled={running} onCommit={(value) => setResolution('height', value)} /></label>
            </div>
            <p className="hint">내보낸 게임은 이 비율을 유지하며 PC와 모바일 화면에 맞춰 크기가 조정됩니다.</p>
          </div>
          <div className="properties scene-settings">
            <label>중력<CommitInput type="number" min="0" max="2000" value={scene.gravity} disabled={running} onCommit={(value) => editScene((current) => { current.gravity = numericValue(value, current.gravity, 0, 2000); })} /></label>
            <label>카메라 확대<CommitInput type="number" min="0.25" max="3" step="0.1" value={scene.camera.zoom} disabled={running} onCommit={(value) => editScene((current) => { current.camera.zoom = numericValue(value, current.camera.zoom, .25, 3); })} /></label>
            <label>카메라 X<CommitInput type="number" value={scene.camera.x} disabled={running} onCommit={(value) => editScene((current) => { current.camera.x = numericValue(value, current.camera.x); delete current.camera.followId; })} /></label>
            <label>카메라 Y<CommitInput type="number" value={scene.camera.y} disabled={running} onCommit={(value) => editScene((current) => { current.camera.y = numericValue(value, current.camera.y); delete current.camera.followId; })} /></label>
          </div>
          <button className="wide-button" disabled={running || !selected} onClick={() => editScene((current) => { current.camera.followId = selected?.id; })}>선택 오브젝트 따라가기</button>
          <button className="wide-button" disabled={running || !scene.camera.followId} onClick={() => editScene((current) => { delete current.camera.followId; })}>카메라 따라가기 해제</button>
          {issues.length > 0 && <details className="project-issues"><summary>블록 연결 확인 {issues.length}개</summary>{issues.map((issue) => <p key={issue}>{issue}</p>)}</details>}
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
                const oldId = copy.id, oldName = copy.name;
                copy.id = uid(); copy.name = uniqueName(copy.name + ' 복사', current.objects.map((o) => o.name)); copy.x += 20;
                visitBlocks(copy.code, (block) => {
                  if (['camera_follow', 'touching_target'].includes(block.type) && [oldId, oldName].includes(block.fields?.TARGET)) block.fields.TARGET = copy.id;
                });
                current.objects.push(copy); draft.selectedId = copy.id;
              })}>복제</button>
              <button disabled={running || scene.objects.length === 1} onClick={() => edit((draft) => {
                const current = draft.scenes.find((item) => item.id === draft.sceneId)!;
                current.objects = current.objects.filter((item) => item.id !== draft.selectedId);
                if (current.camera.followId === draft.selectedId) delete current.camera.followId;
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
              <label>이름<CommitInput value={selected.name} disabled={running} onCommit={(value) => {
                if (value === selected.name) return;
                const next = snapshotProject(); renameProjectObject(next, selected.id, value); setProject(next); setWorkspaceEpoch((n) => n + 1);
              }} /></label>
              {(['x', 'y', 'size', 'direction'] as const).map((key, index) => <label key={key}>{['X', 'Y', '크기 %', '방향 °'][index]}
                <CommitInput type="number" value={selected[key]} disabled={running} onCommit={(value) => editObject((current) => {
                  if (value.trim() && Number.isFinite(Number(value))) current[key] = key === 'size' ? Math.min(10000, Math.max(1, Number(value))) : Number(value);
                })} /></label>)}
              <label>모양<select value={selected.shape} disabled={running} onChange={(event) => editObject((current) => { current.shape = event.target.value; delete current.image; if (current.shape === 'text' && !current.text) current.text = '텍스트'; })}>
                <option value="circle">원</option><option value="square">사각형</option><option value="text">글자</option>
              </select></label>
              <label>이미지<button type="button" disabled={running} onClick={() => image.current?.click()}>이미지 선택</button></label>
              <input hidden type="file" ref={image} accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                const source = event.target.files?.[0];
                const sceneId = scene.id, objectId = selected.id;
                if (source && !['image/png', 'image/jpeg', 'image/webp'].includes(source.type)) setError('PNG, JPEG 또는 WebP 이미지를 선택하세요.');
                else if (source && source.size > 2 * 1024 * 1024) setError('이미지는 2MB 이하여야 합니다.');
                else if (source) {
                  const reader = new FileReader();
                  reader.onload = () => edit((draft) => {
                    const target = draft.scenes.find((s) => s.id === sceneId)?.objects.find((o) => o.id === objectId);
                    if (target) target.image = String(reader.result);
                  });
                  reader.onerror = () => setError('이미지를 읽지 못했습니다.');
                  reader.readAsDataURL(source);
                }
                event.target.value = '';
              }} />
              {selected.image && <label>이미지 삭제<button disabled={running} onClick={() => editObject((current) => { delete current.image; })}>이미지 지우기</button></label>}
              {selected.shape === 'text' && <>
                <label>표시 글자<CommitInput value={selected.text || ''} disabled={running} onCommit={(value) => editObject((current) => { current.text = value.slice(0, 8192); })} /></label>
                <label>글자 크기<CommitInput type="number" min="8" max="200" value={selected.fontSize || 24} disabled={running} onCommit={(value) => editObject((current) => { current.fontSize = Math.min(200, Math.max(8, Number(value) || 24)); })} /></label>
              </>}
              <label>색상<input type="color" value={selected.color} disabled={running} onChange={(event) => editObject((current) => { current.color = event.target.value; })} /></label>
              <label className="inline"><input type="checkbox" checked={selected.visible} disabled={running} onChange={(event) => editObject((current) => { current.visible = event.target.checked; })} /> 보이기</label>
              <label className="inline"><input type="checkbox" checked={selected.physics} disabled={running} onChange={(event) => editObject((current) => { current.physics = event.target.checked; current.vx = 0; current.vy = 0; })} /> 물리 사용</label>
              <label>속도 X<CommitInput type="number" value={selected.vx} disabled={running} onCommit={(value) => editObject((current) => { current.vx = numericValue(value, current.vx); })} /></label>
              <label>속도 Y<CommitInput type="number" value={selected.vy} disabled={running} onCommit={(value) => editObject((current) => { current.vy = numericValue(value, current.vy); })} /></label>
              <label>튕김<CommitInput type="number" min="0" max="1" step="0.1" value={selected.bounce} disabled={running} onCommit={(value) => editObject((current) => { current.bounce = numericValue(value, current.bounce, 0, 1); })} /></label>
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
