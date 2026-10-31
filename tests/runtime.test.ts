import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import { exportHtml } from '../src/exportHtml';
import { Engine, newProject, normalizeKeyboardKey, normalizeProject, object } from '../src/runtime';

(globalThis as any).requestAnimationFrame = (callback: () => void) => setTimeout(callback, 1);
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
const errors: string[] = [];

assert.equal(normalizeKeyboardKey('Right'), 'ArrowRight');
assert.equal(normalizeKeyboardKey('Space'), ' ');
assert.equal(normalizeKeyboardKey('A'), 'a');

const project = newProject(true);
const player = project.scenes[0].objects[0];
const original = structuredClone(player);
const engine = new Engine([player], (message) => errors.push(message));
await engine.start();
engine.keys.add('ArrowRight');
await wait(45);
engine.keys.clear();
assert.ok(player.x > 0, 'the sample project responds to the right key');
assert.equal(original.x, 0, 'running state is isolated from editor data');
engine.stop();
assert.equal(errors.length, 0);

const workspace = new Blockly.Workspace();
Blockly.serialization.workspaces.load(original.code, workspace);
const serialized = Blockly.serialization.workspaces.save(workspace);
const restored = new Blockly.Workspace();
Blockly.serialization.workspaces.load(serialized, restored);
assert.equal(restored.getTopBlocks(false)[0].type, 'event_start');

const conditional = object();
conditional.code = { blocks: { languageVersion: 0, blocks: [{
  type: 'event_start',
  next: { block: { type: 'controls_repeat_ext', inputs: {
    TIMES: number(3),
    DO: { block: { type: 'controls_if', inputs: {
      IF0: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } },
      DO0: { block: { type: 'change_x', inputs: { N: number(5) } } },
    } } },
  } } },
}] } };
const conditionalEngine = new Engine([conditional], (message) => errors.push(message));
await conditionalEngine.start();
await wait(40);
assert.equal(conditional.x, 15, 'repeat and if blocks execute in order');
conditionalEngine.stop();

const custom = object();
custom.code = { blocks: { languageVersion: 0, blocks: [
  { type: 'procedures_defnoreturn', fields: { NAME: '조금 이동' }, inputs: {
    STACK: { block: { type: 'change_x', inputs: { N: number(9) } } },
  } },
  { type: 'event_start', next: { block: {
    type: 'procedures_callnoreturn', extraState: { name: '조금 이동', params: [] },
  } } },
] } };
const customEngine = new Engine([custom], (message) => errors.push(message));
await customEngine.start();
await wait(20);
assert.equal(custom.x, 9, 'a Blockly custom procedure call executes its definition');
customEngine.stop();

const clickable = object('클릭 오브젝트');
clickable.code = { blocks: { languageVersion: 0, blocks: [{
  type: 'event_click',
  next: { block: { type: 'change_x', inputs: { N: number(7) } } },
}] } };
const broken = object('손상된 오브젝트');
broken.code = { blocks: { languageVersion: 0, blocks: [{ type: 'not_registered' }] } };
const clickErrors: string[] = [];
const clickEngine = new Engine([broken, clickable], (message) => clickErrors.push(message));
await clickEngine.start();
clickEngine.click(clickable);
await wait(20);
assert.equal(clickable.x, 7, 'click events use the clicked object workspace');
assert.equal(clickErrors.length, 1, 'invalid blocks are reported without blocking other objects');
clickEngine.stop();

const migrated = structuredClone(project) as any;
migrated.version = 1;
delete migrated.scenes[0].gravity;
delete migrated.scenes[0].camera;
delete migrated.scenes[0].tilemap;
delete migrated.scenes[0].objects[0].physics;
delete migrated.scenes[0].objects[0].vx;
delete migrated.scenes[0].objects[0].vy;
const upgraded = normalizeProject(migrated);
assert.equal(upgraded.version, 2);
assert.equal(upgraded.scenes[0].objects[0].id, player.id);
assert.equal(upgraded.scenes[0].objects[0].physics, false);
assert.equal(upgraded.scenes[0].tilemap.tiles.length, 11);

