import { engineFactory } from './runtimeCore.js';
import { example } from './blocks';

export type Camera = { x: number; y: number; zoom: number; followId?: string };
export type Resolution = { width: number; height: number };
export type SoundAsset = { id: string; name: string; dataUrl: string };
export type Obj = {
  id: string; name: string; x: number; y: number; size: number; direction: number;
  visible: boolean; shape: string; color: string; image?: string; code: any;
  physics: boolean; vx: number; vy: number; bounce: number; text?: string; fontSize?: number;
};
export type Scene = {
  id: string; name: string; background: string; objects: Obj[];
  gravity: number; camera: Camera;
};
export type Project = {
  version: number; name: string; scenes: Scene[]; sceneId: string; selectedId: string;
  resolution: Resolution; sounds: SoundAsset[];
};

export const uid = () => crypto.randomUUID();
export const DEFAULT_RESOLUTION: Resolution = { width: 480, height: 360 };
export const object = (name = '오브젝트'): Obj => ({
  id: uid(), name, x: 0, y: 0, size: 100, direction: 90, visible: true,
  shape: 'circle', color: '#4b87ef', code: {}, physics: false, vx: 0, vy: 0, bounce: 0.2,
});
const makeScene = (name = '장면 1'): Scene => ({
  id: uid(), name, background: '#eef5ff', objects: [object(name === '장면 1' ? '플레이어' : '오브젝트 1')],
  gravity: 420, camera: { x: 0, y: 0, zoom: 1 },
});
export function newProject(withExample = false): Project {
  const scene = makeScene();
  if (withExample) scene.objects[0].code = structuredClone(example);
  return {
    version: 3, name: withExample ? '첫 번째 게임' : '새 프로젝트',
    scenes: [scene], sceneId: scene.id, selectedId: scene.objects[0].id,
    resolution: { ...DEFAULT_RESOLUTION }, sounds: [],
  };
}

/** Upgrade older projects while keeping scenes, objects, blocks, and resources. */
export function normalizeProject(input: any): Project {
  if (!input || ![1, 2, 3].includes(input.version) || typeof input.name !== 'string' ||
      !Array.isArray(input.scenes) || !input.scenes.length) {
    throw new Error('지원하지 않는 프로젝트 형식입니다.');
  }
  const resolution: Resolution = {
    width: Number.isFinite(input.resolution?.width) ? Math.min(3840, Math.max(240, Math.round(input.resolution.width))) : DEFAULT_RESOLUTION.width,
    height: Number.isFinite(input.resolution?.height) ? Math.min(2160, Math.max(240, Math.round(input.resolution.height))) : DEFAULT_RESOLUTION.height,
  };
  const sceneIds = new Set<string>(), objectIds = new Set<string>();
  const scenes: Scene[] = input.scenes.map((raw: any, index: number) => {
    if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.objects)) {
      throw new Error('장면 또는 오브젝트 데이터가 올바르지 않습니다.');
    }
    if (!raw.objects.length) throw new Error('장면마다 오브젝트가 하나 이상 있어야 합니다.');
    if (!raw.id || sceneIds.has(raw.id)) throw new Error('장면 ID가 중복되거나 비어 있습니다.');
    sceneIds.add(raw.id);
    const objects: Obj[] = raw.objects.map((o: any) => {
      if (!o || typeof o.id !== 'string' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) {
        throw new Error('오브젝트 데이터가 올바르지 않습니다.');
      }
      if (!o.id || objectIds.has(o.id)) throw new Error('오브젝트 ID가 중복되거나 비어 있습니다.');
      objectIds.add(o.id);
      if (o.image && (typeof o.image !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(o.image))) {
        throw new Error('이미지는 프로젝트 안에 포함된 PNG, JPEG 또는 WebP여야 합니다.');
      }
      return {
        ...o,
        name: typeof o.name === 'string' ? o.name : '오브젝트',
        size: Number.isFinite(o.size) ? Math.min(10000, Math.max(1, o.size)) : 100,
        direction: Number.isFinite(o.direction) ? o.direction : 90,
        visible: o.visible !== false,
        shape: ['circle', 'square', 'text'].includes(o.shape) ? o.shape : 'circle',
        color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#4b87ef',
        text: typeof o.text === 'string' ? o.text.slice(0, 8192) : '',
        fontSize: Number.isFinite(o.fontSize) ? Math.min(200, Math.max(8, o.fontSize)) : 24,
        code: o.code && typeof o.code === 'object' ? o.code : {},
        physics: Boolean(o.physics),
        vx: Number.isFinite(o.vx) ? o.vx : 0,
        vy: Number.isFinite(o.vy) ? o.vy : 0,
        bounce: Number.isFinite(o.bounce) ? Math.min(1, Math.max(0, o.bounce)) : 0.2,
      };
    });
    const camera = raw.camera || {};
    return {
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : '장면 ' + (index + 1),
      background: /^#[0-9a-f]{6}$/i.test(raw.background) ? raw.background : '#eef5ff',
      objects,
      gravity: Number.isFinite(raw.gravity) ? Math.min(2000, Math.max(0, raw.gravity)) : 420,
      camera: {
        x: Number.isFinite(camera.x) ? camera.x : 0,
        y: Number.isFinite(camera.y) ? camera.y : 0,
        zoom: Number.isFinite(camera.zoom) ? Math.min(3, Math.max(0.25, camera.zoom)) : 1,
        ...(typeof camera.followId === 'string' ? { followId: camera.followId } : {}),
      },
    };
  });
  const sceneId = scenes.some((scene) => scene.id === input.sceneId) ? input.sceneId : scenes[0].id;
  const currentScene = scenes.find((scene) => scene.id === sceneId)!;
  const selectedId = currentScene.objects.some((item) => item.id === input.selectedId)
    ? input.selectedId
    : currentScene.objects[0].id;
  const sounds: SoundAsset[] = [];
  let soundBytes = 0;
  for (const sound of Array.isArray(input.sounds) ? input.sounds : []) {
    if (!sound || typeof sound.id !== 'string' || typeof sound.name !== 'string' ||
        typeof sound.dataUrl !== 'string' || !/^data:audio\/[^;,]+;base64,/i.test(sound.dataUrl)) throw new Error('소리 파일 데이터가 올바르지 않습니다.');
    if (sounds.some((asset) => asset.id === sound.id)) throw new Error('소리 ID가 중복됩니다.');
    const payload = sound.dataUrl.slice(sound.dataUrl.indexOf(',') + 1);
    const bytes = Math.floor(payload.length * 0.75) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
    if (bytes > 20 * 1024 * 1024 - soundBytes) throw new Error('소리 리소스는 전체 20MB까지 불러올 수 있습니다.');
    soundBytes += bytes;
    sounds.push(sound);
    if (sounds.length > 32) throw new Error('소리 파일은 최대 32개까지 불러올 수 있습니다.');
  }
  return {
    version: 3, name: input.name, scenes, sceneId,
    selectedId, resolution,
    sounds,
  };
}

export { engineFactory } from './runtimeCore.js';
export const normalizeKeyboardKey = (key: string) =>
  ({ Right: 'ArrowRight', Left: 'ArrowLeft', Up: 'ArrowUp', Down: 'ArrowDown', Space: ' ', Spacebar: ' ' }[key] || (key.length === 1 ? key.toLowerCase() : key));
export const Engine = engineFactory();
export type Engine = InstanceType<typeof Engine>;
