// This factory has no module dependencies: the editor and exported HTML use it.
export function engineFactory() {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const frame = () => new Promise((resolve) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(resolve) : setTimeout(resolve, 16));
  const normalizeKey = (key) => ({ Right: 'ArrowRight', Left: 'ArrowLeft', Up: 'ArrowUp', Down: 'ArrowDown', Space: ' ', Spacebar: ' ' })[key] || (key.length === 1 ? key.toLowerCase() : key);
  const input = (b, name) => b?.getInputTargetBlock ? b.getInputTargetBlock(name) : b?.inputs?.[name]?.block || b?.inputs?.[name]?.shadow || null;
  const next = (b) => b?.getNextBlock ? b.getNextBlock() : b?.next?.block || null;
  const field = (b, name) => {
    const value = b?.getFieldValue ? b.getFieldValue(name) : b?.fields?.[name];
    return value && typeof value === 'object' ? value.id || value.name : value;
  };
  const disabled = (b) => b.enabled === false || b.disabled === true || b.disabledReasons?.length > 0;
  const procedureName = (b) => field(b, 'NAME') || b.extraState?.name || '';
  const supported = new Set([
    'event_start', 'event_click', 'forever', 'wait_seconds', 'controls_repeat_ext', 'controls_if', 'stop_game',
    'move_steps', 'change_x', 'change_y', 'goto_xy', 'direction', 'turn', 'show_obj', 'hide_obj', 'set_size', 'change_size', 'set_text',
    'physics_enable', 'physics_disable', 'velocity_set', 'impulse', 'camera_set', 'camera_zoom', 'camera_follow', 'switch_scene', 'play_sound',
    'math_number', 'math_arithmetic', 'math_random_int', 'math_change', 'variables_get', 'variables_set', 'text', 'text_join',
    'logic_boolean', 'logic_negate', 'logic_operation', 'logic_compare', 'key_pressed', 'gamepad_pressed', 'mouse_pressed',
    'touching', 'touching_target', 'pointer_position', 'object_property', 'stage_size', 'elapsed_time',
    'procedures_defnoreturn', 'procedures_callnoreturn',
  ]);
  function validate(block) {
    if (!block) return;
    if (!disabled(block)) {
      if (!supported.has(block.type)) throw new Error('지원하지 않는 블록: ' + block.type);
      for (const value of Object.values(block.inputs || {})) validate(value.block || value.shadow);
    }
    validate(next(block));
  }
  class Engine {
    constructor(objects, onError = () => {}, options = {}) {
      this.objects = objects;
      this.onError = onError;
      this.scenes = options.scenes || [];
      this.sceneId = options.sceneId || this.scenes[0]?.id || '';
      const scene = this.scenes.find((s) => s.id === this.sceneId);
      this.gravity = options.gravity ?? scene?.gravity ?? 420;
      this.camera = { ...(options.camera || scene?.camera || { x: 0, y: 0, zoom: 1 }) };
      this.resolution = { ...(options.resolution || { width: 480, height: 360 }) };
      this.sounds = options.sounds || [];
      this.onSceneChange = options.onSceneChange;
      this.gamepadSource = options.gamepadSource || (() => typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);
      this.active = true;
      this.keys = new Set();
      this.mouse = false;
      this.pointerX = 0;
      this.pointerY = 0;
      this.elapsed = 0;
      this.vars = Object.create(null);
      this.workspaces = new Map();
      this.procedures = new Map();
      this.variableNames = new Map();
      this.audio = new Map();
      this.pendingAudio = new Set();
      this.epoch = 0;
    }
    async start() {
      this.active = true;
      this.elapsed = 0;
      this.vars = Object.create(null);
      this.epoch++;
      this.loadSceneWorkspaces();
    }
    stop() {
      this.active = false;
      this.epoch++;
      this.keys.clear();
      this.mouse = false;
      this.pendingAudio.clear();
      for (const audio of this.audio.values()) { audio.pause(); audio.currentTime = 0; }
      if (this.audioContext) { void this.audioContext.close(); this.audioContext = null; }
    }
    loadSceneWorkspaces() {
      const epoch = this.epoch;
      this.workspaces.clear();
      this.procedures.clear();
      this.variableNames.clear();
      for (const obj of this.objects) {
        try {
          const blocks = obj.code?.blocks?.blocks || [];
          for (const root of blocks) validate(root);
          this.workspaces.set(obj.id, blocks);
          this.variableNames.set(obj.id, new Map((obj.code?.variables || []).map((v) => [v.id, v.name])));
          this.procedures.set(obj.id, new Map(blocks.filter((b) => b.type === 'procedures_defnoreturn' && !disabled(b)).map((b) => [procedureName(b), b])));
        } catch (error) { this.onError(obj.name + ': ' + error.message); }
      }
      for (const obj of this.objects) {
        for (const root of this.workspaces.get(obj.id) || []) {
          if (root.type === 'event_start' && !disabled(root)) {
            Promise.resolve().then(() => this.launch(next(root), obj, epoch));
          }
        }
      }
    }
    click(obj) {
      if (!this.active) return;
      for (const root of this.workspaces.get(obj.id) || []) {
        if (root.type === 'event_click' && !disabled(root)) void this.launch(next(root), obj, this.epoch);
      }
    }
    async launch(block, obj, epoch) {
      try { await this.run(block, obj, epoch); }
      catch (error) { if (this.active && epoch === this.epoch) this.onError(obj.name + ': ' + error.message); }
    }
    variableName(block, obj) {
      const id = field(block, 'VAR');
      return this.variableNames.get(obj.id)?.get(id) || id || '변수';
    }
    eval(block, obj, scope = Object.create(null)) {
      if (!block || disabled(block)) return 0;
      const value = (name, fallback = 0) => input(block, name) ? this.eval(input(block, name), obj, scope) : fallback;
      const f = (name) => field(block, name);
      switch (block.type) {
        case 'math_number': return Number(f('NUM'));
        case 'text': return String(f('TEXT') ?? '');
        case 'text_join': return Array.from({ length: Math.min(100, block.extraState?.itemCount ?? Object.keys(block.inputs || {}).filter((key) => key.startsWith('ADD')).length) }, (_, i) => String(value('ADD' + i, ''))).join('');
        case 'logic_boolean': return f('BOOL') === 'TRUE';
        case 'key_pressed': return this.keys.has(normalizeKey(f('KEY')));
        case 'gamepad_pressed': return this.keys.has('Gamepad:' + f('BUTTON'));
        case 'mouse_pressed': return this.mouse;
        case 'pointer_position': return f('AXIS') === 'Y' ? this.pointerY : this.pointerX;
        case 'object_property': return obj[f('PROPERTY')] ?? 0;
        case 'stage_size': return f('AXIS') === 'HEIGHT' ? this.resolution.height : this.resolution.width;
        case 'elapsed_time': return this.elapsed;
        case 'variables_get': { const name = this.variableName(block, obj); return name in scope ? scope[name] : this.vars[name] ?? 0; }
        case 'touching':
        case 'touching_target':
          return this.objects.some((target) => target !== obj && target.visible && obj.visible &&
            (block.type === 'touching' || target.id === f('TARGET') || target.name === f('TARGET')) &&
            Math.abs(target.x - obj.x) < (target.size + obj.size) * .3 && Math.abs(target.y - obj.y) < (target.size + obj.size) * .3);
        case 'logic_negate': return !value('BOOL');
        case 'logic_operation': return f('OP') === 'AND' ? value('A') && value('B') : value('A') || value('B');
        case 'logic_compare': {
          const a = value('A'), b = value('B');
          return ({ EQ: () => a == b, NEQ: () => a != b, LT: () => a < b, LTE: () => a <= b, GT: () => a > b, GTE: () => a >= b }[f('OP')] || (() => false))();
        }
        case 'math_arithmetic': {
          const a = Number(value('A')), b = Number(value('B'));
          switch (f('OP')) {
            case 'ADD': return a + b;
            case 'MINUS': return a - b;
            case 'MULTIPLY': return a * b;
            case 'DIVIDE': if (b === 0) throw new Error('0으로 나눌 수 없습니다.'); return a / b;
            case 'POWER': return a ** b;
            default: return 0;
          }
        }
        case 'math_random_int': {
          let a = Math.ceil(Number(value('FROM'))), b = Math.floor(Number(value('TO')));
          if (b < a) [a, b] = [b, a];
          return Math.floor(Math.random() * (b - a + 1)) + a;
        }
        default: throw new Error('지원하지 않는 값 블록: ' + block.type);
      }
    }
    async run(block, obj, epoch = this.epoch, depth = 0, scope = Object.create(null)) {
      if (depth > 32) throw new Error('사용자 블록 호출이 너무 깊습니다.');
      let count = 0;
      for (let b = block; b && this.active && epoch === this.epoch; b = next(b)) {
        if (++count % 50 === 0) await frame();
        if (!this.active || epoch !== this.epoch) return;
        if (disabled(b)) continue;
        const raw = (name, fallback = 0) => input(b, name) ? this.eval(input(b, name), obj, scope) : fallback;
        const value = (name, fallback = 0) => {
          const result = Number(raw(name, fallback));
          if (!Number.isFinite(result)) throw new Error('유효한 숫자가 필요합니다.');
          return result;
        };
        const f = (name) => field(b, name);
        switch (b.type) {
          case 'forever':
            while (this.active && epoch === this.epoch) { await this.run(input(b, 'DO'), obj, epoch, depth, scope); await frame(); }
            return;
          case 'controls_repeat_ext':
            for (let i = 0, n = clamp(Math.floor(value('TIMES')), 0, 10000); i < n && this.active && epoch === this.epoch; i++) {
              await this.run(input(b, 'DO'), obj, epoch, depth, scope);
              if (i % 30 === 0) await frame();
            }
            break;
          case 'controls_if': {
            let done = false;
            for (let i = 0; b.getInput ? b.getInput('IF' + i) : b.inputs?.['IF' + i]; i++) {
              if (raw('IF' + i, false)) { await this.run(input(b, 'DO' + i), obj, epoch, depth, scope); done = true; break; }
            }
            if (!done && input(b, 'ELSE')) await this.run(input(b, 'ELSE'), obj, epoch, depth, scope);
            break;
          }
          case 'wait_seconds': {
            const end = performance.now() + clamp(value('N'), 0, 3600) * 1000;
            while (this.active && epoch === this.epoch && performance.now() < end) await frame();
            break;
          }
          case 'move_steps': { const n = value('N'); obj.x += Math.sin(obj.direction * Math.PI / 180) * n; obj.y += Math.cos(obj.direction * Math.PI / 180) * n; break; }
          case 'change_x': obj.x += value('N'); break;
          case 'change_y': obj.y += value('N'); break;
          case 'goto_xy': obj.x = value('X'); obj.y = value('Y'); break;
          case 'direction': obj.direction = value('N'); break;
          case 'turn': obj.direction += value('N'); break;
          case 'show_obj': obj.visible = true; break;
          case 'hide_obj': obj.visible = false; break;
          case 'set_size': obj.size = clamp(value('N'), 1, 10000); break;
          case 'change_size': obj.size = clamp(obj.size + value('N'), 1, 10000); break;
          case 'set_text': obj.text = String(raw('TEXT', '')).slice(0, 8192); obj.shape = 'text'; delete obj.image; break;
          case 'variables_set':
          case 'math_change': {
            const name = this.variableName(b, obj), target = name in scope ? scope : this.vars;
            target[name] = b.type === 'math_change' ? (Number(target[name]) || 0) + value('DELTA') : raw('VALUE', 0);
            break;
          }
          case 'physics_enable': obj.physics = true; break;
          case 'physics_disable': obj.physics = false; obj.vx = 0; obj.vy = 0; break;
          case 'velocity_set': obj.vx = value('X'); obj.vy = value('Y'); break;
          case 'impulse': obj.vx += value('X'); obj.vy += value('Y'); break;
          case 'camera_set': this.camera.x = value('X'); this.camera.y = value('Y'); delete this.camera.followId; break;
          case 'camera_zoom': this.camera.zoom = clamp(value('N', 1), .25, 3); break;
          case 'camera_follow': {
            const target = this.objects.find((o) => o.id === f('TARGET') || o.name === f('TARGET'));
            if (!target) throw new Error('따라갈 오브젝트를 찾을 수 없습니다: ' + f('TARGET'));
            this.camera.followId = target.id; break;
          }
          case 'switch_scene': await this.switchScene(f('NAME')); return;
          case 'play_sound': this.playSound(f('SOUND')); break;
          case 'stop_game': this.stop(); return;
          case 'procedures_callnoreturn': {
            const name = procedureName(b), definition = this.procedures.get(obj.id)?.get(name);
            if (!definition) throw new Error('사용자 블록을 찾을 수 없습니다: ' + name);
            const local = Object.create(scope);
            const params = definition.extraState?.params || definition.arguments_ || [];
            params.forEach((param, i) => { local[typeof param === 'string' ? param : param.name] = raw('ARG' + i); });
            await this.run(input(definition, 'STACK'), obj, epoch, depth + 1, local);
            break;
          }
          case 'procedures_defnoreturn': break;
          default: throw new Error('지원하지 않는 명령 블록: ' + b.type);
        }
      }
    }
    async switchScene(name) {
      const target = this.scenes.find((s) => s.id === name || s.name === name);
      if (!target) throw new Error('장면을 찾을 수 없습니다: ' + name);
      this.epoch++;
      this.sceneId = target.id;
      this.objects = clone(target.objects);
      this.gravity = target.gravity;
      this.camera = { ...target.camera };
      this.onSceneChange?.({ ...target, objects: this.objects, camera: this.camera });
      const epoch = this.epoch;
      await frame();
      if (this.active && epoch === this.epoch) this.loadSceneWorkspaces();
    }
    playSound(name) {
      const asset = this.sounds.find((s) => s.id === name || s.name === name);
      if (asset && typeof Audio !== 'undefined') {
        let audio = this.audio.get(asset.id);
        if (!audio) { audio = new Audio(asset.dataUrl); this.audio.set(asset.id, audio); }
        audio.currentTime = 0;
        void audio.play().catch(() => this.pendingAudio.add(asset.id));
        return;
      }
      if (name && name !== '기본 효과음') { this.onError('소리 파일을 찾을 수 없습니다: ' + name); return; }
      if (typeof AudioContext !== 'undefined') {
        try {
          const context = this.audioContext ||= new AudioContext();
          void context.resume();
          const oscillator = context.createOscillator(), gain = context.createGain();
          gain.gain.value = .06;
          oscillator.frequency.value = 440;
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(); oscillator.stop(context.currentTime + .12);
        } catch { /* Audio device availability does not stop scripts. */ }
      }
    }
    unlockAudio() {
      if (!this.active) return;
      if (this.audioContext) void this.audioContext.resume();
      for (const id of this.pendingAudio) { this.pendingAudio.delete(id); this.playSound(id); }
    }
    setGamepadButtons(buttons) {
      for (const name of ['A', 'B', 'X', 'Y', 'L1', 'R1', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT']) {
        const key = 'Gamepad:' + name;
        if (buttons.includes(name)) this.keys.add(key); else this.keys.delete(key);
      }
    }
    pollGamepad() {
      let pad;
      try { pad = Array.from(this.gamepadSource()).find(Boolean); } catch { this.setGamepadButtons([]); return; }
      const pressed = new Set(), buttons = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
      if (pad) {
        for (const [name, i] of Object.entries(buttons)) if (pad.buttons[i]?.pressed) pressed.add(name);
        if ((pad.axes[0] || 0) < -.55) pressed.add('LEFT');
        if ((pad.axes[0] || 0) > .55) pressed.add('RIGHT');
        if ((pad.axes[1] || 0) < -.55) pressed.add('UP');
        if ((pad.axes[1] || 0) > .55) pressed.add('DOWN');
      }
      this.setGamepadButtons([...pressed]);
    }
    update(deltaSeconds = 1 / 60) {
      if (!this.active) return;
      this.pollGamepad();
      const dt = clamp(deltaSeconds, 0, .05);
      this.elapsed += dt;
      for (const obj of this.objects) {
        if (!obj.physics || !obj.visible) continue;
        const radius = Math.max(1, 30 * obj.size / 100);
        obj.vy -= this.gravity * dt; obj.x += obj.vx * dt; obj.y += obj.vy * dt;
        const maxX = Math.max(0, this.resolution.width / 2 - radius), maxY = Math.max(0, this.resolution.height / 2 - radius);
        if ((obj.x < -maxX && obj.vx < 0) || (obj.x > maxX && obj.vx > 0)) obj.vx *= -obj.bounce;
        obj.x = clamp(obj.x, -maxX, maxX);
        if (obj.y < -maxY) { obj.y = -maxY; obj.vy = obj.vy < -28 ? -obj.vy * obj.bounce : 0; }
        if (obj.y > maxY) { obj.y = maxY; obj.vy = obj.vy > 28 ? -obj.vy * obj.bounce : 0; }
        for (const other of this.objects) {
          if (other === obj || !other.visible) continue;
          const r = Math.max(1, 30 * other.size / 100), ox = radius + r - Math.abs(obj.x - other.x), oy = radius + r - Math.abs(obj.y - other.y);
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy) { const d = Math.sign(obj.x - other.x || 1); obj.x += d * ox; obj.vx = d * Math.abs(obj.vx) * obj.bounce; }
          else { const d = Math.sign(obj.y - other.y || 1); obj.y += d * oy; obj.vy = d > 0 ? Math.max(0, obj.vy) : obj.vy < -28 ? -obj.vy * obj.bounce : 0; }
        }
      }
      const followed = this.objects.find((o) => o.id === this.camera.followId);
      if (followed) { this.camera.x = followed.x; this.camera.y = followed.y; }
    }
  }
  return Engine;
}
