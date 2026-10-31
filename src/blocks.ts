import * as Blockly from 'blockly';
import 'blockly/blocks';
import * as ko from 'blockly/msg/ko';
Blockly.setLocale(ko as any);
const defs:any[] = [
 {type:'event_start',message0:'시작하기 버튼을 클릭했을 때',nextStatement:null,colour:42},
 {type:'event_click',message0:'이 오브젝트를 클릭했을 때',nextStatement:null,colour:42},
 {type:'forever',message0:'계속 반복하기 %1 %2',args0:[{type:'input_dummy'},{type:'input_statement',name:'DO'}],previousStatement:null,nextStatement:null,colour:30},
 {type:'wait_seconds',message0:'%1 초 기다리기',args0:[{type:'input_value',name:'N',check:'Number'}],previousStatement:null,nextStatement:null,colour:30},
 ...[['move_steps','%1 만큼 움직이기'],['change_x','x 좌표를 %1 만큼 바꾸기'],['change_y','y 좌표를 %1 만큼 바꾸기'],['direction','방향을 %1 도로 정하기'],['turn','%1 도 회전하기'],['set_size','크기를 %1 %로 정하기'],['change_size','크기를 %1 만큼 바꾸기']].map(([type,message0])=>({type,message0,args0:[{type:'input_value',name:'N',check:'Number'}],previousStatement:null,nextStatement:null,colour:type.includes('size')?285:210})),
 {type:'goto_xy',message0:'x: %1 y: %2 위치로 이동하기',args0:[{type:'input_value',name:'X',check:'Number'},{type:'input_value',name:'Y',check:'Number'}],previousStatement:null,nextStatement:null,colour:210},
 ...[['show_obj','보이기'],['hide_obj','숨기기'],['play_sound','효과음 재생하기']].map(([type,message0])=>({type,message0,previousStatement:null,nextStatement:null,colour:type==='play_sound'?330:285})),
 {type:'key_pressed',message0:'%1 키를 눌렀는가?',args0:[{type:'field_dropdown',name:'KEY',options:[['오른쪽 화살표','ArrowRight'],['왼쪽 화살표','ArrowLeft'],['위쪽 화살표','ArrowUp'],['아래쪽 화살표','ArrowDown'],['스페이스',' '],['a','a'],['d','d'],['w','w'],['s','s']]}],output:'Boolean',colour:195},
 {type:'mouse_pressed',message0:'마우스 또는 화면을 누르고 있는가?',output:'Boolean',colour:195},
 {type:'touching',message0:'다른 오브젝트에 닿았는가?',output:'Boolean',colour:195}
];
Blockly.defineBlocksWithJsonArray(defs);
const num=(n:number)=>({shadow:{type:'math_number',fields:{NUM:n}}});
const b=(type:string,inputs?:any)=>({kind:'block',type,...(inputs?{inputs}:{})});
export const toolbox:any={kind:'categoryToolbox',contents:[
 {kind:'category',name:'시작',colour:42,contents:[b('event_start'),b('event_click')]},
 {kind:'category',name:'흐름',colour:30,contents:[b('forever'),b('controls_repeat_ext',{TIMES:num(10)}),b('controls_if'),{kind:'block',type:'controls_if',extraState:{hasElse:true}},b('wait_seconds',{N:num(1)})]},
 {kind:'category',name:'움직임',colour:210,contents:[...['move_steps','change_x','change_y','direction','turn'].map(t=>b(t,{N:num(t==='direction'?90:10)})),b('goto_xy',{X:num(0),Y:num(0)})]},
 {kind:'category',name:'생김새',colour:285,contents:[b('show_obj'),b('hide_obj'),b('set_size',{N:num(100)}),b('change_size',{N:num(10)})]},
 {kind:'category',name:'소리',colour:330,contents:[b('play_sound')]},
 {kind:'category',name:'판단',colour:195,contents:[b('key_pressed'),b('mouse_pressed'),b('touching'),b('logic_compare'),b('logic_operation'),b('logic_negate'),b('logic_boolean')]},
 {kind:'category',name:'계산',colour:230,contents:[b('math_number'),b('math_arithmetic'),b('math_random_int',{FROM:num(1),TO:num(10)})]},
 {kind:'category',name:'자료',colour:330,custom:'VARIABLE'}
]};
const condition = (key:string, axis:string, n:number, next?:any):any => ({type:'controls_if',inputs:{IF0:{block:{type:'key_pressed',fields:{KEY:key}}},DO0:{block:{type:axis,inputs:{N:num(n)}}}},...(next?{next:{block:next}}:{})});
const movement=condition('ArrowRight','change_x',4,condition('ArrowLeft','change_x',-4,condition('ArrowUp','change_y',4,condition('ArrowDown','change_y',-4))));
export const example:any={blocks:{languageVersion:0,blocks:[{type:'event_start',x:35,y:35,next:{block:{type:'forever',inputs:{DO:{block:movement}}}}}]}};
