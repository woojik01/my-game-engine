import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import { Engine, newProject, object } from '../src/runtime';
import { addProjectScene, deleteProjectScene, duplicateProjectScene, renameProjectScene, renameProjectObject, projectIssues, projectVariables, renameProjectVariable } from '../src/projectActions';

(globalThis as any).requestAnimationFrame = (callback: () => void) => setTimeout(callback, 1);
const number = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const project = newProject();
const firstId = project.sceneId;
assert.equal(deleteProjectScene(project, firstId), false, 'the last scene is preserved');
addProjectScene(project);
const second = project.scenes[1], secondId = second.id;
second.objects[0].code = { blocks: { blocks: [{ type: 'event_start', next: { block: { type: 'switch_scene', fields: { NAME: second.name } } } }] } };
second.camera.followId = second.objects[0].id;
renameProjectScene(project, secondId, '승리');
assert.equal(second.objects[0].code.blocks.blocks[0].next.block.fields.NAME, '승리', 'renaming keeps scene links');
duplicateProjectScene(project, secondId);
const copy = project.scenes[2];
assert.notEqual(copy.id, secondId);
assert.notEqual(copy.objects[0].id, second.objects[0].id);
assert.equal(copy.camera.followId, copy.objects[0].id, 'duplicate camera follows its copied object');
assert.equal(copy.objects[0].code.blocks.blocks[0].next.block.fields.NAME, copy.name, 'self scene links follow a copied scene');
assert.equal(projectIssues(project).length, 0);
assert.equal(deleteProjectScene(project, copy.id), true);
assert.equal(project.sceneId, secondId, 'deleting the selected last scene selects its neighbour');
assert.equal(project.selectedId, second.objects[0].id);
const target = object('적');
second.objects.push(target);
second.objects[0].code = { blocks: { blocks: [{ type: 'event_start', next: { block: { type: 'camera_follow', fields: { TARGET: '적' } } } }] } };
renameProjectObject(project, target.id, '적 변경');
assert.equal(second.objects[0].code.blocks.blocks[0].next.block.fields.TARGET, '적 변경');
assert.equal(projectIssues(project).length, 0);
deleteProjectScene(project, secondId);
assert.equal(project.sceneId, firstId);

const actor = object('점수');
// Blockly really serializes variable fields as IDs and procedure names in extraState.
const ws = new Blockly.Workspace();
Blockly.serialization.workspaces.load({
  variables: [{ name: '점수', id: 'score' }, { name: '증가량', id: 'amount' }],
  blocks: { languageVersion: 0, blocks: [
    { type: 'procedures_defnoreturn', fields: { NAME: '점수 추가' }, extraState: { params: [{ name: '증가량', id: 'amount' }] }, inputs: { STACK: { block: {
      type: 'math_change', fields: { VAR: { id: 'score' } }, inputs: { DELTA: { block: { type: 'variables_get', fields: { VAR: { id: 'amount' } } } } },
    } } } },
    { type: 'event_start', next: { block: { type: 'variables_set', fields: { VAR: { id: 'score' } }, inputs: { VALUE: number(10) }, next: { block: {
      type: 'procedures_callnoreturn', extraState: { name: '점수 추가', params: ['증가량'] }, inputs: { ARG0: number(5) }, next: { block: {
        type: 'set_text', inputs: { TEXT: { block: { type: 'text_join', extraState: { itemCount: 2 }, inputs: {
          ADD0: { block: { type: 'text', fields: { TEXT: '점수: ' } } },
          ADD1: { block: { type: 'variables_get', fields: { VAR: { id: 'score' } } } },
        } } } },
      } },
    } } } } },
  ] },
}, ws);
actor.code = Blockly.serialization.workspaces.save(ws);
ws.dispose();
const errors: string[] = [];
const engine = new Engine([actor], (message) => errors.push(message));
await engine.start();
await new Promise((resolve) => setTimeout(resolve, 30));
assert.deepEqual(errors, []);
assert.equal(engine.vars['점수'], 15, 'set, change, procedure arguments and variable IDs cooperate');
assert.equal(actor.text, '점수: 15');
assert.equal(actor.shape, 'text');
const reader = object('다른 오브젝트');
reader.code = { variables: [{ name: '점수', id: 'other-id' }], blocks: { blocks: [] } };
engine.stop();
const shared = new Engine([actor, reader], (message) => errors.push(message));
await shared.start();
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(shared.eval({ type: 'variables_get', fields: { VAR: { id: 'other-id' } } }, reader), 15, 'same variable names share values across objects');
shared.pointerX = 37; shared.pointerY = -21;
assert.equal(shared.eval({ type: 'pointer_position', fields: { AXIS: 'Y' } }, reader), -21);
await shared.run({ type: 'stop_game', next: { block: { type: 'change_x', inputs: { N: number(999) } } } }, reader);
assert.equal(reader.x, 0, 'stop prevents following commands');
shared.stop();
const disabledActor = object();
disabledActor.code = { blocks: { blocks: [{ type: 'event_start', next: { block: { type: 'change_x', disabledReasons: ['MANUALLY_DISABLED'], inputs: { N: number(99) }, next: { block: { type: 'change_y', inputs: { N: number(7) } } } } } }] } };
const disabledEngine = new Engine([disabledActor], (message) => errors.push(message));
await disabledEngine.start();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(disabledActor.x, 0);
assert.equal(disabledActor.y, 7);
disabledEngine.stop();
assert.deepEqual(errors, []);
const variablesProject = newProject();
variablesProject.scenes[0].objects[0].code = { variables: [{ id: 'v1', name: '점수' }] };
const variableOther = object();
variableOther.code = { variables: [{ id: 'v2', name: '점수' }, { id: 'param', name: '매개변수' }], blocks: { blocks: [
  { type: 'procedures_defnoreturn', extraState: { params: [{ id: 'param', name: '매개변수' }] }, fields: { NAME: '함수' } },
] } };
variablesProject.scenes[0].objects.push(variableOther);
assert.deepEqual(projectVariables(variablesProject).map((v) => v.name), ['점수']);
renameProjectVariable(variablesProject, '점수', '획득 점수');
assert.equal(variablesProject.scenes[0].objects[0].code.variables[0].name, '획득 점수');
assert.equal(variableOther.code.variables[0].name, '획득 점수');
assert.equal(variableOther.code.variables[1].name, '매개변수');
console.log('PASS: scene deletion/duplication/rename links, variables, text, custom parameters, touch coordinates and disabled blocks');
