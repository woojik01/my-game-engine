import { Project } from './runtime';
import { engineFactory } from './runtimeCore.js';
import { createStage } from './stageCore.js';

/** Embed the same runtime and renderer used by the editor, with all project data. */
export function exportHtml(project: Project): string {
  const { width, height } = project.resolution;
  const data = JSON.stringify(project).replace(/</g, '\\u003c');
  const title = project.name.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const script = [
    '(function(){"use strict";',
    'const P=JSON.parse(document.getElementById("project-data").textContent);',
    'const Engine=(' + engineFactory.toString() + ')();',
    'const mountStage=(' + createStage.toString() + ');',
    'const initial=P.scenes.find(s=>s.id===P.sceneId)||P.scenes[0];',
    'const engine=new Engine(JSON.parse(JSON.stringify(initial.objects)),message=>console.error(message),{scenes:P.scenes,sceneId:initial.id,resolution:P.resolution,sounds:P.sounds});',
    'mountStage(document.getElementById("game"),()=>({background:(P.scenes.find(s=>s.id===engine.sceneId)||initial).background,objects:engine.objects,camera:engine.camera,resolution:P.resolution,running:true,engine}));',
    'void engine.start();})();',
  ].join('\n');
  const widthByHeight = Number((width / height * 100).toFixed(5));
  const heightByWidth = Number((height / width * 100).toFixed(5));
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101827"><title>' +
    title + '</title><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#101827}body{overscroll-behavior:none;user-select:none;-webkit-user-select:none}#game{position:fixed;left:50%;top:50%;display:block;transform:translate(-50%,-50%);width:min(100vw,' + widthByHeight + 'vh);height:min(100vh,' + heightByWidth + 'vw);max-width:100vw;max-height:100vh;aspect-ratio:' + width + '/' + height + ';background:#eef5ff;touch-action:none;outline:none}@supports(height:100dvh){#game{width:min(100vw,' + widthByHeight + 'dvh);height:min(100dvh,' + heightByWidth + 'vw);max-height:100dvh}}</style></head><body><canvas id="game" tabindex="0" width="' + width + '" height="' + height + '" aria-label="게임 화면"></canvas><script type="application/json" id="project-data">' +
    data + '</script><script>' + script + '</script></body></html>';
}
