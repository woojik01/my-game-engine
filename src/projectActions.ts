import { newProject, Project, uid } from './runtime';

export function visitBlocks(code: any, visit: (block: any) => void) {
  const walk = (block: any) => {
    if (!block) return;
    visit(block);
    for (const input of Object.values(block.inputs || {}) as any[]) walk(input.block || input.shadow);
    walk(block.next?.block);
  };
  for (const block of code?.blocks?.blocks || []) walk(block);
}

export function uniqueName(name: string, existing: string[]) {
  if (!existing.includes(name)) return name;
  let n = 2;
  while (existing.includes(name + ' ' + n)) n++;
  return name + ' ' + n;
}

export function addProjectScene(project: Project) {
  const scene = newProject().scenes[0];
  let n = 1;
  while (project.scenes.some((s) => s.name === '장면 ' + n)) n++;
  scene.name = '장면 ' + n;
  project.scenes.push(scene);
  project.sceneId = scene.id;
  project.selectedId = scene.objects[0].id;
}

export function deleteProjectScene(project: Project, id: string) {
  if (project.scenes.length <= 1) return false;
  const index = project.scenes.findIndex((s) => s.id === id);
  if (index < 0) return false;
  project.scenes.splice(index, 1);
  if (project.sceneId === id) {
    const next = project.scenes[Math.min(index, project.scenes.length - 1)];
    project.sceneId = next.id;
    project.selectedId = next.objects[0].id;
  }
  return true;
}

export function duplicateProjectScene(project: Project, id: string) {
  const source = project.scenes.find((s) => s.id === id);
  if (!source) return;
  const copy = structuredClone(source);
  copy.id = uid();
  copy.name = uniqueName(source.name + ' 복사', project.scenes.map((s) => s.name));
  const ids = new Map(copy.objects.map((obj) => [obj.id, uid()]));
  for (const obj of copy.objects) {
    obj.id = ids.get(obj.id)!;
    visitBlocks(obj.code, (block) => {
      if (['camera_follow', 'touching_target'].includes(block.type) && ids.has(block.fields?.TARGET)) block.fields.TARGET = ids.get(block.fields.TARGET);
      if (block.type === 'switch_scene') {
        if (block.fields?.NAME === source.id) block.fields.NAME = copy.id;
        else if (block.fields?.NAME === source.name) block.fields.NAME = copy.name;
      }
    });
  }
  if (copy.camera.followId) copy.camera.followId = ids.get(copy.camera.followId);
  project.scenes.splice(project.scenes.indexOf(source) + 1, 0, copy);
  project.sceneId = copy.id;
  project.selectedId = copy.objects[0].id;
}

export function renameProjectScene(project: Project, id: string, requested: string) {
  const scene = project.scenes.find((s) => s.id === id);
  if (!scene) return;
  const name = requested.trim().slice(0, 80) || scene.name;
  const replacement = uniqueName(name, project.scenes.filter((s) => s.id !== id).map((s) => s.name));
  const previous = scene.name;
  scene.name = replacement;
  for (const s of project.scenes) for (const obj of s.objects) visitBlocks(obj.code, (block) => {
    if (block.type === 'switch_scene' && block.fields?.NAME === previous) block.fields.NAME = replacement;
  });
}

export function renameProjectObject(project: Project, id: string, requested: string) {
  const scene = project.scenes.find((s) => s.id === project.sceneId)!;
  const obj = scene.objects.find((o) => o.id === id);
  if (!obj) return;
  const previous = obj.name;
  obj.name = uniqueName(requested.trim().slice(0, 80) || previous, scene.objects.filter((o) => o.id !== id).map((o) => o.name));
  for (const target of scene.objects) visitBlocks(target.code, (block) => {
    if (['camera_follow', 'touching_target'].includes(block.type) && block.fields?.TARGET === previous) block.fields.TARGET = obj.name;
  });
}

export function projectIssues(project: Project) {
  const issues: string[] = [];
  for (const scene of project.scenes) for (const obj of scene.objects) visitBlocks(obj.code, (block) => {
    if (block.enabled === false || block.disabledReasons?.length) return;
    const value = block.fields || {};
    if (block.type === 'switch_scene' && !project.scenes.some((s) => s.id === value.NAME || s.name === value.NAME)) issues.push(scene.name + ' / ' + obj.name + ': 장면 "' + value.NAME + '" 없음');
    if (['camera_follow', 'touching_target'].includes(block.type) && !scene.objects.some((o) => o.id === value.TARGET || o.name === value.TARGET)) issues.push(scene.name + ' / ' + obj.name + ': 오브젝트 "' + value.TARGET + '" 없음');
    if (block.type === 'play_sound' && value.SOUND !== '기본 효과음' && !project.sounds.some((s) => s.id === value.SOUND || s.name === value.SOUND)) issues.push(scene.name + ' / ' + obj.name + ': 소리 "' + value.SOUND + '" 없음');
  });
  return [...new Set(issues)];
}

function parameterIds(code: any) {
  const ids = new Set<string>();
  visitBlocks(code, (block) => {
    if (block.type === 'procedures_defnoreturn') for (const param of block.extraState?.params || []) if (param.id) ids.add(param.id);
  });
  return ids;
}

export function projectVariables(project: Project) {
  const variables = new Map<string, { id: string; name: string; type?: string }>();
  for (const scene of project.scenes) for (const obj of scene.objects) {
    const params = parameterIds(obj.code);
    for (const variable of obj.code?.variables || []) {
      if (typeof variable.name === 'string' && !params.has(variable.id)) variables.set((variable.type || '') + ':' + variable.name, variable);
    }
  }
  return [...variables.values()];
}

export function renameProjectVariable(project: Project, previous: string, name: string) {
  for (const scene of project.scenes) for (const obj of scene.objects) {
    const params = parameterIds(obj.code);
    for (const variable of obj.code?.variables || []) {
      if (variable.name === previous && !params.has(variable.id)) variable.name = name;
    }
    visitBlocks(obj.code, (block) => {
      if (block.fields?.VAR === previous) block.fields.VAR = name;
    });
  }
}
