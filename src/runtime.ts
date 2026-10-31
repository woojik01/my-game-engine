import * as Blockly from 'blockly';
import './blocks';
import { example } from './blocks';

export type Camera = { x: number; y: number; zoom: number; followId?: string };
export type TileMap = { columns: number; rows: number; tileSize: number; palette: string[]; tiles: Array<Array<number | null>> };
export type SoundAsset = { id: string; name: string; dataUrl: string };
export type Obj = {
  id: string; name: string; x: number; y: number; size: number; direction: number;
  visible: boolean; shape: string; color: string; image?: string; code: any;
  physics: boolean; vx: number; vy: number; bounce: number;
};
export type Scene = {
  id: string; name: string; background: string; objects: Obj[];
  gravity: number; camera: Camera; tilemap: TileMap;
};
export type Project = {
  version: number; name: string; scenes: Scene[]; sceneId: string; selectedId: string; sounds: SoundAsset[];
};

export const uid = () => crypto.randomUUID();
export const TILE_PALETTE = ['#3978c6', '#68a9e8', '#74b987', '#dba552', '#8266bd'];
export const blankTileMap = (): TileMap => ({
  columns: 15, rows: 11, tileSize: 32, palette: [...TILE_PALETTE],
  tiles: Array.from({ length: 11 }, () => Array<number | null>(15).fill(null)),
});
export const object = (name = '오브젝트'): Obj => ({
  id: uid(), name, x: 0, y: 0, size: 100, direction: 90, visible: true,
  shape: 'circle', color: '#4b87ef', code: {}, physics: false, vx: 0, vy: 0, bounce: 0.2,
});
const makeScene = (name = '장면 1'): Scene => ({
  id: uid(), name, background: '#eef5ff', objects: [object(name === '장면 1' ? '플레이어' : '오브젝트 1')],
  gravity: 420, camera: { x: 0, y: 0, zoom: 1 }, tilemap: blankTileMap(),
});
export function newProject(withExample = false): Project {
  const scene = makeScene();
  if (withExample) scene.objects[0].code = structuredClone(example);
  return {
    version: 2, name: withExample ? '첫 번째 게임' : '새 프로젝트',
    scenes: [scene], sceneId: scene.id, selectedId: scene.objects[0].id, sounds: [],
  };
}

/** Upgrade v1 projects while keeping existing scenes, objects, and blocks. */
export function normalizeProject(input: any): Project {
  if (!input || ![1, 2].includes(input.version) || typeof input.name !== 'string' ||
      !Array.isArray(input.scenes) || !input.scenes.length) {
    throw new Error('지원하지 않는 프로젝트 형식입니다.');
  }
  const scenes: Scene[] = input.scenes.map((raw: any, index: number) => {
    if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.objects)) {
      throw new Error('장면 또는 오브젝트 데이터가 올바르지 않습니다.');
    }
    if (!raw.objects.length) throw new Error('장면마다 오브젝트가 하나 이상 있어야 합니다.');
    const objects: Obj[] = raw.objects.map((o: any) => {
      if (!o || typeof o.id !== 'string' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) {
        throw new Error('오브젝트 데이터가 올바르지 않습니다.');
      }
      return {
        ...o,
        name: typeof o.name === 'string' ? o.name : '오브젝트',
        size: Number.isFinite(o.size) ? o.size : 100,
        direction: Number.isFinite(o.direction) ? o.direction : 90,
        visible: o.visible !== false,
        shape: typeof o.shape === 'string' ? o.shape : 'circle',
        color: typeof o.color === 'string' ? o.color : '#4b87ef',
        code: o.code && typeof o.code === 'object' ? o.code : {},
        physics: Boolean(o.physics),
        vx: Number.isFinite(o.vx) ? o.vx : 0,
        vy: Number.isFinite(o.vy) ? o.vy : 0,
        bounce: Number.isFinite(o.bounce) ? Math.min(1, Math.max(0, o.bounce)) : 0.2,
      };
    });
    const map = raw.tilemap;
    const defaults = blankTileMap();
    const columns = Number.isInteger(map?.columns) ? Math.min(60, Math.max(1, map.columns)) : defaults.columns;
    const rows = Number.isInteger(map?.rows) ? Math.min(40, Math.max(1, map.rows)) : defaults.rows;
    const palette = Array.isArray(map?.palette)
      ? map.palette.filter((color: any) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 16)
      : [];
    const tilemap: TileMap = {
      columns, rows,
      tileSize: Number.isFinite(map?.tileSize) ? Math.min(96, Math.max(8, map.tileSize)) : defaults.tileSize,
      palette: palette.length ? palette : defaults.palette,
      tiles: Array.from({ length: rows }, (_, y) =>
        Array.from({ length: columns }, (_, x) => {
          const cell = map?.tiles?.[y]?.[x];
          return Number.isInteger(cell) && cell >= 0 && cell < (palette.length || defaults.palette.length) ? cell : null;
        }),
      ),
    };
    const camera = raw.camera || {};
    return {
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : '장면 ' + (index + 1),
      background: typeof raw.background === 'string' ? raw.background : '#eef5ff',
      objects,
      gravity: Number.isFinite(raw.gravity) ? Math.min(2000, Math.max(0, raw.gravity)) : 420,
    