const falling = object('물리 오브젝트');
falling.physics = true;
falling.y = -140;
falling.vy = -120;
const physicsEngine = new Engine([falling], (message) => errors.push(message), { gamepadSource: () => [] });
for (let i = 0; i < 24; i++) physicsEngine.update(1 / 60);
assert.ok(falling.y >= -150, 'gravity collides with the stage floor');
assert.equal(falling.vy, 0, 'small floor impacts settle instead of falling through');

const platform = object('타일 위 오브젝트');
platform.physics = true;
platform.y = 80;
const sceneWithTiles = newProject().scenes[0];
sceneWithTiles.tilemap.tiles[5][7] = 0;
const tileEngine = new Engine([platform], (message) => errors.push(message), {
  tilemap: sceneWithTiles.tilemap, gravity: sceneWithTiles.gravity, gamepadSource: () => [],
});
for (let i = 0; i < 120; i++) tileEngine.update(1 / 60);
assert.ok(platform.y >= 45 && platform.y < 50, 'physical objects land on painted solid tiles');
physicsEngine.stop();
tileEngine.stop();

const pad = {
  buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 0 })),
  axes: [0, 0],
} as unknown as Gamepad;
const gamepadObj = object();
const gamepadEngine = new Engine([gamepadObj], (message) => errors.push(message), { gamepadSource: () => [pad] });
gamepadEngine.update();
assert.equal(gamepadEngine.keys.has('Gamepad:A'), true, 'gamepad buttons are polled into block input state');
const padBlock = { type: 'gamepad_pressed', getFieldValue: () => 'A', getInputTargetBlock: () => null };
assert.equal(gamepadEngine.eval(padBlock, gamepadObj), true, 'the gamepad condition block reads the active button');
gamepadEngine.stop();

const sceneA = newProject().scenes[0];
sceneA.name = '장면 1';
sceneA.objects[0].code = { blocks: { languageVersion: 0, blocks: [{
  type: 'event_start',
  next: { block: { type: 'switch_scene', fields: { NAME: '장면 2' } } },
}] } };
const sceneB = newProject().scenes[0];
sceneB.name = '장면 2';
sceneB.objects[0].code = { blocks: { languageVersion: 0, blocks: [{
  type: 'event_start',
  next: { block: { type: 'camera_set', inputs: { X: number(24), Y: number(-12) }, next: {
    block: { type: 'camera_zoom', inputs: { N: number(1.5) }, next: {
      block: { type: 'change_x', inputs: { N: number(6) } },
    } },
  } } },
}] } };
let activeScene = '';
const sceneEngine = new Engine(structuredClone(sceneA.objects), (message) => errors.push(message), {
  scenes: [sceneA, sceneB], sceneId: sceneA.id,
  onSceneChange: (current) => { activeScene = current.id; },
  gamepadSource: () => [],
});
await sceneEngine.start();
await wait(35);
assert.equal(sceneEngine.sceneId, sceneB.id, 'scene switch block selects another saved scene');
assert.equal(activeScene, sceneB.id);
assert.equal(sceneEngine.camera.x, 24, 'camera position blocks update the runtime camera');
assert.equal(sceneEngine.camera.y, -12);
assert.equal(sceneEngine.camera.zoom, 1.5);
assert.equal(sceneEngine.objects[0].x, 6, 'new scene start blocks run after switching');
sceneEngine.stop();

const html = exportHtml(project);
const exportedScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(exportedScript, 'HTML export includes a playable script');
assert.doesNotThrow(() => new Function(exportedScript), 'exported game script parses as JavaScript');
assert.ok(html.includes('id="game"') && html.includes('project-data'), 'export includes a canvas and embedded project');
assert.equal(errors.length, 0, errors.join('\n'));
workspace.dispose();
restored.dispose();
console.log('PASS: movement, Blockly roundtrip, repeat/conditions, custom blocks, click events, v1 migration, physics, tiles, gamepad, camera, scenes, and HTML export');
