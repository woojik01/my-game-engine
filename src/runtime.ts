import * as Blockly from 'blockly';
import './blocks';
import { example } from './blocks';

export type Camera = { x: number; y: number; zoom: number; followId?: string };
export type Resolution = { width: number; height: number };
export type SoundAsset = { id: string; name: string; dataUrl: string };
export type Obj = {
  id: string; name: string; x: number; y: number; size: number; direction: number;
  visible: boolean; shape: string; color: string; image?: string; code: any;
  physics: boolean; vx: number; vy: number; bounce: number;
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
    const camera = raw.camera || {};
    return {
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : '장면 ' + (index + 1),
      background: typeof raw.background === 'string' ? raw.background : '#eef5ff',
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
  if (!scenes.some((scene) => scene.id === input.sceneId)) throw new Error('현재 장면을 찾을 수 없습니다.');
  const currentScene = scenes.find((scene) => scene.id === input.sceneId)!;
  const selectedId = currentScene.objects.some((item) => item.id === input.selectedId)
    ? input.selectedId
    : currentScene.objects[0].id;
  const sounds: SoundAsset[] = [];
  let soundBytes = 0;
  for (const sound of Array.isArray(input.sounds) ? input.sounds : []) {
    if (!sound || typeof sound.id !== 'string' || typeof sound.name !== 'string' ||
        typeof sound.dataUrl !== 'string' || !/^data:audio\/[^;,]+;base64,/i.test(sound.dataUrl)) continue;
    const bytes = Math.floor(sound.dataUrl.length * 0.75);
    if (bytes > 20 * 1024 * 1024 - soundBytes) continue;
    soundBytes += bytes;
    sounds.push(sound);
    if (sounds.length === 32) break;
  }
  return {
    version: 3, name: input.name, scenes, sceneId: input.sceneId,
    selectedId, resolution,
    sounds,
  };
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const keyAliases: Record<string, string> = {
  Right: 'ArrowRight', Left: 'ArrowLeft', Up: 'ArrowUp', Down: 'ArrowDown',
  Space: ' ', Spacebar: ' ',
};
export const normalizeKeyboardKey = (key: string) => keyAliases[key] || (key.length === 1 ? key.toLowerCase() : key);
type EngineOptions = {
  scenes?: Scene[]; sceneId?: string; gravity?: number; camera?: Camera; resolution?: Resolution;
  sounds?: SoundAsset[]; onSceneChange?: (scene: Scene) => void;
  gamepadSource?: () => ArrayLike<Gamepad | null>;
};

export class Engine {
  active = true;
  keys = new Set<string>();
  mouse = false;
  vars: Record<string, any> = Object.create(null);
  workspaces = new Map<string, Blockly.Workspace>();
  procedures = new Map<string, Map<string, any>>();
  sceneId: string;
  gravity: number;
  camera: Camera;
  resolution: Resolution;
  sounds: SoundAsset[];
  scenes: Scene[];
  private epoch = 0;
  private onError: (message: string) => void;
  private onSceneChange?: EngineOptions['onSceneChange'];
  private gamepadSource: NonNullable<EngineOptions['gamepadSource']>;
  private audio = new Map<string, HTMLAudioElement>();

  constructor(public objects: Obj[], onError: (message: string) => void, options: EngineOptions = {}) {
    this.onError = onError;
    this.scenes = options.scenes || [];
    this.sceneId = options.sceneId || this.scenes[0]?.id || '';
    const scene = this.scenes.find((item) => item.id === this.sceneId);
    this.gravity = options.gravity ?? scene?.gravity ?? 420;
    this.camera = { ...(options.camera || scene?.camera || { x: 0, y: 0, zoom: 1 }) };
    this.resolution = { ...(options.resolution || DEFAULT_RESOLUTION) };
    this.sounds = options.sounds || [];
    this.onSceneChange = options.onSceneChange;
    this.gamepadSource = options.gamepadSource || (() => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
      return navigator.getGamepads();
    });
  }

  stop() {
    this.active = false;
    this.epoch++;
    this.workspaces.forEach((workspace) => workspace.dispose());
    this.workspaces.clear();
    this.procedures.clear();
    this.keys.clear();
    this.audio.forEach((audio) => { audio.pause(); audio.currentTime = 0; });
  }

  async start() {
    await this.loadSceneWorkspaces();
  }

  private async loadSceneWorkspaces() {
    const epoch = this.epoch;
    this.workspaces.forEach((workspace) => workspace.dispose());
    this.workspaces.clear();
    this.procedures.clear();
    for (const obj of this.objects) {
      const workspace = new Blockly.Workspace();
      try {
        Blockly.serialization.workspaces.load(obj.code || {}, workspace);
        this.workspaces.set(obj.id, workspace);
        const definitions = new Map<string, any>();
        workspace.getBlocksByType('procedures_defnoreturn', false).forEach((block) => {
          definitions.set(block.getFieldValue('NAME'), block);
        });
        this.procedures.set(obj.id, definitions);
      } catch (error) {
        workspace.dispose();
        this.onError(obj.name + '의 블록을 읽지 못했습니다: ' + String(error));
      }
    }
    for (const obj of this.objects) {
      if (!this.active || epoch !== this.epoch) return;
      const workspace = this.workspaces.get(obj.id);
      if (!workspace) continue;
      for (const root of workspace.getTopBlocks(true)) {
        if (root.type === 'event_start') void this.launch(root.getNextBlock(), obj, epoch);
      }
    }
  }

  click(obj: Obj) {
    const workspace = this.workspaces.get(obj.id);
    if (!workspace) return;
    for (const root of workspace.getTopBlocks(true)) {
      if (root.type === 'event_click') void this.launch(root.getNextBlock(), obj, this.epoch);
    }
  }

  private async launch(block: any, obj: Obj, epoch: number, depth = 0) {
    try {
      await this.run(block, obj, epoch, depth);
    } catch (error) {
      if (this.active && epoch === this.epoch) {
        this.onError(obj.name + ': ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  }

  private val(block: any, obj: Obj, name: string, fallback: any = 0) {
    const child = block.getInputTargetBlock(name);
    return child ? this.eval(child, obj) : fallback;
  }

  eval(block: any, obj: Obj): any {
    const value = (name: string, fallback: any = 0) => this.val(block, obj, name, fallback);
    const field = (name: string) => block.getFieldValue(name);
    switch (block.type) {
      case 'math_number': return Number(field('NUM'));
      case 'logic_boolean': return field('BOOL') === 'TRUE';
      case 'key_pressed': return this.keys.has(field('KEY'));
      case 'gamepad_pressed': return this.keys.has('Gamepad:' + field('BUTTON'));
      case 'mouse_pressed': return this.mouse;
      case 'touching':
        return this.objects.some((target) => target !== obj && target.visible && obj.visible &&
          Math.abs(target.x - obj.x) < (target.size + obj.size) * 0.3 &&
          Math.abs(target.y - obj.y) < (target.size + obj.size) * 0.3);
      case 'variables_get': return this.vars[field('VAR')] ?? 0;
      case 'logic_negate': return !value('BOOL');
      case 'logic_operation': return field('OP') === 'AND' ? value('A') && value('B') : value('A') || value('B');
      case 'logic_compare': {
        const a = value('A');
        const b = value('B');
        return ({ EQ: () => a == b, NEQ: () => a != b, LT: () => a < b, LTE: () => a <= b, GT: () => a > b, GTE: () => a >= b } as any)[field('OP')]?.() ?? false;
      }
      case 'math_arithmetic': {
        const a = Number(value('A'));
        const b = Number(value('B'));
        switch (field('OP')) {
          case 'ADD': return a + b;
          case 'MINUS': return a - b;
          case 'MULTIPLY': return a * b;
          case 'DIVIDE': if (b === 0) throw new Error('0으로 나눌 수 없습니다.'); return a / b;
          case 'POWER': return a ** b;
          default: return 0;
        }
      }
      case 'math_random_int': {
        let from = Math.ceil(Number(value('FROM')));
        let to = Math.floor(Number(value('TO')));
        if (to < from) [from, to] = [to, from];
        return Math.floor(Math.random() * (to - from + 1)) + from;
      }
      default: throw new Error('지원하지 않는 값 블록: ' + block.type);
    }
  }

  async run(block: any, obj: Obj, epoch = this.epoch, depth = 0): Promise<void> {
    if (depth > 32) throw new Error('사용자 블록 호출이 너무 깊습니다.');
    let count = 0;
    for (let current = block; current && this.active && epoch === this.epoch; current = current.getNextBlock()) {
      if (++count % 50 === 0) await frame();
      if (!this.active || epoch !== this.epoch) return;
      const value = (name: string, fallback: any = 0) => Number(this.val(current, obj, name, fallback));
      const field = (name: string) => current.getFieldValue(name);
      switch (current.type) {
        case 'forever':
          while (this.active && epoch === this.epoch) {
            await this.run(current.getInputTargetBlock('DO'), obj, epoch, depth);
            await frame();
          }
          return;
        case 'controls_repeat_ext':
          for (let i = 0, times = clamp(Math.floor(value('TIMES')), 0, 10000); i < times && this.active && epoch === this.epoch; i++) {
            await this.run(current.getInputTargetBlock('DO'), obj, epoch, depth);
            if (i % 30 === 0) await frame();
          }
          break;
        case 'controls_if': {
          let done = false;
          for (let i = 0; current.getInput('IF' + i); i++) {
            if (this.val(current, obj, 'IF' + i, false)) {
              await this.run(current.getInputTargetBlock('DO' + i), obj, epoch, depth);
              done = true;
              break;
            }
          }
          if (!done && current.getInput('ELSE')) await this.run(current.getInputTargetBlock('ELSE'), obj, epoch, depth);
          break;
        }
        case 'wait_seconds': {
          const end = performance.now() + clamp(value('N'), 0, 3600) * 1000;
          while (this.active && epoch === this.epoch && performance.now() < end) await frame();
          break;
        }
        case 'move_steps': {
          const distance = value('N');
          obj.x += Math.sin(obj.direction * Math.PI / 180) * distance;
          obj.y += Math.cos(obj.direction * Math.PI / 180) * distance;
          break;
        }
        case 'change_x': obj.x += value('N'); break;
        case 'change_y': obj.y += value('N'); break;
        case 'goto_xy': obj.x = value('X'); obj.y = value('Y'); break;
        case 'direction': obj.direction = value('N'); break;
        case 'turn': obj.direction += value('N'); break;
        case 'show_obj': obj.visible = true; break;
        case 'hide_obj': obj.visible = false; break;
        case 'set_size': obj.size = Math.max(1, value('N')); break;
        case 'change_size': obj.size = Math.max(1, obj.size + value('N')); break;
        case 'physics_enable': obj.physics = true; break;
        case 'physics_disable': obj.physics = false; obj.vx = 0; obj.vy = 0; break;
        case 'velocity_set': obj.vx = value('X'); obj.vy = value('Y'); break;
        case 'impulse': obj.vx += value('X'); obj.vy += value('Y'); break;
        case 'camera_set': this.camera.x = value('X'); this.camera.y = value('Y'); this.camera.followId = undefined; break;
        case 'camera_zoom': this.camera.zoom = clamp(value('N', 1), 0.25, 3); break;
        case 'camera_follow': {
          const target = this.objects.find((item) => item.id === field('TARGET') || item.name === field('TARGET'));
          if (target) this.camera.followId = target.id;
          break;
        }
        case 'switch_scene':
          await this.switchScene(field('NAME'));
          return;
        case 'play_sound':
          this.playSound(field('SOUND'));
          break;
        case 'procedures_callnoreturn': {
          const definition = this.procedures.get(obj.id)?.get(field('NAME'));
          if (!definition) throw new Error("사용자 블록 '" + field('NAME') + "'을(를) 찾을 수 없습니다.");
          await this.run(definition.getInputTargetBlock('STACK'), obj, epoch, depth + 1);
          break;
        }
        case 'procedures_defnoreturn':
          break;
        default:
          throw new Error('지원하지 않는 명령 블록: ' + current.type);
      }
    }
  }

  private async switchScene(name: string) {
    const target = this.scenes.find((item) => item.id === name || item.name === name);
    if (!target) {
      this.onError("'" + name + "' 장면을 찾을 수 없습니다. 장면 이름을 확인하세요.");
      return;
    }
    this.epoch++;
    this.sceneId = target.id;
    this.objects = structuredClone(target.objects);
    this.gravity = target.gravity;
    this.camera = { ...target.camera };
    this.onSceneChange?.({ ...target, objects: this.objects, camera: this.camera });
    await this.loadSceneWorkspaces();
  }

  private playSound(name: string) {
    const asset = this.sounds.find((item) => item.name === name || item.id === name);
    if (asset && typeof Audio !== 'undefined') {
      try {
        let audio = this.audio.get(asset.id);
        if (!audio) {
          audio = new Audio(asset.dataUrl);
          this.audio.set(asset.id, audio);
        }
        audio.currentTime = 0;
        void audio.play().catch(() => this.onError('소리를 재생할 수 없습니다. 페이지에서 한 번 소리를 눌러 보세요.'));
        return;
      } catch {
        this.onError('소리 파일을 재생할 수 없습니다.');
        return;
      }
    }
    if (typeof AudioContext !== 'undefined') {
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
      } catch {
        // No audio device is a nonfatal limitation.
      }
    }
  }

  setGamepadButtons(buttons: string[]) {
    for (const name of ['A', 'B', 'X', 'Y', 'L1', 'R1', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT']) {
      const key = 'Gamepad:' + name;
      if (buttons.includes(name)) this.keys.add(key);
      else this.keys.delete(key);
    }
  }

  private pollGamepad() {
    let pad: Gamepad | null | undefined;
    try { pad = Array.from(this.gamepadSource()).find(Boolean); } catch { return; }
    if (!pad) {
      this.setGamepadButtons([]);
      return;
    }
    const pressed = new Set<string>();
    const buttons: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
    for (const [name, index] of Object.entries(buttons)) if (pad.buttons[index]?.pressed) pressed.add(name);
    if ((pad.axes[0] || 0) < -0.55) pressed.add('LEFT');
    if ((pad.axes[0] || 0) > 0.55) pressed.add('RIGHT');
    if ((pad.axes[1] || 0) < -0.55) pressed.add('UP');
    if ((pad.axes[1] || 0) > 0.55) pressed.add('DOWN');
    this.setGamepadButtons([...pressed]);
  }

  update(deltaSeconds = 1 / 60) {
    if (!this.active) return;
    this.pollGamepad();
    const dt = clamp(deltaSeconds, 0, 0.05);
    for (const obj of this.objects) {
      if (!obj.physics || !obj.visible) continue;
      const radius = Math.max(1, 30 * obj.size / 100);
      obj.vy -= this.gravity * dt;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      const halfWidth = this.resolution.width / 2;
      const halfHeight = this.resolution.height / 2;
      obj.x = clamp(obj.x, -halfWidth + radius, halfWidth - radius);
      if (obj.x === -halfWidth + radius || obj.x === halfWidth - radius) obj.vx *= -obj.bounce;
      if (obj.y < -halfHeight + radius) {
        obj.y = -halfHeight + radius;
        obj.vy = obj.vy < -28 ? -obj.vy * obj.bounce : 0;
      }
      if (obj.y > halfHeight - radius) {
        obj.y = halfHeight - radius;
        obj.vy = obj.vy > 28 ? -obj.vy * obj.bounce : 0;
      }
      this.collideWithObjects(obj, radius);
    }
    const followed = this.camera.followId && this.objects.find((item) => item.id === this.camera.followId);
    if (followed) {
      this.camera.x = followed.x;
      this.camera.y = followed.y;
    }
  }

  private collideWithObjects(obj: Obj, radius: number) {
    for (const other of this.objects) {
      if (other === obj || !other.visible) continue;
      const otherRadius = Math.max(1, 30 * other.size / 100);
      const overlapX = radius + otherRadius - Math.abs(obj.x - other.x);
      const overlapY = radius + otherRadius - Math.abs(obj.y - other.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX < overlapY) {
        const direction = Math.sign(obj.x - other.x || 1);
        obj.x += direction * overlapX;
        obj.vx = direction * Math.abs(obj.vx) * obj.bounce;
      } else {
        const direction = Math.sign(obj.y - other.y || 1);
        obj.y += direction * overlapY;
        obj.vy = direction > 0 ? Math.max(0, obj.vy) : obj.vy < -28 ? -obj.vy * obj.bounce : 0;
      }
    }
  }
}
