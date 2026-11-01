import * as Blockly from 'blockly';
import 'blockly/blocks';
import * as ko from 'blockly/msg/ko';

Blockly.setLocale(ko as any);

const defs: any[] = [
  { type: 'event_start', message0: '게임이 시작되었을 때', nextStatement: null, colour: 42 },
  { type: 'event_click', message0: '이 오브젝트를 클릭하거나 터치했을 때', nextStatement: null, colour: 42 },
  { type: 'stop_game', message0: '게임 실행 멈추기', previousStatement: null, colour: 30 },
  { type: 'set_text', message0: '글자 %1 표시하기', args0: [{ type: 'input_value', name: 'TEXT' }], previousStatement: null, nextStatement: null, colour: 285 },
  { type: 'pointer_position', message0: '마우스·터치 %1 좌표', args0: [{ type: 'field_dropdown', name: 'AXIS', options: [['X', 'X'], ['Y', 'Y']] }], output: 'Number', colour: 195 },
  { type: 'object_property', message0: '이 오브젝트의 %1', args0: [{ type: 'field_dropdown', name: 'PROPERTY', options: [['X 좌표', 'x'], ['Y 좌표', 'y'], ['방향', 'direction'], ['크기', 'size']] }], output: 'Number', colour: 210 },
  { type: 'stage_size', message0: '게임 화면 %1', args0: [{ type: 'field_dropdown', name: 'AXIS', options: [['너비', 'WIDTH'], ['높이', 'HEIGHT']] }], output: 'Number', colour: 195 },
  { type: 'elapsed_time', message0: '게임 경과 시간 (초)', output: 'Number', colour: 195 },
  { type: 'touching_target', message0: '오브젝트 %1 에 닿았는가?', args0: [{ type: 'field_input', name: 'TARGET', text: '오브젝트 1' }], output: 'Boolean', colour: 195 },
  { type: 'forever', message0: '계속 반복하기 %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 30 },
  { type: 'wait_seconds', message0: '%1 초 기다리기', args0: [{ type: 'input_value', name: 'N', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 30 },
  ...[['move_steps', '%1 만큼 움직이기'], ['change_x', 'x 좌표를 %1 만큼 바꾸기'], ['change_y', 'y 좌표를 %1 만큼 바꾸기'], ['direction', '방향을 %1 도로 정하기'], ['turn', '%1 도 회전하기'], ['set_size', '크기를 %1 %로 정하기'], ['change_size', '크기를 %1 만큼 바꾸기']].map(([type, message0]) => ({
    type, message0, args0: [{ type: 'input_value', name: 'N', check: 'Number' }],
    previousStatement: null, nextStatement: null, colour: type.includes('size') ? 285 : 210,
  })),
  { type: 'goto_xy', message0: 'x: %1 y: %2 위치로 이동하기', args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 210 },
  ...[['show_obj', '보이기'], ['hide_obj', '숨기기']].map(([type, message0]) => ({ type, message0, previousStatement: null, nextStatement: null, colour: 285 })),
  { type: 'play_sound', message0: '소리 %1 재생하기', args0: [{ type: 'field_input', name: 'SOUND', text: '기본 효과음' }], previousStatement: null, nextStatement: null, colour: 330 },
  { type: 'key_pressed', message0: '%1 키를 눌렀는가?', args0: [{ type: 'field_dropdown', name: 'KEY', options: [['오른쪽 화살표', 'ArrowRight'], ['왼쪽 화살표', 'ArrowLeft'], ['위쪽 화살표', 'ArrowUp'], ['아래쪽 화살표', 'ArrowDown'], ['스페이스', ' '], ['a', 'a'], ['d', 'd'], ['w', 'w'], ['s', 's']] }], output: 'Boolean', colour: 195 },
  { type: 'gamepad_pressed', message0: '게임패드 %1 버튼을 눌렀는가?', args0: [{ type: 'field_dropdown', name: 'BUTTON', options: [['A', 'A'], ['B', 'B'], ['X', 'X'], ['Y', 'Y'], ['왼쪽 위', 'L1'], ['오른쪽 위', 'R1'], ['시작', 'START'], ['위쪽', 'UP'], ['아래쪽', 'DOWN'], ['왼쪽', 'LEFT'], ['오른쪽', 'RIGHT']] }], output: 'Boolean', colour: 195 },
  { type: 'mouse_pressed', message0: '마우스 또는 화면을 누르고 있는가?', output: 'Boolean', colour: 195 },
  { type: 'touching', message0: '다른 오브젝트에 닿았는가?', output: 'Boolean', colour: 195 },
  { type: 'physics_enable', message0: '물리 켜기', previousStatement: null, nextStatement: null, colour: 15 },
  { type: 'physics_disable', message0: '물리 끄기', previousStatement: null, nextStatement: null, colour: 15 },
  { type: 'velocity_set', message0: '속도를 x: %1 y: %2 로 정하기', args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 15 },
  { type: 'impulse', message0: '힘을 x: %1 y: %2 만큼 더하기', args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 15 },
  { type: 'camera_set', message0: '카메라를 x: %1 y: %2 로 이동하기', args0: [{ type: 'input_value', name: 'X', check: 'Number' }, { type: 'input_value', name: 'Y', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 160 },
  { type: 'camera_zoom', message0: '카메라 배율을 %1 로 정하기', args0: [{ type: 'input_value', name: 'N', check: 'Number' }], previousStatement: null, nextStatement: null, colour: 160 },
  { type: 'camera_follow', message0: '카메라가 오브젝트 %1 따라가기', args0: [{ type: 'field_input', name: 'TARGET', text: '플레이어' }], previousStatement: null, nextStatement: null, colour: 160 },
  { type: 'switch_scene', message0: '장면 %1 로 바꾸기', args0: [{ type: 'field_input', name: 'NAME', text: '장면 2' }], previousStatement: null, nextStatement: null, colour: 160 },
];

Blockly.defineBlocksWithJsonArray(defs);

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const b = (type: string, inputs?: any) => ({ kind: 'block', type, ...(inputs ? { inputs } : {}) });
export const toolbox: any = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: '시작', colour: 42, contents: [b('event_start'), b('event_click')] },
    { kind: 'category', name: '흐름', colour: 30, contents: [b('forever'), b('controls_repeat_ext', { TIMES: num(10) }), b('controls_if'), { kind: 'block', type: 'controls_if', extraState: { hasElse: true } }, b('wait_seconds', { N: num(1) }), b('switch_scene'), b('stop_game')] },
    { kind: 'category', name: '움직임', colour: 210, contents: [...['move_steps', 'change_x', 'change_y', 'direction', 'turn'].map((type) => b(type, { N: num(type === 'direction' ? 90 : 10) })), b('goto_xy', { X: num(0), Y: num(0) })] },
    { kind: 'category', name: '생김새', colour: 285, contents: [b('show_obj'), b('hide_obj'), b('set_size', { N: num(100) }), b('change_size', { N: num(10) }), b('set_text', { TEXT: { shadow: { type: 'text', fields: { TEXT: '점수' } } } }), b('text'), b('text_join')] },
    { kind: 'category', name: '소리', colour: 330, contents: [b('play_sound')] },
    { kind: 'category', name: '판단', colour: 195, contents: [b('key_pressed'), b('gamepad_pressed'), b('mouse_pressed'), b('pointer_position'), b('touching'), b('touching_target'), b('object_property'), b('stage_size'), b('elapsed_time'), b('logic_compare'), b('logic_operation'), b('logic_negate'), b('logic_boolean')] },
    { kind: 'category', name: '계산', colour: 230, contents: [b('math_number'), b('math_arithmetic'), b('math_random_int', { FROM: num(1), TO: num(10) })] },
    { kind: 'category', name: '자료', colour: 330, custom: 'VARIABLE' },
    { kind: 'category', name: '물리', colour: 15, contents: [b('physics_enable'), b('physics_disable'), b('velocity_set', { X: num(0), Y: num(250) }), b('impulse', { X: num(0), Y: num(120) })] },
    { kind: 'category', name: '카메라', colour: 160, contents: [b('camera_set', { X: num(0), Y: num(0) }), b('camera_zoom', { N: num(1) }), b('camera_follow')] },
    { kind: 'category', name: '내 블록', colour: 290, custom: 'GAME_PROCEDURES' },
  ],
};

const condition = (key: string, axis: string, value: number, next?: any): any => ({
  type: 'controls_if',
  inputs: {
    IF0: { block: { type: 'key_pressed', fields: { KEY: key } } },
    DO0: { block: { type: axis, inputs: { N: num(value) } } },
  },
  ...(next ? { next: { block: next } } : {}),
});
const movement = condition('ArrowRight', 'change_x', 4,
  condition('ArrowLeft', 'change_x', -4,
    condition('ArrowUp', 'change_y', 4,
      condition('ArrowDown', 'change_y', -4))));
export const example: any = {
  blocks: { languageVersion: 0, blocks: [{ type: 'event_start', x: 35, y: 35, next: { block: { type: 'forever', inputs: { DO: { block: movement } } } } }] },
};
