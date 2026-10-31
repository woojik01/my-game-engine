import * as Blockly from 'blockly';
import './blocks';
export type Obj={id:string,name:string,x:number,y:number,size:number,direction:number,visible:boolean,shape:string,color:string,image?:string,code:any};
export type Scene={id:string,name:string,background:string,objects:Obj[]};
export type Project={version:number,name:string,scenes:Scene[],sceneId:string,selectedId:string};
export const uid=()=>crypto.randomUUID();
export const object=(name='오브젝트'):Obj=>({id:uid(),name,x:0,y:0,size:100,direction:90,visible:true,shape:'circle',color:'#4b87ef',code:{}});
export function newProject(withExample=false):Project {const a=object('플레이어'); if(withExample){a.code=structuredClone(exampleRef());} const s={id:uid(),name:'장면 1',background:'#eef5ff',objects:[a]};return {version:1,name:withExample?'첫 번째 게임':'새 프로젝트',scenes:[s],sceneId:s.id,selectedId:a.id};}
import {example} from './blocks';
function exampleRef(){return example;}
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
export class Engine {
 active=true; keys=new Set<string>(); mouse=false; vars:Record<string,any>={}; workspaces=new Map<string,Blockly.Workspace>(); onError:(s:string)=>void;
 constructor(public objects:Obj[],onError:(s:string)=>void){this.onError=onError;}
 stop(){this.active=false;this.workspaces.forEach(w=>w.dispose());this.workspaces.clear();}
 async start(){ for(const o of this.objects){const ws=new Blockly.Workspace();try{Blockly.serialization.workspaces.load(o.code||{},ws);this.workspaces.set(o.id,ws);for(const root of ws.getTopBlocks(true)){if(root.type==='event_start')this.launch(root.getNextBlock(),o);}}catch(e){ws.dispose();this.onError(`${o.name}의 블록을 읽지 못했습니다: ${String(e)}`);}} }
 click(o:Obj){const w=this.workspaces.get(o.id); if(!w)return; for(const root of w.getTopBlocks(true))if(root.type==='event_click')this.launch(root.getNextBlock(),o);}
 async launch(b:any,o:Obj){try{await this.run(b,o)}catch(e){if(this.active)this.onError(`${o.name}: ${e instanceof Error?e.message:String(e)}`)}}
 val(b:any,o:Obj,n:string,defaultValue:any=0){const c=b.getInputTargetBlock(n);return c?this.eval(c,o):defaultValue;}
 eval(b:any,o:Obj):any{const v=(n:string,d:any=0)=>this.val(b,o,n,d),f=(n:string)=>b.getFieldValue(n);switch(b.type){
 case 'math_number':return Number(f('NUM'));case 'logic_boolean':return f('BOOL')==='TRUE';case 'key_pressed':return this.keys.has(f('KEY'));case 'mouse_pressed':return this.mouse;
 case 'touching':return this.objects.some(t=>t!==o&&t.visible&&o.visible&&Math.abs(t.x-o.x)<(t.size+o.size)*.3&&Math.abs(t.y-o.y)<(t.size+o.size)*.3);
 case 'variables_get':return this.vars[f('VAR')]??0;
 case 'logic_negate':return !v('BOOL');case 'logic_operation':return f('OP')==='AND'?v('A')&&v('B'):v('A')||v('B');
 case 'logic_compare':{const a=v('A'),c=v('B');return ({EQ:()=>a==c,NEQ:()=>a!=c,LT:()=>a<c,LTE:()=>a<=c,GT:()=>a>c,GTE:()=>a>=c} as any)[f('OP')]?.()??false;}
 case 'math_arithmetic':{let a=Number(v('A')),c=Number(v('B'));switch(f('OP')){case 'ADD':return a+c;case 'MINUS':return a-c;case 'MULTIPLY':return a*c;case 'DIVIDE':if(c===0)throw Error('0으로 나눌 수 없습니다.');return a/c;case 'POWER':return a**c;}return 0;}
 case 'math_random_int':{let a=Math.ceil(Number(v('FROM'))),c=Math.floor(Number(v('TO')));if(c<a)[a,c]=[c,a];return Math.floor(Math.random()*(c-a+1))+a;}
 default:throw Error(`지원하지 않는 값 블록: ${b.type}`);}}
 async run(block:any,o:Obj){let count=0;for(let b=block; b&&this.active;b=b.getNextBlock()) {if(++count%50===0)await frame();if(!this.active)return;const v=(n:string,d:any=0)=>Number(this.val(b,o,n,d));switch(b.type){
 case 'forever':while(this.active){await this.run(b.getInputTargetBlock('DO'),o);await frame();}break;
 case 'controls_repeat_ext':for(let i=0,n=Math.max(0,Math.min(100000,Math.floor(v('TIMES'))));i<n&&this.active;i++){await this.run(b.getInputTargetBlock('DO'),o);if(i%50===0)await frame();}break;
 case 'controls_if':{let done=false;for(let i=0;b.getInput('IF'+i);i++)if(this.val(b,o,'IF'+i,false)){await this.run(b.getInputTargetBlock('DO'+i),o);done=true;break;}if(!done&&b.getInput('ELSE'))await this.run(b.getInputTargetBlock('ELSE'),o);break;}
 case 'wait_seconds':{const end=performance.now()+Math.max(0,v('N'))*1000;do{await frame()}while(this.active&&performance.now()<end);break;}
 case 'move_steps':o.x+=Math.sin(o.direction*Math.PI/180)*v('N');o.y+=Math.cos(o.direction*Math.PI/180)*v('N');break;
 case 'change_x':o.x+=v('N');break;case 'change_y':o.y+=v('N');break;case 'goto_xy':o.x=v('X');o.y=v('Y');break;case 'direction':o.direction=v('N');break;case 'turn':o.direction+=v('N');break;
 case 'show_obj':o.visible=true;break;case 'hide_obj':o.visible=false;break;case 'set_size':o.size=Math.max(1,v('N'));break;case 'change_size':o.size=Math.max(1,o.size+v('N'));break;
 case 'variables_set':this.vars[b.getFieldValue('VAR')]=this.val(b,o,'VALUE');break;case 'math_change':{const id=b.getFieldValue('VAR');this.vars[id]=Number(this.vars[id]||0)+v('DELTA');break;}
 case 'play_sound':try{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=440;gain.gain.value=.06;osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.12);osc.onended=()=>ctx.close();}catch{/* unavailable audio is nonfatal */}break;
 default:throw Error(`지원하지 않는 명령 블록: ${b.type}`);
 }}}
}
