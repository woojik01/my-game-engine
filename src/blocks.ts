import * as Blockly from 'blockly';
import 'blockly/blocks';
import * as ko from 'blockly/msg/ko';

Blockly.setLocale(ko as any);

const defs: any[] = [
  { type: 'event_start', message0: '시작하기 버튼을 클릭했을 때', nextStatement: null, colour: 42 },
  { type: 'event_click', message0: '이 오브젝트를 클릭했을 때', nextStatement: null, colour: 42 },
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
    { kind: 'category', name: '흐름', colour: 30, contents: [b('forever'), b('controls_repeat_ext', { TIMES: num(10) }), b('controls_